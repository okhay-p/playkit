import { useSyncExternalStore } from "react";
import { z } from "zod";
import { createId } from "../id";
import { PeerTransport } from "../sync/transport";
import { createSecret } from "../sync/credentials";
import { roomSchema, token, peerId } from "../sync/signaling";
import { signalingEndpoint } from "../sync/controller";
import {
  commandSchema,
  projectGame,
  viewSchema,
  type GameCommand,
  type GameView,
  type Kind,
} from "./engine";
import { changeTool, loadTool, toolsStore } from "./store";
const seat = z.object({
  id: z.string(),
  name: z.string(),
  claimed: z.boolean(),
});
const binding = z.object({
  peer: peerId,
  seat: z.string(),
  name: z.string().max(24),
  credential: token,
});
const hostSchema = roomSchema.extend({
  kind: z.enum(["scorekeeper", "tournament", "undercover", "imposter"]),
  sessionId: z.string(),
  peer: peerId,
  endpoint: z.url(),
  bindings: z.array(binding),
  remoteEdits: z.boolean(),
});
const guestSchema = z.object({
  room: token,
  invitation: token,
  peer: peerId,
  credential: token,
  name: z.string().trim().min(1).max(24),
  seat: z.string().nullable(),
  endpoint: z.url(),
  view: viewSchema.nullable(),
});
export const toolWireSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hello"),
    version: z.literal(2),
    credential: token,
    name: z.string().trim().min(1).max(24),
  }),
  z.object({
    type: z.literal("roster"),
    version: z.literal(2),
    seats: z.array(seat).max(10),
  }),
  z.object({
    type: z.literal("seat"),
    version: z.literal(2),
    seat: z.string(),
  }),
  z.object({
    type: z.literal("view"),
    version: z.literal(2),
    seat: z.string(),
    view: viewSchema,
    remoteEdits: z.boolean(),
  }),
  z.object({
    type: z.literal("action"),
    version: z.literal(2),
    id: z.string().max(128),
    sessionId: z.string(),
    revision: z.number().int().nonnegative(),
    command: commandSchema,
  }),
  z.object({
    type: z.literal("ack"),
    version: z.literal(2),
    id: z.string(),
    error: z.string().optional(),
  }),
  z.object({ type: z.literal("closed"), version: z.literal(2) }),
  z.object({ type: z.literal("revoked"), version: z.literal(2) }),
]);
type Wire = z.infer<typeof toolWireSchema>;
type Host = z.infer<typeof hostSchema>;
type Guest = z.infer<typeof guestSchema>;
type State = {
  role: "host" | "guest" | null;
  host: Host | null;
  guest: Guest | null;
  connected: boolean;
  peers: string[];
  requests: z.infer<typeof binding>[];
  seats: z.infer<typeof seat>[];
  view: GameView | null;
  remoteEdits: boolean;
  error: string | null;
  busy: boolean;
};
let state: State = {
  role: null,
  host: null,
  guest: null,
  connected: false,
  peers: [],
  requests: [],
  seats: [],
  view: null,
  remoteEdits: false,
  error: null,
  busy: false,
};
const listeners = new Set<() => void>();
function publish(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((f) => f());
}
export function useToolPhones() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => state,
  );
}
let transport: PeerTransport<Wire> | undefined, unsub: (() => void) | undefined;
const requests = new Map<string, { name: string; credential: string }>();
let pending:
  | {
      id: string;
      resolve: () => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  | undefined;
function writeHost(host: Host) {
  localStorage.setItem(`playkit-tools-host:${host.kind}`, JSON.stringify(host));
}
function writeGuest(guest: Guest) {
  localStorage.setItem("playkit-tools-guest", JSON.stringify(guest));
}
function stopTransport() {
  transport?.stop();
  transport = undefined;
  unsub?.();
  unsub = undefined;
  requests.clear();
  if (pending) {
    clearTimeout(pending.timer);
    pending.reject(
      new Error("Connection changed. Review the host state before retrying."),
    );
    pending = undefined;
  }
  publish({ connected: false, peers: [], requests: [], busy: false });
}
function roster() {
  const g = state.host ? toolsStore.get(state.host.kind).game : null;
  return (
    g?.players.map((p) => ({
      ...p,
      claimed: state.host!.bindings.some((b) => b.seat === p.id),
    })) || []
  );
}
function sendView(peer: string) {
  const host = state.host,
    g = host ? toolsStore.get(host.kind).game : null,
    b = host?.bindings.find((b) => b.peer === peer);
  if (!host || !g || !b) return;
  transport?.send(peer, {
    type: "view",
    version: 2,
    seat: b.seat,
    view: projectGame(g, b.seat),
    remoteEdits: host.remoteEdits,
  });
}
export function authorizeToolAction(
  view: GameView,
  seatId: string,
  remoteEdits: boolean,
  command: GameCommand,
) {
  if (view.kind === "scorekeeper" || view.kind === "tournament") {
    if (!remoteEdits)
      throw new Error("The host is recording results on this device.");
    if (
      view.kind === "scorekeeper" &&
      !["score", "remove-round"].includes(command.type)
    )
      throw new Error("Only score changes are allowed.");
    if (view.kind === "tournament" && command.type !== "result")
      throw new Error("Only match results are allowed.");
  } else if (
    command.type !== "next" ||
    view.phase !== "clues" ||
    view.order[view.turn] !== seatId
  )
    throw new Error(
      "Only the speaking player can finish their clue; the host manages the other phases.",
    );
}
async function connectHost(host: Host) {
  stopTransport();
  publish({
    role: "host",
    host,
    guest: null,
    view: null,
    error: null,
    remoteEdits: host.remoteEdits,
  });
  const authenticated = new Set<string>();
  transport = new PeerTransport<Wire>({
    endpoint: host.endpoint,
    room: host.room,
    peer: host.peer,
    role: "host",
    secret: host.hostSecret,
    parse: (v) => toolWireSchema.parse(v),
    status: (connected, error, expired) => {
      publish({ connected, error: error || null });
      if (expired) void closeToolJoining(false);
    },
    open: () => {},
    close: (peer) => {
      authenticated.delete(peer);
      requests.delete(peer);
      publish({
        peers: state.peers.filter((p) => p !== peer),
        requests: state.requests.filter((p) => p.peer !== peer),
      });
    },
    message: async (peer, m) => {
      if (m.type === "hello") {
        const existing = state.host?.bindings.find((b) => b.peer === peer);
        if (existing && existing.credential !== m.credential) return;
        authenticated.add(peer);
        requests.set(peer, { name: m.name, credential: m.credential });
        publish({ peers: [...new Set([...state.peers, peer])] });
        transport?.send(peer, { type: "roster", version: 2, seats: roster() });
        sendView(peer);
      } else if (authenticated.has(peer) && m.type === "seat") {
        const request = requests.get(peer);
        if (request && roster().some((s) => s.id === m.seat && !s.claimed))
          publish({
            requests: [
              ...state.requests.filter((r) => r.peer !== peer),
              { peer, seat: m.seat, ...request },
            ],
          });
      } else if (m.type === "action") {
        let error: string | undefined;
        try {
          const h = state.host,
            g = h ? toolsStore.get(h.kind).game : null,
            b = h?.bindings.find((b) => b.peer === peer);
          if (
            !h ||
            !g ||
            !b ||
            !authenticated.has(peer) ||
            !m.id.startsWith(`${peer}:`) ||
            m.sessionId !== g.id
          )
            throw new Error("This phone is not authorized for this game.");
          authorizeToolAction(
            projectGame(g, b.seat),
            b.seat,
            h.remoteEdits,
            m.command,
          );
          await changeTool(h.kind, m.command, m.revision, m.id);
        } catch (e) {
          error =
            e instanceof Error ? e.message : "Could not record the change.";
        }
        transport?.send(peer, {
          type: "ack",
          version: 2,
          id: m.id,
          ...(error ? { error } : {}),
        });
        sendView(peer);
      }
    },
  });
  unsub = toolsStore.subscribe(() => {
    const h = state.host;
    if (!h) return;
    const saved = toolsStore.get(h.kind);
    if (saved.busy) return;
    if (!saved.game || saved.game.id !== h.sessionId) {
      void closeToolJoining();
      return;
    }
    for (const peer of state.peers) {
      sendView(peer);
      transport?.send(peer, { type: "roster", version: 2, seats: roster() });
    }
  });
  await transport.start();
}
export async function restoreToolHost(kind: Kind) {
  if (state.role === "guest") return;
  await loadTool(kind);
  stopTransport();
  publish({ role: null, host: null, error: null });
  const raw = localStorage.getItem(`playkit-tools-host:${kind}`);
  if (!raw) return;
  const parsed = hostSchema.safeParse(JSON.parse(raw));
  if (
    parsed.success &&
    parsed.data.expires > Date.now() &&
    toolsStore.get(kind).game?.id === parsed.data.sessionId
  )
    await connectHost(parsed.data);
  else localStorage.removeItem(`playkit-tools-host:${kind}`);
}
export async function enableToolJoining(kind: Kind) {
  const endpoint = signalingEndpoint(),
    g = toolsStore.get(kind).game;
  if (!endpoint || !g)
    throw new Error("Start your game before opening phone joining.");
  const response = await fetch(`${endpoint}/rooms`, { method: "POST" }),
    data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not open joining.");
  const host: Host = {
    ...roomSchema.parse(data),
    kind,
    sessionId: g.id,
    peer: createId(),
    endpoint,
    bindings: [],
    remoteEdits: false,
  };
  writeHost(host);
  await connectHost(host);
}
export function toolInvitation() {
  if (!state.host) return "";
  const url = new URL("/tools/join", location.origin);
  url.hash = new URLSearchParams({
    room: state.host.room,
    invitation: state.host.invitation,
  }).toString();
  return url.href;
}
export function approveToolPhone(peer: string) {
  const h = state.host,
    r = state.requests.find((r) => r.peer === peer);
  if (!h || !r) return;
  if (h.bindings.some((b) => b.seat === r.seat && b.peer !== peer))
    throw new Error("That seat has already been approved.");
  const host = {
    ...h,
    bindings: [...h.bindings.filter((b) => b.peer !== peer), r],
  };
  writeHost(host);
  publish({ host, requests: state.requests.filter((r) => r.peer !== peer) });
  for (const p of state.peers) {
    sendView(p);
    transport?.send(p, { type: "roster", version: 2, seats: roster() });
  }
}
export function revokeToolPhone(peer: string) {
  const h = state.host;
  if (!h) return;
  const host = { ...h, bindings: h.bindings.filter((b) => b.peer !== peer) };
  writeHost(host);
  publish({ host });
  transport?.send(peer, { type: "revoked", version: 2 });
  for (const p of state.peers)
    transport?.send(p, { type: "roster", version: 2, seats: roster() });
}
export function allowToolEdits(allowed: boolean) {
  if (!state.host) return;
  const host = { ...state.host, remoteEdits: allowed };
  writeHost(host);
  publish({ host, remoteEdits: allowed });
  for (const p of state.peers) sendView(p);
}
export async function closeToolJoining(remote = true) {
  const h = state.host;
  if (!h) return;
  for (const p of state.peers)
    transport?.send(p, { type: "closed", version: 2 });
  localStorage.removeItem(`playkit-tools-host:${h.kind}`);
  if (remote)
    try {
      await fetch(`${h.endpoint}/rooms/${h.room}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${h.hostSecret}` },
      });
    } catch {
      /* Expires independently. */
    }
  stopTransport();
  publish({ role: null, host: null });
}
async function connectGuest(guest: Guest) {
  stopTransport();
  publish({
    role: "guest",
    guest,
    host: null,
    view: guest.view,
    error: null,
    seats: [],
    remoteEdits: false,
  });
  transport = new PeerTransport<Wire>({
    endpoint: guest.endpoint,
    room: guest.room,
    peer: guest.peer,
    credential: guest.credential,
    secret: guest.invitation,
    role: "guest",
    parse: (v) => toolWireSchema.parse(v),
    status: (connected, error, expired) => {
      if (!connected) publish({ connected: false });
      if (error) publish({ error });
      if (expired) leaveToolPhone();
    },
    open: () =>
      transport?.sendHost({
        type: "hello",
        version: 2,
        credential: guest.credential,
        name: guest.name,
      }),
    close: () => publish({ connected: false }),
    message: async (_peer, m) => {
      if (m.type === "roster") publish({ seats: m.seats });
      else if (m.type === "view" && state.guest) {
        if (
          state.view?.id === m.view.id &&
          state.view.revision > m.view.revision
        )
          return;
        const next = { ...state.guest, seat: m.seat, view: m.view };
        writeGuest(next);
        publish({
          guest: next,
          view: m.view,
          connected: true,
          remoteEdits: m.remoteEdits,
          error: null,
        });
      } else if (m.type === "ack" && pending?.id === m.id) {
        clearTimeout(pending.timer);
        if (m.error) pending.reject(new Error(m.error));
        else pending.resolve();
        pending = undefined;
        publish({ busy: false, ...(m.error ? { error: m.error } : {}) });
      } else if (m.type === "closed") leaveToolPhone();
      else if (m.type === "revoked" && state.guest) {
        const next = { ...state.guest, seat: null, view: null };
        writeGuest(next);
        publish({
          guest: next,
          view: null,
          connected: false,
          error: "Your seat was disconnected. Request approval again.",
        });
      }
    },
  });
  await transport.start();
}
export async function joinToolPhone(
  invitation: { room: string; invitation: string },
  name: string,
) {
  const endpoint = signalingEndpoint();
  if (!endpoint) throw new Error("Phone joining is not configured.");
  const old = state.guest?.room === invitation.room ? state.guest : null;
  const g = guestSchema.parse({
    ...invitation,
    endpoint,
    name,
    peer: old?.peer || createId(),
    credential: old?.credential || createSecret(),
    seat: old?.seat || null,
    view: old?.view || null,
  });
  writeGuest(g);
  await connectGuest(g);
}
export async function restoreToolGuest(expectedRoom?: string) {
  const raw = localStorage.getItem("playkit-tools-guest");
  if (!raw) return;
  const g = guestSchema.safeParse(JSON.parse(raw));
  if (g.success && (!expectedRoom || g.data.room === expectedRoom))
    await connectGuest(g.data);
}
export function requestToolSeat(seat: string) {
  transport?.sendHost({ type: "seat", version: 2, seat });
}
export function leaveToolPhone() {
  stopTransport();
  localStorage.removeItem("playkit-tools-guest");
  publish({ role: null, guest: null, view: null, seats: [], error: null });
}
export async function reconnectToolPhones() {
  if (state.host) await connectHost(state.host);
  else if (state.guest) await connectGuest(state.guest);
}
export function submitToolAction(command: GameCommand) {
  const guest = state.guest,
    view = state.view;
  if (!guest?.seat || !view || !state.connected || state.busy)
    return Promise.reject(
      new Error("Wait for the host connection before recording a change."),
    );
  try {
    authorizeToolAction(view, guest.seat, state.remoteEdits, command);
  } catch (e) {
    return Promise.reject(e);
  }
  const id = `${guest.peer}:${createId()}`;
  publish({ busy: true, error: null });
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending = undefined;
      publish({
        busy: false,
        error:
          "No confirmation received. Reconnect and review the saved result before retrying.",
      });
      reject(new Error("No confirmation received."));
    }, 10_000);
    pending = { id, resolve, reject, timer };
    transport?.sendHost({
      type: "action",
      version: 2,
      id,
      sessionId: view.id,
      revision: view.revision,
      command,
    });
  });
}
export function suspendToolPhones() {
  stopTransport();
  publish({ role: null, host: null, guest: null, view: null });
}
