import Dexie, { type Table } from "dexie";
import { useSyncExternalStore } from "react";
import {
  applyGame,
  gameSchema,
  type Game,
  type GameCommand,
  type Kind,
} from "./engine";
const db = new Dexie("playkit-tools") as Dexie & {
  games: Table<
    { kind: Kind; game: Game; history: Game[]; commands: string[] },
    Kind
  >;
};
db.version(1).stores({ games: "kind" });
export type ToolState = {
  game: Game | null;
  ready: boolean;
  busy: boolean;
  error: string | null;
  history: Game[];
  recovered: boolean;
};
const states = new Map<Kind, ToolState>();
const listeners = new Set<() => void>();
const initial: ToolState = {
  game: null,
  ready: false,
  busy: false,
  error: null,
  history: [],
  recovered: false,
};
function publish(kind: Kind, patch: Partial<ToolState>) {
  states.set(kind, { ...(states.get(kind) || initial), ...patch });
  listeners.forEach((f) => f());
}
export const toolsStore = {
  get: (kind: Kind) => states.get(kind) || initial,
  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};
export function useTool(kind: Kind) {
  return useSyncExternalStore(toolsStore.subscribe, () => toolsStore.get(kind));
}
const loads = new Map<Kind, Promise<void>>();
export function loadTool(kind: Kind) {
  let loading = loads.get(kind);
  if (loading) return loading;
  loading = (async () => {
    try {
      const row = await db.games.get(kind);
      publish(kind, {
        game: row ? gameSchema.parse(row.game) : null,
        history: row?.history.map((g) => gameSchema.parse(g)) || [],
        ready: true,
        recovered: !!row,
      });
    } catch {
      publish(kind, {
        ready: true,
        error:
          "The saved game could not be opened. Clear this game to start again.",
      });
    }
  })();
  loads.set(kind, loading);
  return loading;
}
let queue = Promise.resolve();
function enqueue(kind: Kind, work: () => Promise<void>) {
  const result = queue.then(async () => {
    publish(kind, { busy: true, error: null });
    try {
      await work();
    } catch (e) {
      publish(kind, {
        error: e instanceof Error ? e.message : "Could not save your game.",
      });
      throw e;
    } finally {
      publish(kind, { busy: false });
    }
  });
  queue = result.catch(() => {});
  return result;
}
export function saveNewTool(game: Game) {
  return enqueue(game.kind, async () => {
    const valid = gameSchema.parse(game);
    await db.games.put({
      kind: game.kind,
      game: valid,
      history: [],
      commands: [],
    });
    publish(game.kind, { game: valid, history: [], recovered: false });
  });
}
export function changeTool(
  kind: Kind,
  command: GameCommand,
  expectedRevision?: number,
  commandId?: string,
) {
  return enqueue(kind, async () => {
    let saved:
      | { kind: Kind; game: Game; history: Game[]; commands: string[] }
      | undefined;
    await db.transaction("rw", db.games, async () => {
      const row = await db.games.get(kind);
      if (!row) throw new Error("This game has ended.");
      if (commandId && row.commands.includes(commandId)) {
        saved = row;
        return;
      }
      if (
        expectedRevision !== undefined &&
        row.game.revision !== expectedRevision
      )
        throw new Error("The game changed. Review it and try again.");
      const history = [...row.history, row.game].slice(-20);
      saved = {
        kind,
        game: applyGame(row.game, command),
        history,
        commands: commandId
          ? [...row.commands, commandId].slice(-1000)
          : row.commands,
      };
      await db.games.put(saved);
    });
    if (saved)
      publish(kind, {
        game: saved.game,
        history: saved.history,
        recovered: false,
      });
  });
}
export function undoTool(kind: Kind) {
  return enqueue(kind, async () => {
    let saved: { game: Game; history: Game[] } | undefined;
    await db.transaction("rw", db.games, async () => {
      const row = await db.games.get(kind);
      if (!row?.history.length) return;
      if (kind === "undercover" || kind === "imposter")
        throw new Error("Word games cannot undo revealed information.");
      const game = { ...row.history.at(-1)!, revision: row.game.revision + 1 },
        history = row.history.slice(0, -1);
      await db.games.put({ ...row, game, history });
      saved = { game, history };
    });
    if (saved) publish(kind, saved);
  });
}
export function clearTool(kind: Kind) {
  return enqueue(kind, async () => {
    await db.games.delete(kind);
    publish(kind, { game: null, history: [], recovered: false });
  });
}
