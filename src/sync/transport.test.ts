import { afterEach, expect, it, vi } from "vitest";
import { PeerTransport } from "./transport";

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 1;
  sent: Record<string, unknown>[] = [];
  onmessage?: (event: { data: string }) => void;
  onopen?: () => void;
  constructor() {
    Socket.instances.push(this);
  }
  send(message: string) {
    this.sent.push(JSON.parse(message));
  }
  close() {
    this.readyState = 3;
  }
  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}
const candidate = {
  candidate: "candidate:1 1 udp 1 127.0.0.1 1234 typ host",
  sdpMid: "0",
  sdpMLineIndex: 0,
  usernameFragment: "fresh",
};
class Connection {
  static instances: Connection[] = [];
  onicecandidate?: (event: {
    candidate: { toJSON: () => typeof candidate };
  }) => void;
  localDescription?: { type: string; sdp: string };
  finishDescription?: () => void;
  constructor() {
    Connection.instances.push(this);
  }
  createDataChannel() {
    return { close() {} };
  }
  async createOffer() {
    return { type: "offer", sdp: "offer without gathered candidates" };
  }
  async createAnswer() {
    return { type: "answer", sdp: "answer without gathered candidates" };
  }
  async setRemoteDescription() {}
  async setLocalDescription(description: { type: string; sdp: string }) {
    // Gathering can begin before the setLocalDescription promise resolves.
    this.onicecandidate?.({ candidate: { toJSON: () => candidate } });
    await new Promise<void>((resolve) => {
      this.finishDescription = () => {
        this.localDescription = description;
        resolve();
      };
    });
  }
  close() {}
}
let transport: PeerTransport | undefined;
afterEach(() => {
  transport?.stop();
  transport = undefined;
  Socket.instances = [];
  Connection.instances = [];
  vi.unstubAllGlobals();
});
async function start(role: "host" | "guest") {
  vi.stubGlobal("window", { addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ iceServers: [] }) }),
  );
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("RTCPeerConnection", Connection);
  transport = new PeerTransport({
    endpoint: "http://signaling.test",
    room: "room",
    role,
    secret: "secret",
    peer: "local",
    open() {},
    message() {},
    close() {},
    status() {},
  });
  await transport.start();
  return Socket.instances[0];
}
it.each(["host", "guest"] as const)(
  "%s sends its description before early ICE candidates",
  async (role) => {
    const socket = await start(role);
    socket.receive(
      role === "host"
        ? { type: "peer", peer: "remote" }
        : {
            type: "signal",
            from: "remote",
            description: { type: "offer", sdp: "remote offer" },
          },
    );
    await vi.waitFor(() =>
      expect(Connection.instances[0]?.finishDescription).toBeDefined(),
    );
    expect(socket.sent).toEqual([]);
    Connection.instances[0].finishDescription!();
    await vi.waitFor(() => expect(socket.sent).toHaveLength(2));
    expect(socket.sent[0]).toMatchObject({
      type: "signal",
      to: "remote",
      description: { type: role === "host" ? "offer" : "answer" },
    });
    expect(socket.sent[1]).toEqual({ type: "signal", to: "remote", candidate });
  },
);
it("a stopped negotiation cannot publish queued candidates or its description", async () => {
  const socket = await start("host");
  socket.receive({ type: "peer", peer: "remote" });
  await vi.waitFor(() =>
    expect(Connection.instances[0]?.finishDescription).toBeDefined(),
  );
  transport!.stop();
  Connection.instances[0].onicecandidate?.({
    candidate: { toJSON: () => candidate },
  });
  Connection.instances[0].finishDescription!();
  // Drain the serialized signaling queue after the canceled description resolves.
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(socket.sent).toEqual([]);
});
