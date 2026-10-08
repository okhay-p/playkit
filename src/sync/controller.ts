import { useSyncExternalStore } from "react";
import { createId } from "../id";
import { restoreSession } from "../poker/engine";
import { type Command, type Session } from "../poker/model";
import { dispatch, dispatchEnvelope, sessionStore } from "../storage/session";
import { approveSeat, authorizeCommand, type PlayerCommand } from "./protocol";
import { roomSchema } from "./signaling";
import {
  createSecret,
  eraseGuest,
  eraseHost,
  publicSnapshot,
  readGuest,
  readHost,
  saveGuest,
  saveHost,
  type GuestConfig,
  type HostConfig,
} from "./credentials";
import { PeerTransport } from "./transport";

type Request = {
  peer: string;
  name: string;
  credential: string;
  seat?: string;
};
type State = {
  ready: boolean;
  role: "host" | "guest" | null;
  host: HostConfig | null;
  guest: GuestConfig | null;
  connected: boolean;
  peers: string[];
  requests: Request[];
  current: Session | null;
  seat: string | null;
  seats: { id: string; name: string; claimed: boolean }[];
  paused: boolean;
  busy: boolean;
  error: string | null;
  notice: string;
};
let state: State = {
  ready: false,
  role: null,
  host: null,
  guest: null,
  connected: false,
  peers: [],
  requests: [],
  current: null,
  seat: null,
  seats: [],
  paused: true,
  busy: false,
  error: null,
  notice: "",
};
const listeners = new Set<() => void>();
const publish = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
};
export const syncStore = {
  getSnapshot: () => state,
  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};
export const useSync = () =>
  useSyncExternalStore(syncStore.subscribe, syncStore.getSnapshot);
export const signalingEndpoint = () =>
  (import.meta.env.VITE_SIGNALING_URL as string | undefined)?.replace(
    /\/$/,
    "",
  );
let transport: PeerTransport | undefined;
let init: Promise<void> | undefined;
let unsubscribe: (() => void) | undefined;
let unresolved:
  | {
      resolve: () => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  | undefined;
let mutation = Promise.resolve();
let preparingCommand = false;
function hostMutation<T>(operation: () => Promise<T>): Promise<T> {
  const next = mutation.then(operation);
  mutation = next.then(
    () => {},
    () => {},
  );
  return next;
}
export function initializeSync() {
  if (init) return init;
  init = (async () => {
    try {
      const host = await readHost(),
        guest = await readGuest();
      const local = sessionStore.getSnapshot().current;
      if (
        host &&
        local?.core.id === host.sessionId &&
        host.expires > Date.now()
      ) {
        publish({ host, role: "host" });
        await connectHost();
      } else if (guest && !local) {
        publish({
          guest,
          role: "guest",
          current: guest.session ? restoreSession(guest.session) : null,
          seat: guest.seat,
          busy: !!guest.pending,
        });
        await connectGuest();
      } else if (host) await eraseHost();
    } catch (error) {
      publish({
        error:
          error instanceof Error
            ? error.message
            : "Could not restore phone joining.",
      });
    } finally {
      publish({ ready: true });
    }
  })();
  return init;
}
export async function enableJoining() {
  if (state.busy || state.role === "guest") return;
  const local = sessionStore.getSnapshot();
  if (!local.current || local.recoveryPending)
    throw new Error("Resume your table first.");
  const endpoint = signalingEndpoint();
  if (!endpoint)
    throw new Error("Phone joining is not configured on this installation.");
  publish({ busy: true, error: null });
  try {
    const response = await fetch(`${endpoint}/rooms`, { method: "POST" });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error ?? "Could not open phone joining.");
    const room = roomSchema.parse(result);
    const host: HostConfig = {
      ...room,
      endpoint,
      peer: createId(),
      sessionId: local.current.core.id,
      associations: [],
    };
    await saveHost(host);
    publish({ host, role: "host" });
    await connectHost();
  } catch (error) {
    publish({
      error:
        error instanceof Error
          ? error.message
          : "Could not open phone joining.",
    });
    throw error;
  } finally {
    publish({ busy: false });
  }
}
function welcome(peer: string) {
  const c = sessionStore.getSnapshot().current;
  if (!c || !state.host) return;
  publish({
    seats: c.core.players.map((p) => ({
      id: p.id,
      name: p.name,
      claimed: state.host!.associations.some((a) => a.seat === p.id),
    })),
  });
  transport?.send(peer, {
    type: "welcome",
    version: 1,
    seats: c.core.players.map((p) => ({
      id: p.id,
      name: p.name,
      claimed: state.host!.associations.some((a) => a.seat === p.id),
    })),
  });
}
function sendSnapshot(peer: string) {
  const local = sessionStore.getSnapshot();
  const binding = state.host?.associations.find((a) => a.peer === peer);
  if (!binding || !local.current) return;
  if (!local.current.core.players.some((p) => p.id === binding.seat)) {
    void revokePhone(peer).catch((error) => publish({ error: String(error) }));
    return;
  }
  transport?.send(peer, {
    type: "snapshot",
    version: 1,
    seat: binding.seat,
    paused: local.recoveryPending,
    session: publicSnapshot(local.current),
  });
}
async function connectHost() {
  const host = state.host!;
  transport?.stop();
  unsubscribe?.();
  publish({ peers: [], requests: [] });
  const authenticated = new Set<string>();
  transport = new PeerTransport({
    endpoint: host.endpoint,
    room: host.room,
    secret: host.hostSecret,
    role: "host",
    peer: host.peer,
    status: (connected, error, expired) => {
      publish({ connected, ...(error ? { error } : {}) });
      if (expired) void disableJoining(false);
    },
    open: () => {},
    close: (peer) => {
      authenticated.delete(peer);
      publish({
        peers: state.peers.filter((p) => p !== peer),
        requests: state.requests.filter((r) => r.peer !== peer),
      });
    },
    message: async (peer, message) => {
      if (message.type === "hello") {
        const old = state.host?.associations.find((a) => a.peer === peer);
        if (old && old.credential !== message.credential) {
          transport?.send(peer, {
            type: "notice",
            version: 1,
            message: "This phone credential is no longer valid.",
            revoked: true,
          });
          return;
        }
        authenticated.add(peer);
        if (!state.peers.includes(peer))
          publish({ peers: [...state.peers, peer] });
        if (old) sendSnapshot(peer);
        else {
          publish({
            requests: [
              ...state.requests.filter((r) => r.peer !== peer),
              { peer, name: message.name, credential: message.credential },
            ],
          });
          welcome(peer);
        }
      } else if (authenticated.has(peer) && message.type === "request-seat") {
        const request = state.requests.find((r) => r.peer === peer);
        if (
          request &&
          sessionStore
            .getSnapshot()
            .current?.core.players.some((p) => p.id === message.seat)
        ) {
          publish({
            requests: state.requests.map((r) =>
              r.peer === peer ? { ...r, seat: message.seat } : r,
            ),
          });
          transport?.send(peer, {
            type: "notice",
            version: 1,
            message: "Waiting for the host to approve your seat.",
          });
        }
      } else if (authenticated.has(peer) && message.type === "snapshot-request")
        sendSnapshot(peer);
      else if (message.type === "command") {
        let ok = false,
          error: string | undefined;
        try {
          const local = sessionStore.getSnapshot();
          if (!local.current) throw new Error("This table has ended.");
          const binding = authenticated.has(peer)
            ? state.host?.associations.find((a) => a.peer === peer)
            : undefined;
          const envelope = authorizeCommand(
            local.current,
            binding,
            peer,
            message,
          );
          if (!local.current.processed.includes(envelope.id))
            await dispatchEnvelope(envelope, message.sessionId);
          ok = true;
        } catch (err) {
          error =
            err instanceof Error
              ? err.message
              : "Could not record this action.";
        }
        transport?.send(peer, {
          type: "ack",
          version: 1,
          id: message.id,
          ok,
          revision: sessionStore.getSnapshot().current?.revision ?? 0,
          ...(error ? { error } : {}),
        });
        sendSnapshot(peer);
      }
    },
  });
  let last = "";
  unsubscribe = sessionStore.subscribe(() => {
    const local = sessionStore.getSnapshot();
    if (local.busy) return;
    if (!local.current) {
      for (const peer of state.peers)
        transport?.send(peer, { type: "closed", version: 1 });
      // Give the ordered data channel time to deliver closure before shutting down signaling.
      void disableJoining();
      return;
    }
    const key = `${local.current.revision}:${local.recoveryPending}`;
    if (key === last) return;
    last = key;
    for (const peer of state.peers) {
      sendSnapshot(peer);
      welcome(peer);
    }
  });
  await transport.start();
}
export async function approvePhone(peer: string) {
  return hostMutation(async () => {
    const request = state.requests.find((r) => r.peer === peer);
    if (
      !request?.seat ||
      !state.host ||
      !sessionStore
        .getSnapshot()
        .current?.core.players.some((p) => p.id === request.seat)
    )
      throw new Error("Choose an available seat first.");
    const host = {
      ...state.host,
      associations: approveSeat(state.host.associations, {
        peer,
        name: request.name,
        credential: request.credential,
        seat: request.seat,
      }),
    };
    await saveHost(host);
    publish({ host, requests: state.requests.filter((r) => r.peer !== peer) });
    sendSnapshot(peer);
    for (const id of state.peers) welcome(id);
  });
}
export async function revokePhone(peer: string) {
  return hostMutation(async () => {
    if (!state.host) return;
    const host = {
      ...state.host,
      associations: state.host.associations.filter((a) => a.peer !== peer),
    };
    await saveHost(host);
    publish({ host });
    transport?.send(peer, {
      type: "notice",
      version: 1,
      message:
        "The host disconnected your seat. Ask them to approve you again.",
      revoked: true,
    });
    for (const id of state.peers) welcome(id);
  });
}
export async function disableJoining(closeRemote = true) {
  const host = state.host;
  unsubscribe?.();
  unsubscribe = undefined;
  if (closeRemote)
    for (const peer of state.peers)
      transport?.send(peer, { type: "closed", version: 1 });
  await eraseHost();
  if (closeRemote && host) {
    try {
      await fetch(`${host.endpoint}/rooms/${host.room}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${host.hostSecret}` },
      });
    } catch {
      /* Room expires even if signaling is offline. */
    }
  }
  transport?.stop();
  transport = undefined;
  publish({
    role: null,
    host: null,
    connected: false,
    peers: [],
    requests: [],
  });
}
export async function joinPhone(
  invitation: { room: string; invitation: string },
  name: string,
) {
  if (sessionStore.getSnapshot().current)
    throw new Error("End your locally saved table before joining another.");
  const endpoint = signalingEndpoint();
  if (!endpoint)
    throw new Error("Phone joining is not configured on this installation.");
  const existing = state.guest;
  const guest: GuestConfig =
    existing?.room === invitation.room
      ? { ...existing, name }
      : {
          ...invitation,
          name: name.trim(),
          endpoint,
          peer: createId(),
          credential: createSecret(),
          session: null,
          seat: null,
          pending: null,
        };
  await saveGuest(guest);
  publish({
    guest,
    role: "guest",
    error: null,
    current: guest.session,
    seat: guest.seat,
    paused: true,
  });
  await connectGuest();
}
async function connectGuest() {
  const guest = state.guest!;
  let resubmitted = false;
  transport?.stop();
  publish({ connected: false, paused: true });
  transport = new PeerTransport({
    endpoint: guest.endpoint,
    room: guest.room,
    secret: guest.invitation,
    credential: guest.credential,
    peer: guest.peer,
    role: "guest",
    status: (_connected, error, expired) => {
      // Only an authoritative snapshot, rather than signaling readiness, enables actions.
      if (!_connected)
        publish({
          connected: false,
          paused: true,
          ...(error ? { error } : {}),
        });
      if (expired)
        void leavePhone("This invitation has expired or the table has closed.");
    },
    open: () =>
      transport?.sendHost({
        type: "hello",
        version: 1,
        credential: state.guest!.credential,
        name: state.guest!.name,
      }),
    close: () => {
      publish({ connected: false, paused: true });
      if (unresolved) {
        clearTimeout(unresolved.timer);
        unresolved.reject(
          new Error(
            "Waiting for the host. Reconnecting will confirm your last action.",
          ),
        );
        unresolved = undefined;
      }
    },
    message: async (_peer, message) => {
      if (!state.guest) return;
      if (message.type === "snapshot") {
        const next = restoreSession(message.session);
        if (
          state.current?.core.id === next.core.id &&
          state.current.revision > next.revision
        ) {
          transport?.sendHost({ type: "snapshot-request", version: 1 });
          return;
        }
        const gap =
          !!state.current && next.revision > state.current.revision + 1;
        // Each update is a complete snapshot: a revision gap needs no speculative replay.
        const value = { ...state.guest, session: next, seat: message.seat };
        await saveGuest(value);
        publish({
          guest: value,
          current: next,
          seat: message.seat,
          connected: true,
          paused: message.paused,
          notice: gap ? "Table refreshed from the host." : "",
        });
        if (value.pending && !resubmitted && !preparingCommand) {
          resubmitted = true;
          transport?.sendHost(value.pending);
        }
      } else if (message.type === "welcome") publish({ seats: message.seats });
      else if (
        message.type === "ack" &&
        state.guest.pending?.id === message.id
      ) {
        resubmitted = false;
        const value = { ...state.guest, pending: null };
        await saveGuest(value);
        publish({
          guest: value,
          busy: false,
          error: message.ok
            ? null
            : (message.error ?? "The host rejected this action."),
        });
        if (unresolved) {
          clearTimeout(unresolved.timer);
          if (message.ok) unresolved.resolve();
          else unresolved.reject(new Error(message.error));
          unresolved = undefined;
        }
      } else if (message.type === "notice") {
        if (message.revoked) {
          const value = { ...state.guest, seat: null, pending: null };
          await saveGuest(value);
          publish({
            guest: value,
            seat: null,
            paused: true,
            busy: false,
            notice: message.message,
          });
          if (unresolved) {
            clearTimeout(unresolved.timer);
            unresolved.reject(new Error(message.message));
            unresolved = undefined;
          }
          transport?.sendHost({
            type: "hello",
            version: 1,
            credential: value.credential,
            name: value.name,
          });
        } else publish({ notice: message.message });
      } else if (message.type === "closed")
        await leavePhone(
          "The host closed phone joining. Your copy has been cleared.",
        );
    },
  });
  await transport.start();
}
export function requestSeat(seat: string) {
  transport?.sendHost({ type: "request-seat", version: 1, seat });
  publish({ notice: "Waiting for the host to approve your seat." });
}
export async function submit(command: Command, expectedRevision?: number) {
  const shown =
    state.role === "guest" ? state.current : sessionStore.getSnapshot().current;
  if (expectedRevision !== undefined && shown?.revision !== expectedRevision)
    throw new Error(
      "The table changed. Close this action and review the updated turn.",
    );
  if (state.role !== "guest") return dispatch(command);
  if (
    !state.connected ||
    state.paused ||
    state.busy ||
    !state.current ||
    !state.guest ||
    !state.seat
  )
    throw new Error("Wait for your seat and the host to be ready.");
  if (command.type !== "action" || command.playerId !== state.seat)
    throw new Error("Only the host can record this change.");
  const pending: PlayerCommand = {
    type: "command",
    version: 1,
    sessionId: state.current.core.id,
    id: `${state.guest.peer}:${createId()}`,
    expectedRevision: state.current.revision,
    command,
  };
  const value = { ...state.guest, pending };
  preparingCommand = true;
  publish({ busy: true, error: null, guest: value });
  try {
    await saveGuest(value);
  } catch (error) {
    const restored = state.guest ? { ...state.guest, pending: null } : null;
    publish({ busy: false, guest: restored });
    if (restored) await saveGuest(restored).catch(() => {});
    throw error;
  } finally {
    preparingCommand = false;
  }
  if (state.role !== "guest" || state.guest?.pending?.id !== pending.id)
    throw new Error("Your phone left the table before sending this action.");
  if (!state.connected || state.paused) {
    const unsent = { ...state.guest, pending: null };
    await saveGuest(unsent);
    publish({ guest: unsent, busy: false });
    throw new Error(
      "The host disconnected before this action was sent. Review the table after reconnecting.",
    );
  }
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      unresolved = undefined;
      publish({
        error:
          "Waiting for the host to confirm your action. Reconnect to check it.",
      });
      transport?.sendHost({ type: "snapshot-request", version: 1 });
      reject(new Error("The host has not confirmed this action yet."));
    }, 10_000);
    unresolved = { resolve, reject, timer };
    transport?.sendHost(pending);
  });
}
export async function reconnectPhones() {
  publish({ error: null });
  if (state.role === "host") await connectHost();
  else if (state.role === "guest") await connectGuest();
}
export async function leavePhone(notice = "You left the table.") {
  transport?.stop();
  transport = undefined;
  if (unresolved) {
    clearTimeout(unresolved.timer);
    unresolved.reject(new Error(notice));
    unresolved = undefined;
  }
  await eraseGuest();
  publish({
    role: null,
    guest: null,
    current: null,
    seat: null,
    connected: false,
    paused: true,
    busy: false,
    seats: [],
    error: null,
    notice,
  });
}
