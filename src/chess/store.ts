import Dexie, { type Table } from "dexie";
import { useSyncExternalStore } from "react";
import {
  createClock,
  restore,
  savedSchema,
  save,
  transition,
  type Action,
  type Clock,
  type Config,
  type Saved,
} from "./engine";
const db = new Dexie("playkit-chess") as Dexie & {
  clocks: Table<{ id: string; value: Saved }, string>;
};
db.version(1).stores({ clocks: "id" });
let state: {
  clock: Clock | null;
  ready: boolean;
  busy: boolean;
  error: string | null;
  recovered: boolean;
} = { clock: null, ready: false, busy: false, error: null, recovered: false };
const listeners = new Set<() => void>();
const publish = (patch: Partial<typeof state>) => {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
};
export function useClock() {
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
let loading: Promise<void> | undefined;
export function loadClock() {
  return (loading ??= (async () => {
    try {
      const row = await db.clocks.get("active");
      publish({
        clock: row ? restore(row.value) : null,
        recovered: !!row && ["paused", "running"].includes(row.value.phase),
      });
    } catch {
      publish({
        error:
          "The saved clock could not be opened. You can replace it with a new clock.",
      });
    } finally {
      publish({ ready: true });
    }
  })());
}
let queue = Promise.resolve();
function enqueue(work: () => Promise<void>) {
  queue = queue.then(work).catch(() => {
    publish({
      clock: state.clock
        ? transition(state.clock, { type: "pause" }, performance.now())
        : null,
      busy: false,
      error:
        "The clock could not be saved. Play is paused. Reload to recover the last saved clock, or set up a new one.",
    });
  });
  return queue;
}
export function setupClock(config: Config) {
  return enqueue(async () => {
    publish({ busy: true });
    const clock = createClock(config);
    await db.transaction("rw", db.clocks, async () => {
      const row = await db.clocks.get("active");
      const previous = savedSchema.safeParse(row?.value);
      clock.revision = previous.success ? previous.data.revision + 1 : 0;
      await db.clocks.put({ id: "active", value: save(clock) });
    });
    publish({ clock, busy: false, error: null, recovered: false });
  });
}
export function act(action: Action, now = performance.now()) {
  return enqueue(async () => {
    const current = state.clock;
    if (!current || state.error) return;
    const clock = transition(current, action, now);
    publish({ busy: true });
    await db.transaction("rw", db.clocks, async () => {
      const row = await db.clocks.get("active");
      if (!row || row.value.revision !== current.revision)
        throw new Error("Clock changed in another tab");
      await db.clocks.put({ id: "active", value: save(clock) });
    });
    publish({ clock, busy: false, recovered: false });
  });
}
/** Never carry an actively ticking reference across a hidden page or route change. */
export function pauseClock() {
  // Queue behind a pending start too: hiding during its save must still pause.
  return act({ type: "pause" });
}
