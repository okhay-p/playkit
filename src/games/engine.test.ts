import { describe, expect, it } from "vitest";
import {
  applyGame,
  createGame,
  projectGame,
  scoreWinners,
  standings,
  totals,
  type Score,
  type Tournament,
  type WordGame,
} from "./engine";
const names = [
  "Alex",
  "Jordan",
  "Taylor",
  "Casey",
  "Morgan",
  "Sam",
  "Lee",
  "Robin",
  "Jess",
  "Pat",
];
describe("scorekeeping", () => {
  it("records penalties, corrections, ties, and target scores without mutating history", () => {
    const start = createGame("scorekeeper", names.slice(0, 2), {
      target: 10,
    }) as Score;
    const [a, b] = start.players;
    let g = applyGame(start, {
      type: "score",
      label: "First",
      scores: { [a.id]: 8, [b.id]: -2 },
    }) as Score;
    expect(start.rounds).toHaveLength(0);
    expect(scoreWinners(g)).toHaveLength(0);
    g = applyGame(g, {
      type: "score",
      label: "Second",
      scores: { [a.id]: 2, [b.id]: 12 },
    }) as Score;
    expect(totals(g)).toEqual({ [a.id]: 10, [b.id]: 10 });
    expect(scoreWinners(g)).toHaveLength(2);
    g = applyGame(g, {
      type: "score",
      id: g.rounds[0].id,
      label: "Corrected",
      scores: { [a.id]: 0, [b.id]: -2 },
    }) as Score;
    expect(scoreWinners(g).map((p) => p.name)).toEqual(["Jordan"]);
    g = applyGame(g, { type: "remove-round", id: g.rounds[1].id }) as Score;
    expect(totals(g)).toEqual({ [a.id]: 0, [b.id]: -2 });
  });
  it("supports lowest-score wins and rejects fractional or unknown scores", () => {
    const g = createGame("scorekeeper", names.slice(0, 2), {
      direction: "low",
    }) as Score;
    const [a, b] = g.players;
    const n = applyGame(g, {
      type: "score",
      label: "",
      scores: { [a.id]: -3, [b.id]: 4 },
    }) as Score;
    expect(scoreWinners(n)[0].id).toBe(a.id);
    expect(() =>
      applyGame(g, { type: "score", label: "", scores: { [a.id]: 0.5 } }),
    ).toThrow();
    expect(() =>
      applyGame(g, { type: "score", label: "", scores: { unknown: 2 } }),
    ).toThrow();
  });
});
describe("tournaments", () => {
  for (let count = 2; count <= 10; count++) {
    it(`pairs every entrant once in a ${count}-player round robin`, () => {
      const g = createGame("tournament", names.slice(0, count)) as Tournament;
      expect(g.matches).toHaveLength((count * (count - 1)) / 2);
      const pairs = new Set(g.matches.map((m) => [m.a, m.b].sort().join(":")));
      expect(pairs.size).toBe(g.matches.length);
      for (const round of new Set(g.matches.map((m) => m.round))) {
        const players = g.matches
          .filter((m) => m.round === round)
          .flatMap((m) => [m.a, m.b]);
        expect(new Set(players).size).toBe(players.length);
      }
    });
    it(`advances a ${count}-player knockout with valid byes and one champion`, () => {
      let g = createGame("tournament", names.slice(0, count), {
        mode: "knockout",
      }) as Tournament;
      let real = 0;
      while (g.matches.some((m) => m.result === null)) {
        const m = g.matches.find((m) => m.result === null)!;
        g = applyGame(g, {
          type: "result",
          match: m.id,
          result: "a",
        }) as Tournament;
        real++;
      }
      expect(real).toBe(count - 1);
      const final = g.matches.filter(
        (m) => m.round === Math.max(...g.matches.map((m) => m.round)),
      );
      expect(final).toHaveLength(1);
      expect(final[0].result).toBe("a");
    });
  }
  it("updates standings on corrected results and refuses knockout draws", () => {
    const g = createGame("tournament", names.slice(0, 2)) as Tournament;
    const won = applyGame(g, {
      type: "result",
      match: g.matches[0].id,
      result: "a",
    }) as Tournament;
    expect(standings(won)[0].points).toBe(3);
    const tied = applyGame(won, {
      type: "result",
      match: g.matches[0].id,
      result: "draw",
    }) as Tournament;
    expect(standings(tied).map((p) => p.points)).toEqual([1, 1]);
    const ko = createGame("tournament", names.slice(0, 2), {
      mode: "knockout",
    }) as Tournament;
    expect(() =>
      applyGame(ko, {
        type: "result",
        match: ko.matches[0].id,
        result: "draw",
      }),
    ).toThrow();
  });
  it("requires an explicit reset before invalidating played later rounds", () => {
    let g = createGame("tournament", names.slice(0, 4), {
      mode: "knockout",
    }) as Tournament;
    const first = g.matches[0].id;
    for (const m of [...g.matches])
      g = applyGame(g, {
        type: "result",
        match: m.id,
        result: "a",
      }) as Tournament;
    g = applyGame(g, {
      type: "result",
      match: g.matches.at(-1)!.id,
      result: "a",
    }) as Tournament;
    expect(() =>
      applyGame(g, { type: "result", match: first, result: "b" }),
    ).toThrow(/Reset later/);
    g = applyGame(g, { type: "reset-after", round: 1 }) as Tournament;
    expect(g.matches.every((m) => m.round === 1 && m.result === null)).toBe(
      true,
    );
  });
});
function voting(g: WordGame) {
  while (g.phase === "deal" || g.phase === "clues" || g.phase === "discussion")
    g = applyGame(g, { type: "next" }) as WordGame;
  return g;
}
describe("secret word games", () => {
  for (const kind of ["undercover", "imposter"] as const)
    it(`${kind} keeps roles and other words out of a player's snapshot`, () => {
      const g = createGame(kind, names.slice(0, 5), {
        minority: 2,
      }) as WordGame;
      const minority = g.players.filter((p) => g.roles[p.id] !== "civilian"),
        civilian = g.players.find((p) => g.roles[p.id] === "civilian")!;
      expect(minority).toHaveLength(2);
      const c = projectGame(g, civilian.id),
        m = projectGame(g, minority[0].id);
      expect(c).not.toHaveProperty("roles");
      expect(c).not.toHaveProperty("words");
      expect("card" in c && c.card?.word).toBe(g.words[0]);
      if (kind === "imposter")
        expect("card" in m && m.card).toEqual({ imposter: true });
      else
        expect("card" in m && m.card).toEqual({
          imposter: false,
          word: g.words[1],
        });
    });
  it("rejects invalid minority sizes, duplicate names, and incomplete voting", () => {
    expect(() =>
      createGame("imposter", names.slice(0, 4), { minority: 2 }),
    ).toThrow();
    expect(() => createGame("undercover", ["Alex", "alex", "Casey"])).toThrow();
    const g = voting(createGame("undercover", names.slice(0, 3)) as WordGame);
    expect(() =>
      applyGame(g, { type: "vote", votes: { [g.alive[0]]: 1 } }),
    ).toThrow(/exactly one/);
  });
  it("handles runoff ties without eliminating a random player", () => {
    let g = voting(createGame("undercover", names.slice(0, 4)) as WordGame);
    const [a, b] = g.alive;
    g = applyGame(g, { type: "vote", votes: { [a]: 2, [b]: 2 } }) as WordGame;
    expect(g.runoff).toEqual([a, b]);
    expect(g.phase).toBe("vote");
    g = applyGame(g, { type: "vote", votes: { [a]: 2, [b]: 2 } }) as WordGame;
    expect(g.alive).toHaveLength(4);
    expect(g.phase).toBe("clues");
    expect(g.cycle).toBe(2);
  });
  it("ends Undercover when all infiltrators are eliminated and only then reveals the deal", () => {
    let g = voting(createGame("undercover", names.slice(0, 3)) as WordGame);
    const bad = g.alive.find((id) => g.roles[id] === "undercover")!;
    g = applyGame(g, { type: "vote", votes: { [bad]: 3 } }) as WordGame;
    expect(g.winner).toBe("civilians");
    expect(g.phase).toBe("finished");
    const view = projectGame(g, null);
    expect("revealed" in view && view.revealed).toEqual({
      words: g.words,
      roles: g.roles,
    });
  });
  it("allows an eliminated imposter's final guess to steal victory or resolves the failed guess", () => {
    let g = voting(
      createGame("imposter", names.slice(0, 5), { minority: 2 }) as WordGame,
    );
    const bad = g.alive.find((id) => g.roles[id] === "imposter")!;
    g = applyGame(g, { type: "vote", votes: { [bad]: 5 } }) as WordGame;
    expect(g.phase).toBe("guess");
    expect(g.winner).toBeNull();
    const success = applyGame(g, { type: "guess", correct: true }) as WordGame;
    expect(success.winner).toBe("minority");
    const failure = applyGame(g, { type: "guess", correct: false }) as WordGame;
    expect(failure.phase).toBe("clues");
    expect(failure.alive).toHaveLength(4);
  });
});

describe("game recovery projections", () => {
  it("never reveals the other word, hidden roles, or undo history to unapproved viewers", () => {
    const g = createGame("undercover", names.slice(0, 5)) as WordGame;
    const view = projectGame(g, null);
    expect("card" in view && view.card).toBeNull();
    expect(JSON.stringify(view)).not.toContain(g.words[0]);
    expect(JSON.stringify(view)).not.toContain(g.words[1]);
    expect(view).not.toHaveProperty("roles");
    expect(view).not.toHaveProperty("history");
  });
});
it("minority players win when only one civilian remains", () => {
  let g = createGame("undercover", names.slice(0, 5), {
    minority: 2,
  }) as WordGame;
  for (let i = 0; i < 2; i++) {
    g = voting(g);
    const id = g.alive.find((id) => g.roles[id] === "civilian")!;
    g = applyGame(g, {
      type: "vote",
      votes: { [id]: g.alive.length },
    }) as WordGame;
  }
  expect(g.phase).toBe("finished");
  expect(g.winner).toBe("minority");
});
