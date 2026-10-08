import { z } from "zod";
import { type Signal } from "./signaling";
import { wireSchema, type Wire } from "./protocol";

const signalingMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready") }),
  z.object({ type: z.literal("peer"), peer: z.string() }),
  z.object({ type: z.literal("left"), peer: z.string() }),
  z.object({ type: z.literal("host-online") }),
  z.object({ type: z.literal("host-offline") }),
  z.object({
    type: z.literal("signal"),
    from: z.string(),
    description: z
      .object({ type: z.enum(["offer", "answer"]), sdp: z.string() })
      .optional(),
    candidate: z
      .object({
        candidate: z.string(),
        sdpMid: z.string().nullable(),
        sdpMLineIndex: z.number().nullable(),
        usernameFragment: z.string().nullable().optional(),
      })
      .optional(),
  }),
]);
const chunkSchema = z.object({
  type: z.literal("chunk"),
  index: z.number().int().min(0).max(699),
  count: z.number().int().min(1).max(700),
  text: z.string().max(12000),
});
type Peer = {
  pc: RTCPeerConnection;
  channel?: RTCDataChannel;
  candidates: RTCIceCandidateInit[];
  incoming: string[];
  count: number;
  outgoing: Promise<void>;
  queuedBytes: number;
  closed: boolean;
  suspended: boolean;
  messages: number;
  window: number;
};
type Options = {
  endpoint: string;
  room: string;
  role: "host" | "guest";
  secret: string;
  credential?: string;
  peer: string;
  open: (peer: string) => void;
  message: (peer: string, message: Wire) => Promise<void> | void;
  close: (peer: string) => void;
  status: (connected: boolean, error?: string, expired?: boolean) => void;
};
export class PeerTransport {
  private ws?: WebSocket;
  private peers = new Map<string, Peer>();
  private timer?: ReturnType<typeof setTimeout>;
  private iceTimer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private attempts = 0;
  private ice: RTCIceServer[] = [];
  private iceFetchedAt = 0;
  private remoteHost?: string;
  private offline = () => {
    for (const id of [...this.peers.keys()]) this.drop(id);
    this.options.status(false);
    this.ws?.close();
  };
  private online = () => {
    if (!this.stopped && this.ws?.readyState !== WebSocket.OPEN) {
      clearTimeout(this.timer);
      this.connect();
    }
  };
  constructor(private options: Options) {
    window.addEventListener("offline", this.offline);
    window.addEventListener("online", this.online);
  }
  async start() {
    try {
      await this.refreshIce();
      if (!this.stopped) this.connect();
    } catch (error) {
      this.options.status(
        false,
        error instanceof Error ? error.message : "Could not connect.",
      );
      throw error;
    }
  }
  private async refreshIce() {
    const response = await fetch(
      `${this.options.endpoint}/rooms/${this.options.room}/ice`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${this.options.secret}` },
      },
    );
    const value = await response.json();
    if (this.stopped) return;
    if (!response.ok) {
      if (response.status === 410) {
        this.options.status(false, value.error, true);
        this.stop();
      }
      throw new Error(value.error ?? "Phone joining is unavailable.");
    }
    this.ice = z
      .object({
        iceServers: z.array(
          z.object({
            urls: z.union([z.string(), z.array(z.string())]),
            username: z.string().optional(),
            credential: z.string().optional(),
          }),
        ),
      })
      .parse(value).iceServers;
    this.iceFetchedAt = Date.now();
    for (const peer of this.peers.values())
      peer.pc.setConfiguration({
        ...peer.pc.getConfiguration(),
        iceServers: this.ice,
      });
    clearTimeout(this.iceTimer);
    if (!this.stopped && this.ice.some((server) => server.credential))
      this.iceTimer = setTimeout(
        () => {
          void this.refreshIce().catch(() => {
            this.options.status(
              false,
              "Connection credentials could not be refreshed. Reconnect to try again.",
            );
          });
        },
        40 * 60 * 1000,
      );
  }
  private connect() {
    if (this.stopped || !navigator.onLine) return;
    if (Date.now() - this.iceFetchedAt > 50 * 60 * 1000) {
      void this.start().catch(() => {});
      return;
    }
    const url = new URL(`${this.options.endpoint}/rooms/${this.options.room}`);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () =>
      this.signal({
        type: "auth",
        role: this.options.role,
        secret: this.options.secret,
        credential: this.options.credential,
        peer: this.options.peer,
      });
    // Serialize negotiation to avoid ICE/description races.
    let queue = Promise.resolve();
    ws.onmessage = (event) => {
      queue = queue
        .then(async () => {
          if (this.stopped || this.ws !== ws) return;
          const data = signalingMessage.parse(JSON.parse(event.data));
          if (data.type === "ready") {
            this.attempts = 0;
            this.options.status(true);
          } else if (data.type === "peer" && this.options.role === "host")
            await this.offer(data.peer);
          else if (data.type === "left") this.drop(data.peer);
          else if (data.type === "host-offline") {
            for (const id of this.peers.keys()) this.drop(id);
            this.options.status(false);
          } else if (data.type === "signal") await this.receiveSignal(data);
        })
        .catch(() =>
          this.options.status(
            false,
            "Connection negotiation failed. Reconnect to try again.",
          ),
        );
    };
    ws.onclose = (event) => {
      if (this.stopped || this.ws !== ws) return;
      for (const id of [...this.peers.keys()]) this.drop(id);
      this.options.status(
        false,
        event.code === 1008 ? event.reason : undefined,
        event.code === 4001,
      );
      if (!this.stopped && ![1008, 4000, 4001].includes(event.code))
        this.timer = setTimeout(
          () => this.connect(),
          Math.min(15_000, 1000 * 2 ** this.attempts++),
        );
    };
    ws.onerror = () => {
      if (!this.stopped) this.options.status(false);
    };
  }
  private signal(data: Signal) {
    if (this.ws?.readyState === WebSocket.OPEN)
      this.ws.send(JSON.stringify(data));
  }
  private peer(id: string): Peer {
    this.drop(id);
    const pc = new RTCPeerConnection({
      iceServers: this.ice,
      iceTransportPolicy:
        import.meta.env.VITE_ICE_TRANSPORT_POLICY === "relay" ? "relay" : "all",
    });
    const peer: Peer = {
      pc,
      candidates: [],
      incoming: [],
      count: 0,
      outgoing: Promise.resolve(),
      queuedBytes: 0,
      closed: false,
      suspended: false,
      messages: 0,
      window: Date.now(),
    };
    this.peers.set(id, peer);
    pc.onicecandidate = (event) => {
      if (event.candidate)
        this.signal({
          type: "signal",
          to: id,
          candidate: event.candidate.toJSON() as Extract<
            Signal,
            { type: "signal" }
          >["candidate"],
        });
    };
    pc.onconnectionstatechange = () => {
      if (peer.closed) return;
      if (
        pc.connectionState === "connected" &&
        peer.suspended &&
        peer.channel?.readyState === "open"
      ) {
        peer.suspended = false;
        this.options.open(id);
      }

      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
        peer.suspended = true;
        this.options.close(id);
        // Reopen signaling to trigger a fresh connection; never submit offline actions.
        if (this.options.role === "guest" && pc.connectionState === "failed")
          this.ws?.close();
      }
    };
    pc.ondatachannel = (event) => this.bind(id, peer, event.channel);
    return peer;
  }
  private async offer(id: string) {
    const peer = this.peer(id);
    this.bind(
      id,
      peer,
      peer.pc.createDataChannel("playkit-v1", { ordered: true }),
    );
    await peer.pc.setLocalDescription(await peer.pc.createOffer());
    this.signal({
      type: "signal",
      to: id,
      description: { type: "offer", sdp: peer.pc.localDescription!.sdp },
    });
  }
  private async receiveSignal(
    data: Extract<z.infer<typeof signalingMessage>, { type: "signal" }>,
  ) {
    let peer = this.peers.get(data.from);
    if (data.description?.type === "offer" && this.options.role === "guest") {
      this.remoteHost = data.from;
      peer = this.peer(data.from);
    }
    if (!peer) return;
    if (data.description) {
      await peer.pc.setRemoteDescription(data.description);
      for (const candidate of peer.candidates.splice(0))
        await peer.pc.addIceCandidate(candidate);
      if (data.description.type === "offer") {
        await peer.pc.setLocalDescription(await peer.pc.createAnswer());
        this.signal({
          type: "signal",
          to: data.from,
          description: { type: "answer", sdp: peer.pc.localDescription!.sdp },
        });
      }
    }
    if (data.candidate) {
      if (peer.pc.remoteDescription)
        await peer.pc.addIceCandidate(data.candidate);
      else peer.candidates.push(data.candidate);
    }
  }
  private bind(id: string, peer: Peer, channel: RTCDataChannel) {
    peer.channel = channel;
    channel.onopen = () => this.options.open(id);
    channel.onclose = () => {
      if (!peer.closed) this.options.close(id);
    };
    let queue = Promise.resolve();
    channel.onmessage = (event) => {
      queue = queue
        .then(async () => {
          if (typeof event.data !== "string" || event.data.length > 50_000)
            throw new Error("Invalid peer message.");
          const chunk = chunkSchema.parse(JSON.parse(event.data));
          if (this.options.role === "host" && chunk.count > 2)
            throw new Error("Player messages must be small.");
          if (
            chunk.index !== peer.incoming.length ||
            (chunk.index !== 0 && chunk.count !== peer.count)
          )
            throw new Error("Invalid message sequence.");
          if (chunk.index === 0) peer.count = chunk.count;
          peer.incoming.push(chunk.text);
          if (peer.incoming.length === peer.count) {
            const text = peer.incoming.join("");
            peer.incoming = [];
            if (Date.now() - peer.window > 60_000) {
              peer.messages = 0;
              peer.window = Date.now();
            }
            if (++peer.messages > 120)
              throw new Error("Too many peer messages.");
            await this.options.message(id, wireSchema.parse(JSON.parse(text)));
          }
        })
        .catch(() => {
          this.drop(id);
          this.options.status(false, "An invalid phone message was rejected.");
        });
    };
  }
  send(id: string, message: Wire) {
    const peer = this.peers.get(id);
    if (!peer?.channel || peer.channel.readyState !== "open") return;
    const text = JSON.stringify(message);
    if (text.length > 8_400_000) {
      this.options.status(
        false,
        "This table history is too large to synchronize.",
      );
      return;
    }
    if (peer.queuedBytes + text.length > 16_800_000) {
      this.drop(id);
      return;
    }
    peer.queuedBytes += text.length;
    const count = Math.ceil(text.length / 12000);
    peer.outgoing = peer.outgoing
      .then(async () => {
        const channel = peer.channel!;
        for (let index = 0; index < count && !peer.closed; index++) {
          while (
            channel.bufferedAmount > 256_000 &&
            channel.readyState === "open" &&
            !peer.closed
          )
            await new Promise((resolve) => setTimeout(resolve, 20));
          if (channel.readyState !== "open" || peer.closed) return;
          channel.send(
            JSON.stringify({
              type: "chunk",
              index,
              count,
              text: text.slice(index * 12000, (index + 1) * 12000),
            }),
          );
        }
      })
      .catch(() => this.drop(id))
      .finally(() => {
        peer.queuedBytes -= text.length;
      });
  }
  sendHost(message: Wire) {
    if (this.remoteHost) this.send(this.remoteHost, message);
  }
  private drop(id: string) {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id);
    peer.closed = true;
    peer.channel?.close();
    peer.pc.close();
    this.options.close(id);
  }
  stop() {
    this.stopped = true;
    window.removeEventListener("offline", this.offline);
    window.removeEventListener("online", this.online);
    clearTimeout(this.timer);
    clearTimeout(this.iceTimer);
    this.ws?.close();
    for (const id of [...this.peers.keys()]) this.drop(id);
  }
}
