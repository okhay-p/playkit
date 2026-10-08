import { describe, expect, it } from "vitest";
import {
  applyCommand,
  assertInvariants,
  buildPots,
  createSession,
  legalActions,
  potTotal,
  restoreSession,
  showdownResult,
} from "./engine";
import { evaluate, compareRanks } from "./cards";
import { MAX_CHIPS, type Command, type Session } from "./model";

function table(stacks = [1000, 1000, 1000, 1000], bigBlind = 10) {
  return createSession(
    {
      name: "Test table",
      players: stacks.map((stack, i) => ({
        name: ["Alex", "Jordan", "Taylor", "Casey", "Sam"][i],
        stack,
      })),
      dealerIndex: 0,
      smallBlind: bigBlind / 2,
      bigBlind,
    },
    "test",
  );
}
let sequence = 0;
function command(s: Session, c: Command) {
  return applyCommand(s, {
    id: `command:${sequence++}`,
    at: "2026-10-08T00:00:00Z",
    expectedRevision: s.revision,
    command: c,
  });
}
function action(
  s: Session,
  kind: "check" | "call" | "fold" | "raise" | "all-in",
  to?: number,
) {
  return command(s, { type: "action", playerId: s.core.actor!, kind, to });
}
function finishStreet(s: Session) {
  while (s.core.phase === "betting")
    s = action(s, legalActions(s.core)!.check ? "check" : "call");
  return s;
}
function reachShowdown(s: Session) {
  s = finishStreet(s);
  while (s.core.phase === "awaiting") {
    s = command(s, { type: "deal" });
    s = finishStreet(s);
  }
  return s;
}

describe("hand evaluation", () => {
  it.each([
    ["As Ks Qs Js Ts 2c 3d", 8, "Royal flush"],
    ["9h 8h 7h 6h 5h As Ac", 8, "Straight flush"],
    ["Ac Ad Ah As Kc Qd 2s", 7, "Four of a kind"],
    ["Ac Ad Ah Ks Kc Qd 2s", 6, "Full house"],
    ["As Js 9s 6s 3s Kd Qd", 5, "Flush"],
    ["As 2c 3d 4s 5h Kd Qh", 4, "Straight"],
    ["Ac Ad Ah Ks Qc Jd 2s", 3, "Three of a kind"],
    ["Ac Ad Kh Ks Qc Jd 2s", 2, "Two pair"],
    ["Ac Ad Kh Qs Tc 8d 2s", 1, "One pair"],
    ["Ac Kd Jh 9s 7c 5d 2s", 0, "High card"],
  ])("ranks %s", (cards, category, label) => {
    const rank = evaluate(cards.split(" "));
    expect(rank.score[0]).toBe(category);
    expect(rank.label).toBe(label);
  });
  it("uses the higher full house when seven cards contain two trips", () =>
    expect(evaluate("Ac Ad Ah Kc Kd Kh 2s".split(" ")).score).toEqual([
      6, 14, 13,
    ]));
  it("compares flush kickers and distinguishes a wheel", () => {
    expect(
      compareRanks(
        evaluate("As Qs 9s 5s 3s".split(" ")).score,
        evaluate("Ah Jh 9h 5h 3h".split(" ")).score,
      ),
    ).toBeGreaterThan(0);
    expect(evaluate("As 2d 3h 4c 5s".split(" ")).score).toEqual([4, 5]);
  });
  it("rejects duplicate and invalid cards", () => {
    expect(() => evaluate(["As", "As", "Ks", "Qs", "Js"])).toThrow();
    expect(() => evaluate(["1s", "2s", "3s", "4s", "5s"])).toThrow();
  });
});

describe("setup, blinds and action order", () => {
  it("enforces names, player count, integer chips and the numeric ceiling", () => {
    expect(() => table([MAX_CHIPS, 1])).toThrow();
    expect(() => table([1.5, 100])).toThrow();
    expect(() => table([100])).toThrow();
    expect(() =>
      createSession({
        name: "x",
        players: [
          { name: "Alex", stack: 100 },
          { name: "alex", stack: 100 },
        ],
        dealerIndex: 0,
        smallBlind: 10,
        bigBlind: 5,
      }),
    ).toThrow();
  });
  it("acts after the big blind and retains its option after calls", () => {
    let s = command(table(), { type: "start" });
    expect(s.core.actor).toBe("test:3");
    s = action(s, "call");
    s = action(s, "call");
    s = action(s, "call");
    expect(s.core.actor).toBe("test:2");
    expect(s.core.phase).toBe("betting");
    s = action(s, "check");
    expect(s.core.phase).toBe("awaiting");
    expect(potTotal(s.core)).toBe(40);
    s = command(s, { type: "deal" });
    expect(s.core.actor).toBe("test:1");
  });
  it("uses heads-up blind and postflop order", () => {
    let s = command(table([100, 100]), { type: "start" });
    expect(s.core.actor).toBe("test:0");
    expect(s.core.players[0].streetBet).toBe(5);
    s = action(s, "call");
    s = action(s, "check");
    s = command(s, { type: "deal" });
    expect(s.core.actor).toBe("test:1");
  });
  it("keeps the nominal bring-in when the big blind is short", () => {
    const s = command(table([100, 100, 3, 100]), { type: "start" });
    expect(s.core.currentBet).toBe(10);
    expect(legalActions(s.core)!.owed).toBe(10);
    expect(legalActions(s.core)!.minimum).toBe(20);
  });
  it("rejects checks facing a bet, out-of-turn actions and undersized raises", () => {
    const s = command(table(), { type: "start" });
    expect(() => action(s, "check")).toThrow();
    expect(() => action(s, "raise", 15)).toThrow("minimum");
    expect(() =>
      command(s, { type: "action", kind: "call", playerId: "test:0" }),
    ).toThrow("turn");
  });
});

describe("all-ins, reopening and uncalled bets", () => {
  it("a single short raise does not reopen a previous caller, while an unacted blind can raise", () => {
    // Preflop: Casey calls 10; Alex all-in to 15; Jordan calls; Taylor retains BB option.
    let s = command(table([15, 100, 100, 100]), { type: "start" });
    s = action(s, "call");
    s = action(s, "all-in");
    s = action(s, "call");
    expect(legalActions(s.core)!.raise).toBe(true);
    s = action(s, "call");
    expect(s.core.actor).toBe("test:3");
    expect(legalActions(s.core)!.raise).toBe(false);
    expect(() => action(s, "raise", 25)).toThrow("reopened");
  });
  it("cumulative short all-ins reopen an earlier actor, but not a later caller", () => {
    // Four postflop seats in order Jordan, Taylor, Casey, Alex.
    let s = reachFlop(table([30, 100, 25, 100]));
    s = action(s, "raise", 10);
    s = action(s, "all-in"); // Taylor has 15 after preflop.
    s = action(s, "call");
    s = action(s, "all-in"); // Alex has 20 after preflop.
    expect(s.core.actor).toBe("test:1");
    expect(legalActions(s.core)!.raise).toBe(true);
    expect(legalActions(s.core)!.minimum).toBe(30);
    s = action(s, "call");
    expect(s.core.actor).toBe("test:3");
    expect(legalActions(s.core)!.raise).toBe(false);
    expect(legalActions(s.core)!.owed).toBe(5);
  });
  it("returns unmatched excess and runs out all-ins without extra turns", () => {
    let s = command(table([100, 40]), { type: "start" });
    s = action(s, "all-in");
    s = action(s, "all-in");
    expect(s.core.phase).toBe("awaiting");
    expect(s.core.players[0].stack).toBe(60);
    expect(potTotal(s.core)).toBe(80);
    expect(s.core.refunds[0].amount).toBe(60);
    for (let i = 0; i < 3; i++) s = command(s, { type: "deal" });
    expect(s.core.phase).toBe("showdown");
    expect(s.core.actor).toBeNull();
  });
  it("does not ask a covered small blind to act against an all-in short big blind", () => {
    const s = command(table([100, 3]), { type: "start" });
    expect(s.core.phase).toBe("awaiting");
    expect(s.core.actor).toBeNull();
    expect(s.core.players.map((p) => p.stack)).toEqual([97, 0]);
    expect(potTotal(s.core)).toBe(6);
    expect(s.core.refunds[0].amount).toBe(2);
  });
  it("requires only the actual outstanding wager when both blinds are short all-ins", () => {
    let s = command(table([100, 3, 4]), { type: "start" });
    expect(legalActions(s.core)!.call).toBe(4);
    expect(legalActions(s.core)!.raise).toBe(false);
    s = action(s, "call");
    expect(s.core.phase).toBe("awaiting");
    expect(potTotal(s.core)).toBe(11);
  });
  it("lets a sole non-all-in player call or fold, but never raise against all-ins", () => {
    let s = command(table([100, 40]), { type: "start" });
    s = action(s, "raise", 20);
    s = action(s, "all-in");
    expect(legalActions(s.core)!.raise).toBe(false);
    expect(legalActions(s.core)!.owed).toBe(20);
    expect(() => action(s, "all-in")).toThrow("Raising");
    s = action(s, "call");
    expect(s.core.phase).toBe("awaiting");
  });
  it("settles fold wins immediately without any cards and conserves chips", () => {
    let s = command(table([100, 100]), { type: "start" });
    s = action(s, "fold");
    expect(s.core.phase).toBe("settled");
    expect(s.core.lastResult!.total).toBe(10);
    expect(s.core.players.map((p) => p.stack)).toEqual([95, 105]);
    expect(s.core.board).toEqual([]);
    assertInvariants(s);
  });
});
function reachFlop(s: Session) {
  return command(finishStreet(command(s, { type: "start" })), { type: "deal" });
}

describe("showdown, pots and correction", () => {
  it("awards main and side pots to different eligible winners", () => {
    let s = command(table([20, 50, 100]), { type: "start" });
    s = action(s, "all-in");
    s = action(s, "all-in");
    s = action(s, "call");
    s = reachShowdown(s);
    expect(buildPots(s.core).map((p) => p.amount)).toEqual([60, 60]);
    const hands = {
      "test:0": ["As", "Ad"],
      "test:1": ["Ks", "Kd"],
      "test:2": ["Qs", "Qd"],
    };
    s = command(s, {
      type: "showdown",
      board: ["2c", "3h", "7s", "9d", "Jc"],
      hands,
      mucked: [],
    });
    s = command(s, { type: "preview" });
    expect(s.core.preview!.awards).toEqual({ "test:0": 60, "test:1": 60 });
    s = command(s, { type: "settle" });
    expect(s.core.players.map((p) => p.stack)).toEqual([60, 60, 50]);
    assertInvariants(s);
  });
  it("includes folded contributions and allocates odd chips clockwise left of the dealer", () => {
    let s = command(table([100, 100, 100]), { type: "start" });
    s = action(s, "call");
    s = action(s, "fold");
    s = action(s, "check");
    s = reachShowdown(s);
    expect(potTotal(s.core)).toBe(25);
    s = command(s, {
      type: "showdown",
      board: ["As", "Ks", "Qs", "Js", "Ts"],
      hands: { "test:0": ["2c", "3c"], "test:2": ["4c", "5c"] },
      mucked: [],
    });
    const result = showdownResult(s.core);
    expect(result.awards).toEqual({ "test:2": 13, "test:0": 12 });
  });
  it("prevents mucking away all eligibility for a side pot", () => {
    let s = command(table([20, 50, 100]), { type: "start" });
    s = action(s, "all-in");
    s = action(s, "all-in");
    s = action(s, "call");
    s = reachShowdown(s);
    expect(() =>
      command(s, {
        type: "showdown",
        board: [],
        hands: {},
        mucked: ["test:1", "test:2"],
      }),
    ).toThrow("Every pot");
    const good = command(s, {
      type: "showdown",
      board: [],
      hands: {},
      mucked: ["test:2"],
    });
    expect(good.core.mucked).toEqual(["test:2"]);
  });
  it("requires shown hands for contested pots and rejects duplicate cards", () => {
    let s = reachShowdown(command(table([100, 100]), { type: "start" }));
    expect(() => command(s, { type: "preview" })).toThrow("five");
    expect(() =>
      command(s, {
        type: "showdown",
        board: ["As"],
        hands: { "test:0": ["As"] },
        mucked: [],
      }),
    ).toThrow("same card");
    s = command(s, {
      type: "showdown",
      board: ["As", "Kd", "7c", "4h", "2s"],
      hands: { "test:0": ["Ah", "Qh"] },
      mucked: ["test:1"],
    });
    expect(showdownResult(s.core).awards["test:0"]).toBe(20);
  });
  it("undo restores state, preserves audit history, and revisions always increase", () => {
    let s = command(table(), { type: "start" });
    const before = structuredClone(s.core);
    s = action(s, "call");
    const revision = s.revision;
    s = command(s, { type: "undo" });
    expect(s.core).toEqual(before);
    expect(s.revision).toBe(revision + 1);
    expect(s.events.at(-1)!.correction).toBe(true);
  });
  it("reverses settlement until the next hand, which rotates the dealer and closes undo", () => {
    let s = command(table([100, 100]), { type: "start" });
    s = action(s, "fold");
    s = command(s, { type: "undo" });
    expect(s.core.phase).toBe("betting");
    s = action(s, "fold");
    s = command(s, { type: "start" });
    expect(s.core.dealer).toBe("test:1");
    expect(s.undo).toEqual([]);
  });
  it("deduplicates persisted command IDs and rejects stale revisions", () => {
    const original = table();
    const envelope = {
      id: "once",
      at: "now",
      expectedRevision: 0,
      command: { type: "start" } as const,
    };
    const next = applyCommand(original, envelope);
    const restored = restoreSession(JSON.parse(JSON.stringify(next)));
    expect(applyCommand(restored, envelope)).toBe(restored);
    expect(() => applyCommand(next, { ...envelope, id: "twice" })).toThrow(
      "changed",
    );
    expect(original.core.handNumber).toBe(0);
  });
  it("validates recovery and chip conservation", () => {
    const s = command(table(), { type: "start" });
    const damaged = structuredClone(s);
    damaged.core.players[0].stack++;
    expect(() => restoreSession(damaged)).toThrow("ledger");
    expect(restoreSession(s)).toEqual(s);
  });
  it("allows roster/rebuys only between hands and keeps a chip ledger", () => {
    let s = table([100, 100]);
    s = command(s, { type: "rebuy", playerId: "test:0", amount: 50 });
    s = command(s, {
      type: "add-player",
      playerId: "new",
      name: "Taylor",
      stack: 100,
    });
    s = command(s, { type: "reorder", ids: ["new", "test:0", "test:1"] });
    s = command(s, { type: "remove-player", playerId: "test:0" });
    assertInvariants(s);
    expect(s.core.totalChips).toBe(200);
    expect(s.core.removedChips).toBe(150);
    s = command(s, { type: "start" });
    expect(() =>
      command(s, { type: "rebuy", playerId: "new", amount: 50 }),
    ).toThrow("between");
  });
  it("keeps the next dealer correct when the current dealer leaves", () => {
    let initial = command(table(), {
      type: "remove-player",
      playerId: "test:0",
    });
    expect(command(initial, { type: "start" }).core.dealer).toBe("test:1");
    let played = command(table(), { type: "start" });
    played = action(played, "fold");
    played = action(played, "fold");
    played = action(played, "fold");
    played = command(played, { type: "remove-player", playerId: "test:0" });
    expect(command(played, { type: "start" }).core.dealer).toBe("test:1");
  });
  it("rejects a saved preview whose awards no longer match the cards", () => {
    let s = reachShowdown(command(table([100, 100]), { type: "start" }));
    s = command(s, {
      type: "showdown",
      board: ["2c", "3d", "7h", "9s", "Jc"],
      hands: { "test:0": ["As", "Ad"], "test:1": ["Ks", "Kd"] },
      mucked: [],
    });
    s = command(s, { type: "preview" });
    expect(restoreSession(JSON.parse(JSON.stringify(s)))).toEqual(s);
    const damaged = structuredClone(s);
    damaged.core.preview!.awards["test:0"]++;
    expect(() => restoreSession(damaged)).toThrow("preview");
  });
  it("does not reopen a prior check after an opening short all-in below a full bet", () => {
    let s = reachFlop(table([100, 100, 15, 100]));
    s = action(s, "check");
    s = action(s, "all-in");
    expect(legalActions(s.core)!.minimum).toBe(15);
    s = action(s, "call");
    s = action(s, "call");
    expect(s.core.actor).toBe("test:1");
    expect(legalActions(s.core)!.raise).toBe(false);
  });
  it("conserves chips through seeded random legal actions and complete settlements", () => {
    let seed = 17;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    for (let game = 0; game < 50; game++) {
      let s = command(table([20, 45, 70, 100]), { type: "start" });
      for (
        let step = 0;
        step < 100 && !["showdown", "settled"].includes(s.core.phase);
        step++
      ) {
        if (s.core.phase === "awaiting") s = command(s, { type: "deal" });
        else {
          const legal = legalActions(s.core)!;
          const n = rand();
          s = action(
            s,
            n < 0.15
              ? "fold"
              : n < 0.4 && legal.allIn
                ? "all-in"
                : legal.check
                  ? "check"
                  : "call",
          );
        }
        assertInvariants(s);
      }
      if (s.core.phase === "showdown") {
        const hole = [
          ["As", "Ad"],
          ["Ks", "Kd"],
          ["Qs", "Qd"],
          ["Ts", "Td"],
        ];
        s = command(s, {
          type: "showdown",
          board: ["2c", "3h", "7s", "9d", "Jc"],
          hands: Object.fromEntries(
            s.core.players
              .filter((p) => p.status === "active")
              .map((p) => [p.id, hole[Number(p.id.at(-1))]]),
          ),
          mucked: [],
        });
        s = command(command(s, { type: "preview" }), { type: "settle" });
      }
      expect(s.core.phase).toBe("settled");
      assertInvariants(s);
    }
  });
});
