import { signalSchema, token } from "../src/sync/signaling";

interface Env {
  ROOMS: DurableObjectNamespace;
  ALLOWED_ORIGINS: string;
  ALLOW_LOCAL_ICE?: string;
  TURN_KEY_ID?: string;
  TURN_API_TOKEN?: string;
}
type Metadata = {
  host: string;
  invitation: string;
  expires: number;
  iceCount: number;
  devices: Record<string, string>;
};
type Attachment = {
  role?: "host" | "guest";
  peer?: string;
  window: number;
  count: number;
  deadline: number;
};
const lifetime = 12 * 60 * 60 * 1000;
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
const secret = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
async function hash(value: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    if (!origin || !env.ALLOWED_ORIGINS.split(",").includes(origin))
      return json({ error: "Origin is not allowed." }, 403);
    const headers = {
      "Access-Control-Allow-Origin": origin,
      Vary: "Origin",
      "Access-Control-Allow-Headers": "Authorization,Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers });
    const url = new URL(request.url);
    let response: Response;
    if (url.pathname === "/rooms" && request.method === "POST") {
      const ip = request.headers.get("CF-Connecting-IP") ?? "local";
      const limiter = env.ROOMS.get(
        env.ROOMS.idFromName(`limit:${await hash(ip)}`),
      );
      const allowed = await limiter.fetch(
        new Request("https://internal/limit", { method: "POST" }),
      );
      if (!allowed.ok)
        return new Response(allowed.body, { status: 429, headers });
      const room = secret();
      response = await env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(
        new Request("https://internal/create", { method: "POST" }),
      );
      if (response.ok)
        response = json({ room, ...((await response.json()) as object) });
    } else {
      const match = /^\/rooms\/([A-Za-z0-9_-]{43})(\/ice)?$/.exec(url.pathname);
      if (!match) return json({ error: "Not found." }, 404);
      response = await env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(
        request,
      );
    }
    if (response.status === 101) return response;
    const result = new Response(response.body, response);
    Object.entries(headers).forEach(([key, value]) =>
      result.headers.set(key, value),
    );
    return result;
  },
} satisfies ExportedHandler<Env>;

export class Room {
  constructor(
    private ctx: DurableObjectState,
    private env: Env,
  ) {}
  private send(ws: WebSocket, data: unknown) {
    try {
      ws.send(JSON.stringify(data));
    } catch {
      /* Closing peers receive nothing. */
    }
  }
  private peers() {
    return this.ctx
      .getWebSockets()
      .filter((ws) => (ws.deserializeAttachment() as Attachment).role);
  }
  private host() {
    return this.peers().find(
      (ws) =>
        ws.readyState === 1 &&
        (ws.deserializeAttachment() as Attachment).role === "host",
    );
  }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/limit") {
      const now = Date.now();
      const saved = await this.ctx.storage.get<{
        start: number;
        count: number;
      }>("limit");
      const value =
        saved && now - saved.start < 3_600_000
          ? saved
          : { start: now, count: 0 };
      if (++value.count > 10)
        return json({ error: "Room creation limit reached. Try later." }, 429);
      await this.ctx.storage.put("limit", value);
      await this.ctx.storage.setAlarm(value.start + 3_600_000);
      return json({ ok: true });
    }
    if (url.pathname === "/create") {
      const hostSecret = secret(),
        invitation = secret(),
        expires = Date.now() + lifetime;
      await this.ctx.storage.put("metadata", {
        host: await hash(hostSecret),
        invitation: await hash(invitation),
        expires,
        iceCount: 0,
        devices: {},
      } satisfies Metadata);
      await this.ctx.storage.setAlarm(expires);
      return json({ hostSecret, invitation, expires }, 201);
    }
    const meta = await this.ctx.storage.get<Metadata>("metadata");
    if (!meta || meta.expires <= Date.now())
      return json(
        { error: "This invitation has expired or the table has closed." },
        410,
      );
    if (request.method === "DELETE" || url.pathname.endsWith("/ice")) {
      const credential =
        request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
      if (!token.safeParse(credential).success)
        return json({ error: "Not authorized." }, 401);
      const digest = await hash(credential);
      if (
        digest !== meta.host &&
        (request.method === "DELETE" || digest !== meta.invitation)
      )
        return json({ error: "Not authorized." }, 401);
      if (request.method === "DELETE") {
        await this.ctx.storage.delete("metadata");
        await this.alarm();
        return json({ ok: true });
      }
      if (request.method !== "POST")
        return json({ error: "Method not allowed." }, 405);
      if (!this.env.TURN_KEY_ID || !this.env.TURN_API_TOKEN) {
        if (this.env.ALLOW_LOCAL_ICE === "true")
          return json({ iceServers: [] });
        return json(
          { error: "Phone joining is unavailable until TURN is configured." },
          503,
        );
      }
      const permitted = await this.ctx.storage.transaction(async (tx) => {
        const latest = await tx.get<Metadata>("metadata");
        if (!latest || latest.expires <= Date.now() || latest.iceCount >= 240)
          return false;
        latest.iceCount++;
        await tx.put("metadata", latest);
        return true;
      });
      if (!permitted)
        return json(
          { error: "Connection allowance reached for this room." },
          429,
        );
      const response = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(this.env.TURN_KEY_ID)}/credentials/generate-ice-servers`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.env.TURN_API_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ttl: 3600 }),
        },
      );
      if (!response.ok)
        return json({ error: "Could not obtain connection credentials." }, 503);
      return json(await response.json());
    }
    if (request.headers.get("Upgrade") !== "websocket")
      return json({ error: "WebSocket required." }, 426);
    if (this.ctx.getWebSockets().length >= 20)
      return json({ error: "Room is full." }, 429);
    const pair = new WebSocketPair();
    const attachment: Attachment = {
      window: Date.now(),
      count: 0,
      deadline: Date.now() + 10_000,
    };
    pair[1].serializeAttachment(attachment);
    this.ctx.acceptWebSocket(pair[1]);
    await this.ctx.storage.setAlarm(
      Math.min(meta.expires, attachment.deadline),
    );
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const a = ws.deserializeAttachment() as Attachment;
    const meta = await this.ctx.storage.get<Metadata>("metadata");
    if (
      !meta ||
      meta.expires <= Date.now() ||
      typeof message !== "string" ||
      message.length > 40_000
    ) {
      ws.close(1008, "Invalid signaling message.");
      return;
    }
    if (Date.now() - a.window >= 60_000) {
      a.window = Date.now();
      a.count = 0;
    }
    if (++a.count > 150) {
      ws.close(1008, "Signaling rate limit.");
      return;
    }
    ws.serializeAttachment(a);
    let parsed;
    try {
      parsed = signalSchema.safeParse(JSON.parse(message));
    } catch {
      ws.close(1008, "Invalid message.");
      return;
    }
    if (!parsed.success) {
      ws.close(1008, "Invalid message.");
      return;
    }
    const data = parsed.data;
    if (!a.role) {
      if (
        data.type !== "auth" ||
        a.deadline < Date.now() ||
        (await hash(data.secret)) !==
          (data.role === "host" ? meta.host : meta.invitation)
      ) {
        ws.close(1008, "Not authorized.");
        return;
      }
      if (data.role === "guest") {
        const host = this.host();
        if (
          !data.credential ||
          (host?.deserializeAttachment() as Attachment | undefined)?.peer ===
            data.peer
        ) {
          ws.close(1008, "Invalid device identity.");
          return;
        }
        const proof = await hash(data.credential);
        const claimed = await this.ctx.storage.transaction(async (tx) => {
          const latest = await tx.get<Metadata>("metadata");
          if (!latest || latest.expires <= Date.now()) return false;
          if (latest.devices[data.peer] && latest.devices[data.peer] !== proof)
            return false;
          if (
            !latest.devices[data.peer] &&
            Object.keys(latest.devices).length >= 40
          )
            return false;
          latest.devices[data.peer] = proof;
          await tx.put("metadata", latest);
          return true;
        });
        if (!claimed) {
          ws.close(
            1008,
            "Invalid device identity or device allowance reached.",
          );
          return;
        }
      }
      // Only one live connection per device. A returning host replaces its old socket.
      for (const old of this.peers()) {
        const oldA = old.deserializeAttachment() as Attachment;
        if (
          (data.role === "host" && oldA.role === "host") ||
          oldA.peer === data.peer
        )
          old.close(4000, "Reconnected.");
      }
      if (
        data.role === "guest" &&
        this.peers().filter(
          (p) =>
            (p.deserializeAttachment() as Attachment).role === "guest" &&
            p.readyState === 1,
        ).length >= 10
      ) {
        ws.close(1008, "All phone connections are in use.");
        return;
      }
      a.role = data.role;
      a.peer = data.peer;
      ws.serializeAttachment(a);
      this.send(ws, { type: "ready" });
      if (data.role === "host") {
        for (const guest of this.peers().filter(
          (p) =>
            p !== ws &&
            (p.deserializeAttachment() as Attachment).role === "guest",
        )) {
          this.send(ws, {
            type: "peer",
            peer: (guest.deserializeAttachment() as Attachment).peer,
          });
          this.send(guest, { type: "host-online" });
        }
      } else {
        const host = this.host();
        if (host) this.send(host, { type: "peer", peer: a.peer });
        else this.send(ws, { type: "host-offline" });
      }
    } else if (data.type === "signal") {
      const target = this.peers().find(
        (p) =>
          (p.deserializeAttachment() as Attachment).peer === data.to &&
          p.readyState === 1,
      );
      if (
        target &&
        (a.role === "host" ||
          (target.deserializeAttachment() as Attachment).role === "host")
      )
        this.send(target, { ...data, from: a.peer });
    }
  }
  webSocketClose(ws: WebSocket) {
    const a = ws.deserializeAttachment() as Attachment;
    if (a.role === "host" && !this.host())
      for (const peer of this.peers())
        this.send(peer, { type: "host-offline" });
    if (
      a.role === "guest" &&
      !this.peers().some(
        (p) =>
          p !== ws &&
          p.readyState === 1 &&
          (p.deserializeAttachment() as Attachment).peer === a.peer,
      )
    ) {
      const host = this.host();
      if (host) this.send(host, { type: "left", peer: a.peer });
    }
  }
  webSocketError(ws: WebSocket) {
    ws.close(1011, "Connection error.");
  }
  async alarm() {
    const meta = await this.ctx.storage.get<Metadata>("metadata");
    if (!meta || meta.expires <= Date.now()) {
      for (const ws of this.ctx.getWebSockets()) ws.close(4001, "Room closed.");
      await this.ctx.storage.deleteAll();
      return;
    }
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment;
      if (!a.role && a.deadline <= Date.now())
        ws.close(1008, "Authentication timed out.");
    }
    const deadlines = this.ctx
      .getWebSockets()
      .map((ws) => ws.deserializeAttachment() as Attachment)
      .filter((a) => !a.role && a.deadline > Date.now())
      .map((a) => a.deadline);
    await this.ctx.storage.setAlarm(Math.min(meta.expires, ...deadlines));
  }
}
