import { createId } from "../id";
import Dexie, { type EntityTable } from "dexie";
import { applyCommand, createSession, restoreSession } from "../poker/engine";
import { type Command, type Session } from "../poker/model";

const db = new Dexie("playkit") as Dexie & {
  sessions: EntityTable<{ key: string; payload: Session }, "key">;
};
db.version(1).stores({ sessions: "key" });
let current: Session | null = null;
let busy = false;
let ready = false;
let failure: string | null = null;
let recoveryPending = false;
let snapshot: {
  current: Session | null;
  busy: boolean;
  ready: boolean;
  failure: string | null;
  recoveryPending: boolean;
} = { current, busy, ready, failure, recoveryPending };
const listeners = new Set<() => void>();
function publish() {
  snapshot = { current, busy, ready, failure, recoveryPending };
  listeners.forEach((fn) => fn());
}
export const sessionStore = {
  getSnapshot: () => snapshot,
  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};
export async function loadSession() {
  if (ready || busy) return;
  busy = true;
  publish();
  try {
    const saved = await db.sessions.get("active");
    if (saved) {
      current = restoreSession(saved.payload);
      recoveryPending = true;
    }
  } catch (error) {
    failure =
      error instanceof Error
        ? `Could not restore the saved game: ${error.message}`
        : "Could not open local storage.";
  } finally {
    busy = false;
    ready = true;
    publish();
  }
}
export async function newSession(input: Parameters<typeof createSession>[0]) {
  if (busy) return;
  busy = true;
  failure = null;
  publish();
  try {
    const next = createSession(input);
    await db.transaction("rw", db.sessions, async () => {
      const saved = await db.sessions.get("active");
      if (saved)
        throw new Error("A game is already saved. Resume it or end it first.");
      await db.sessions.put({ key: "active", payload: next });
    });
    current = next;
    recoveryPending = false;
  } catch (error) {
    failure =
      error instanceof Error ? error.message : "Could not save the game.";
    throw error;
  } finally {
    busy = false;
    publish();
  }
}
export async function dispatch(command: Command) {
  if (busy || !current || recoveryPending)
    throw new Error("Wait for the table to be ready.");
  const before = current;
  const envelope = {
    id: createId(),
    expectedRevision: before.revision,
    at: new Date().toISOString(),
    command,
  };
  busy = true;
  failure = null;
  publish();
  try {
    let next: Session | null = null;
    await db.transaction("rw", db.sessions, async () => {
      const stored = await db.sessions.get("active");
      if (!stored || stored.payload.core.id !== before.core.id)
        throw new Error(
          "This game was ended in another tab. Reload to continue.",
        );
      const latest = restoreSession(stored.payload);
      if (latest.revision !== before.revision) {
        current = latest;
        throw new Error(
          "The table changed in another tab. Review the updated turn.",
        );
      }
      next = applyCommand(latest, envelope);
      await db.sessions.put({ key: "active", payload: next });
    });
    current = next;
  } catch (error) {
    failure =
      error instanceof Error ? error.message : "Could not save the action.";
    throw error;
  } finally {
    busy = false;
    publish();
  }
}
export function resumeSession() {
  recoveryPending = false;
  failure = null;
  publish();
}
export async function clearSession() {
  if (busy) return;
  const before = current;
  busy = true;
  publish();
  try {
    await db.transaction("rw", db.sessions, async () => {
      const saved = await db.sessions.get("active");
      if (
        before &&
        saved &&
        (saved.payload.core.id !== before.core.id ||
          saved.payload.revision !== before.revision)
      ) {
        current = restoreSession(saved.payload);
        throw new Error(
          "The table changed in another tab. Review it before ending the game.",
        );
      }
      await db.sessions.delete("active");
    });
    current = null;
    recoveryPending = false;
    failure = null;
  } catch (error) {
    failure =
      error instanceof Error ? error.message : "Could not clear the game.";
    throw error;
  } finally {
    busy = false;
    publish();
  }
}
