import { z } from "zod";
import { createId } from "../id";
import { wordPool, type WordCategory } from "./word-packs";

const point = z.number().int().min(-1_000_000).max(1_000_000);
const player = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(24),
});
const base = {
  id: z.string().min(1),
  revision: z.number().int().nonnegative(),
  title: z.string().trim().min(1).max(60),
  players: z.array(player).min(2).max(10),
};
const round = z.object({
  id: z.string(),
  label: z.string().max(60),
  scores: z.record(z.string(), point),
});
export const scoreSchema = z.object({
  ...base,
  kind: z.literal("scorekeeper"),
  direction: z.enum(["high", "low"]),
  target: point.nullable(),
  rounds: z.array(round).max(500),
});
const match = z.object({
  id: z.string(),
  round: z.number().int().positive(),
  a: z.string(),
  b: z.string().nullable(),
  result: z.enum(["a", "b", "draw"]).nullable(),
});
export const tournamentSchema = z.object({
  ...base,
  kind: z.literal("tournament"),
  mode: z.enum(["round-robin", "knockout"]),
  matches: z.array(match).max(100),
});
const wordFields = {
  ...base,
  kind: z.enum(["undercover", "imposter"]),
  alive: z.array(z.string()),
  order: z.array(z.string()),
  turn: z.number().int().nonnegative(),
  dealIndex: z.number().int().nonnegative(),
  cycle: z.number().int().positive(),
  phase: z.enum(["deal", "clues", "discussion", "vote", "guess", "finished"]),
  runoff: z.array(z.string()),
  runoffAttempt: z.number().int().nonnegative(),
  guesser: z.string().nullable(),
  winner: z.enum(["civilians", "minority"]).nullable(),
  eliminated: z.array(
    z.object({
      id: z.string(),
      role: z.enum(["civilian", "undercover", "imposter"]),
    }),
  ),
  lastVote: z.record(z.string(), z.number().int().nonnegative()),
};
export const wordsSchema = z.object({
  ...wordFields,
  words: z.tuple([z.string(), z.string()]),
  roles: z.record(z.string(), z.enum(["civilian", "undercover", "imposter"])),
});
export const gameSchema = z.union([scoreSchema, tournamentSchema, wordsSchema]);
export type Game = z.infer<typeof gameSchema>;
export type Score = z.infer<typeof scoreSchema>;
export type Tournament = z.infer<typeof tournamentSchema>;
export type WordGame = z.infer<typeof wordsSchema>;
export type Player = z.infer<typeof player>;
export const wordViewSchema = z.object({
  ...wordFields,
  card: z
    .object({ word: z.string().optional(), imposter: z.boolean() })
    .nullable(),
  revealed: z
    .object({
      words: z.tuple([z.string(), z.string()]),
      roles: wordsSchema.shape.roles,
    })
    .nullable(),
});
export const viewSchema = z.union([
  scoreSchema,
  tournamentSchema,
  wordViewSchema,
]);
export type GameView = z.infer<typeof viewSchema>;
export type WordView = z.infer<typeof wordViewSchema>;
export const commandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("score"),
    id: z.string().optional(),
    label: z.string().max(60),
    scores: z.record(z.string(), point),
  }),
  z.object({ type: z.literal("remove-round"), id: z.string() }),
  z.object({
    type: z.literal("result"),
    match: z.string(),
    result: z.enum(["a", "b", "draw"]),
  }),
  z.object({
    type: z.literal("reset-after"),
    round: z.number().int().positive(),
  }),
  z.object({ type: z.literal("next") }),
  z.object({
    type: z.literal("vote"),
    votes: z.record(z.string(), z.number().int().min(0).max(10)),
  }),
  z.object({ type: z.literal("guess"), correct: z.boolean() }),
]);
export type GameCommand = z.infer<typeof commandSchema>;
export const kinds = [
  "scorekeeper",
  "tournament",
  "undercover",
  "imposter",
] as const;
export type Kind = (typeof kinds)[number];
function randomInt(n: number) {
  const values = new Uint32Array(1),
    limit = Math.floor(0x1_0000_0000 / n) * n;
  do {
    crypto.getRandomValues(values);
  } while (values[0] >= limit);
  return values[0] % n;
}
export function shuffle<T>(values: readonly T[]): T[] {
  const next = [...values];
  for (let i = next.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}
export function makePlayers(names: string[]): Player[] {
  const result = z
    .array(z.string().trim().min(1).max(24))
    .min(2)
    .max(10)
    .parse(names);
  if (new Set(result.map((n) => n.toLowerCase())).size !== result.length)
    throw new Error("Use a different name for each player or team.");
  return result.map((name) => ({ id: createId(), name }));
}
export function createGame(
  kind: Kind,
  names: string[],
  options: {
    title?: string;
    direction?: "high" | "low";
    target?: number | null;
    mode?: "round-robin" | "knockout";
    minority?: number;
    category?: WordCategory;
    customWords?: string;
  } = {},
): Game {
  const players = makePlayers(names),
    common = {
      id: createId(),
      revision: 0,
      title:
        options.title ||
        {
          scorekeeper: "Game night scores",
          tournament: "Game night tournament",
          undercover: "Undercover",
          imposter: "Imposter",
        }[kind],
      players,
    };
  if (kind === "scorekeeper")
    return scoreSchema.parse({
      ...common,
      kind,
      direction: options.direction || "high",
      target: options.target ?? null,
      rounds: [],
    });
  if (kind === "tournament") {
    const mode = options.mode || "round-robin";
    const matches: Tournament["matches"] = [];
    if (mode === "round-robin") {
      const seats: (string | null)[] = players.map((p) => p.id);
      if (seats.length % 2) seats.push(null);
      for (let r = 1; r < seats.length; r++) {
        for (let i = 0; i < seats.length / 2; i++) {
          const a = seats[i],
            b = seats[seats.length - 1 - i];
          if (a && b)
            matches.push({ id: createId(), round: r, a, b, result: null });
        }
        seats.splice(1, 0, seats.pop()!);
      }
    } else {
      let size = 2;
      while (size < players.length) size *= 2;
      const seats: (string | null)[] = players.map((p) => p.id);
      // Spread byes across the initial round; no match has two empty seats.
      const byeCount = size - seats.length;
      for (let i = 0; i < byeCount; i++) seats.splice(i * 2 + 1, 0, null);
      for (let i = 0; i < seats.length; i += 2)
        matches.push({
          id: createId(),
          round: 1,
          a: seats[i]!,
          b: seats[i + 1],
          result: seats[i + 1] ? null : "a",
        });
    }
    return advanceBracket(
      tournamentSchema.parse({ ...common, kind, mode, matches }),
    );
  }
  const minority = options.minority ?? 1;
  if (
    players.length < 3 ||
    !Number.isInteger(minority) ||
    minority < 1 ||
    minority * 2 >= players.length
  )
    throw new Error(
      "Word games need at least 3 players and fewer than half in the minority.",
    );
  const minorityIds = new Set(
    shuffle(players)
      .slice(0, minority)
      .map((p) => p.id),
  );
  const pool = wordPool(
    kind,
    options.category ?? "all",
    options.customWords ?? "",
  );
  const words = shuffle(pool[randomInt(pool.length)]) as [string, string];
  return wordsSchema.parse({
    ...common,
    kind,
    words,
    roles: Object.fromEntries(
      players.map((p) => [p.id, minorityIds.has(p.id) ? kind : "civilian"]),
    ),
    alive: players.map((p) => p.id),
    order: shuffle(players).map((p) => p.id),
    turn: 0,
    dealIndex: 0,
    cycle: 1,
    phase: "deal",
    runoff: [],
    runoffAttempt: 0,
    guesser: null,
    winner: null,
    eliminated: [],
    lastVote: {},
  });
}
export function totals(game: Score) {
  return Object.fromEntries(
    game.players.map((p) => [
      p.id,
      game.rounds.reduce((sum, r) => sum + (r.scores[p.id] ?? 0), 0),
    ]),
  );
}
export function scoreWinners(game: Score) {
  if (!game.rounds.length) return [];
  const values = totals(game);
  const best = (game.direction === "high" ? Math.max : Math.min)(
    ...Object.values(values),
  );
  if (
    game.target !== null &&
    (game.direction === "high" ? best < game.target : best > game.target)
  )
    return [];
  return game.players.filter((p) => values[p.id] === best);
}
export function matchWinner(match: Tournament["matches"][number]) {
  return match.result === "a" ? match.a : match.result === "b" ? match.b : null;
}
function advanceBracket(game: Tournament): Tournament {
  if (game.mode !== "knockout") return game;
  while (true) {
    const latest = Math.max(...game.matches.map((m) => m.round));
    const current = game.matches.filter((m) => m.round === latest);
    if (current.length === 1 || current.some((m) => !matchWinner(m)))
      return game;
    const winners = current.map((m) => matchWinner(m)!);
    for (let i = 0; i < winners.length; i += 2)
      game.matches.push({
        id: createId(),
        round: latest + 1,
        a: winners[i],
        b: winners[i + 1],
        result: null,
      });
  }
}
export function standings(game: Tournament) {
  return game.players
    .map((p) => {
      const games = game.matches.filter(
        (m) => m.b && (m.a === p.id || m.b === p.id) && m.result,
      );
      const wins = games.filter((m) => matchWinner(m) === p.id).length,
        draws = games.filter((m) => m.result === "draw").length;
      return {
        ...p,
        played: games.length,
        wins,
        draws,
        losses: games.length - wins - draws,
        points: wins * 3 + draws,
      };
    })
    .sort(
      (a, b) =>
        b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name),
    );
}
function finishWords(game: WordGame) {
  const civilians = game.alive.filter(
    (id) => game.roles[id] === "civilian",
  ).length;
  const minority = game.alive.length - civilians;
  if (minority === 0) {
    game.winner = "civilians";
    game.phase = "finished";
  } else if (civilians <= 1) {
    game.winner = "minority";
    game.phase = "finished";
  }
}
function nextClues(game: WordGame) {
  game.cycle++;
  game.order = shuffle(game.alive);
  game.turn = 0;
  game.phase = "clues";
  game.runoff = [];
  game.runoffAttempt = 0;
  game.guesser = null;
}
export function applyGame(game: Game, input: GameCommand): Game {
  const command = commandSchema.parse(input),
    next = structuredClone(game);
  if (next.kind === "scorekeeper") {
    if (command.type === "score") {
      if (
        Object.keys(command.scores).some(
          (id) => !next.players.some((p) => p.id === id),
        )
      )
        throw new Error("Unknown player in score round.");
      if (command.id && !next.rounds.some((r) => r.id === command.id))
        throw new Error("That round no longer exists.");
      const value = {
        id: command.id || createId(),
        label: command.label || `Round ${next.rounds.length + 1}`,
        scores: command.scores,
      };
      next.rounds = command.id
        ? next.rounds.map((r) => (r.id === command.id ? value : r))
        : [...next.rounds, value];
      if (Object.values(totals(next)).some((n) => Math.abs(n) > 1e9))
        throw new Error("Score total is too large.");
    } else if (command.type === "remove-round")
      next.rounds = next.rounds.filter((r) => r.id !== command.id);
    else throw new Error("That action is not available in the scorekeeper.");
  } else if (next.kind === "tournament") {
    if (command.type === "reset-after" && next.mode === "knockout") {
      next.matches = next.matches.filter((m) => m.round <= command.round);
      // Clear this round too so a new result can be selected before generating successors.
      next.matches.forEach((m) => {
        if (m.round === command.round && m.b) m.result = null;
      });
    } else if (command.type === "result") {
      const m = next.matches.find((m) => m.id === command.match);
      if (!m || !m.b) throw new Error("Choose a playable match.");
      if (next.mode === "knockout" && command.result === "draw")
        throw new Error("Knockout matches need a winner.");
      if (
        next.mode === "knockout" &&
        next.matches.some((other) => other.round > m.round && other.result)
      )
        throw new Error("Reset later rounds before correcting this result.");
      if (next.mode === "knockout")
        next.matches = next.matches.filter((other) => other.round <= m.round);
      m.result = command.result;
      advanceBracket(next);
    } else throw new Error("That action is not available in this tournament.");
  } else {
    if (command.type === "next") {
      if (next.phase === "deal") {
        next.dealIndex++;
        if (next.dealIndex >= next.players.length) next.phase = "clues";
      } else if (next.phase === "clues") {
        next.turn++;
        if (next.turn >= next.order.length) next.phase = "discussion";
      } else if (next.phase === "discussion") next.phase = "vote";
      else throw new Error("Finish the current phase first.");
    } else if (command.type === "vote" && next.phase === "vote") {
      const eligible = next.runoff.length ? next.runoff : next.alive;
      if (Object.keys(command.votes).some((id) => !eligible.includes(id)))
        throw new Error("Vote only for eligible players.");
      if (
        Object.values(command.votes).reduce((a, b) => a + b, 0) !==
        next.alive.length
      )
        throw new Error("Record exactly one vote per surviving player.");
      const most = Math.max(...eligible.map((id) => command.votes[id] || 0));
      const tied = eligible.filter((id) => (command.votes[id] || 0) === most);
      next.lastVote = command.votes;
      if (tied.length > 1) {
        if (next.runoffAttempt) nextClues(next);
        else {
          next.runoff = tied;
          next.runoffAttempt = 1;
        }
      } else {
        const id = tied[0];
        next.alive = next.alive.filter((p) => p !== id);
        next.eliminated.push({ id, role: next.roles[id] });
        if (next.roles[id] === "imposter") {
          next.guesser = id;
          next.phase = "guess";
        } else {
          finishWords(next);
          if (!next.winner) nextClues(next);
        }
      }
    } else if (command.type === "guess" && next.phase === "guess") {
      if (command.correct) {
        next.winner = "minority";
        next.phase = "finished";
      } else {
        finishWords(next);
        if (!next.winner) nextClues(next);
      }
    } else throw new Error("That action is not available in this phase.");
  }
  next.revision++;
  return gameSchema.parse(next);
}
export function projectGame(game: Game, playerId: string | null): GameView {
  if (game.kind === "scorekeeper" || game.kind === "tournament")
    return structuredClone(game);
  const { words, roles, ...publicState } = game;
  const role = playerId ? roles[playerId] : null;
  return wordViewSchema.parse({
    ...publicState,
    card: role
      ? {
          imposter: role === "imposter",
          ...(role !== "imposter"
            ? { word: role === "civilian" ? words[0] : words[1] }
            : {}),
        }
      : null,
    revealed: game.phase === "finished" ? { words, roles } : null,
  });
}
