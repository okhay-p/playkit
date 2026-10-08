import { createId } from "../id";
import { z } from "zod";
import { compareRanks, evaluate } from "./cards";
import {
  MAX_CHIPS,
  STREETS,
  envelopeSchema,
  sessionSchema,
  type Command,
  type Core,
  type Envelope,
  type Player,
  type Pot,
  type Result,
  type Session,
} from "./model";

export class RuleError extends Error {}
function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RuleError(message);
}
function amount(n: number) {
  requireRule(
    Number.isInteger(n) && n > 0 && n <= MAX_CHIPS,
    `Use a whole-chip amount from 1 to ${MAX_CHIPS.toLocaleString()}.`,
  );
}
const setupSchema = z.object({
  name: z.string().trim().min(1).max(40),
  smallBlind: z.number(),
  bigBlind: z.number(),
  dealerIndex: z.number().int(),
  players: z
    .array(
      z.object({ name: z.string().trim().min(1).max(24), stack: z.number() }),
    )
    .min(2)
    .max(10),
});

export function createSession(
  input: z.infer<typeof setupSchema>,
  id: string = createId(),
): Session {
  const config = setupSchema.parse(input);
  amount(config.smallBlind);
  amount(config.bigBlind);
  requireRule(
    config.smallBlind <= config.bigBlind,
    "The small blind cannot exceed the big blind.",
  );
  requireRule(
    config.dealerIndex >= 0 && config.dealerIndex < config.players.length,
    "Choose a valid dealer.",
  );
  requireRule(
    new Set(config.players.map((p) => p.name.toLowerCase())).size ===
      config.players.length,
    "Use a different name for each player.",
  );
  config.players.forEach((p) => amount(p.stack));
  const total = config.players.reduce((sum, p) => sum + p.stack, 0);
  amount(total);
  const players: Player[] = config.players.map((p, i) => ({
    ...p,
    id: `${id}:${i}`,
    contribution: 0,
    streetBet: 0,
    status: "sitting",
  }));
  return {
    version: 1,
    revision: 0,
    processed: [],
    undo: [],
    events: [],
    core: {
      id,
      name: config.name,
      players,
      dealer: players[config.dealerIndex].id,
      smallBlind: config.smallBlind,
      bigBlind: config.bigBlind,
      handNumber: 0,
      phase: "between",
      street: 0,
      actor: null,
      pending: [],
      currentBet: 0,
      lastFullRaise: config.bigBlind,
      acted: {},
      totalChips: total,
      addedChips: total,
      removedChips: 0,
      board: [],
      hands: {},
      mucked: [],
      refunds: [],
      preview: null,
      lastResult: null,
    },
  };
}

export const potTotal = (c: Core) =>
  c.players.reduce((total, p) => total + p.contribution, 0);
function player(c: Core, id: string) {
  const p = c.players.find((p) => p.id === id);
  requireRule(p, "That player is not at this table.");
  return p;
}
function clockwise(c: Core, from: string): Player[] {
  const index = c.players.findIndex((p) => p.id === from);
  return c.players.map((_, i) => c.players[(index + i + 1) % c.players.length]);
}
const live = (p: Player) => p.status === "active";
const canAct = (p: Player) => live(p) && p.stack > 0;
function pay(p: Player, n: number) {
  requireRule(n >= 0 && n <= p.stack, "Not enough chips.");
  p.stack -= n;
  p.streetBet += n;
  p.contribution += n;
}

export function legalActions(c: Core) {
  const p = c.players.find((p) => p.id === c.actor);
  if (c.phase !== "betting" || !p) return null;
  const owed = Math.max(0, c.currentBet - p.streetBet);
  const maximum = p.streetBet + p.stack;
  const reopened =
    c.acted[p.id] === undefined ||
    c.currentBet - c.acted[p.id] >= c.lastFullRaise;
  const raise =
    reopened &&
    c.players.some((other) => other.id !== p.id && canAct(other)) &&
    maximum > c.currentBet;
  return {
    player: p,
    owed,
    call: Math.min(owed, p.stack),
    maximum,
    minimum: c.currentBet + c.lastFullRaise,
    raise,
    check: owed === 0,
    allIn: maximum <= c.currentBet || raise,
  };
}

export function buildPots(c: Core): Pot[] {
  const levels = [
    ...new Set(c.players.map((p) => p.contribution).filter(Boolean)),
  ].sort((a, b) => a - b);
  let previous = 0;
  return levels.map((cap) => {
    const contributors = c.players.filter((p) => p.contribution >= cap);
    const pot = {
      cap,
      amount: (cap - previous) * contributors.length,
      eligible: contributors.filter(live).map((p) => p.id),
    };
    previous = cap;
    requireRule(
      pot.eligible.length,
      "A pot has no eligible player. Undo the last action to correct the hand.",
    );
    return pot;
  });
}

function refundUncalled(c: Core, emit: (s: string) => void) {
  const bets = [...c.players].sort((a, b) => b.streetBet - a.streetBet);
  const excess = bets[0].streetBet - (bets[1]?.streetBet ?? 0);
  if (excess > 0) {
    bets[0].stack += excess;
    bets[0].streetBet -= excess;
    bets[0].contribution -= excess;
    c.refunds.push({ playerId: bets[0].id, amount: excess });
    emit(`${bets[0].name} received ${excess} uncalled chips back`);
  }
}
function award(c: Core, result: Result) {
  c.players.forEach((p) => {
    p.stack += result.awards[p.id] ?? 0;
    p.contribution = 0;
    p.streetBet = 0;
  });
  c.lastResult = result;
  c.preview = null;
  c.phase = "settled";
  c.actor = null;
  c.pending = [];
}
function advance(c: Core, emit: (s: string) => void) {
  c.pending = c.pending.filter((id) => canAct(player(c, id)));
  const survivors = c.players.filter(live);
  if (survivors.length === 1) {
    refundUncalled(c, emit);
    const total = potTotal(c);
    const result = {
      total,
      awards: { [survivors[0].id]: total },
      pots: buildPots(c).map((pot) => ({
        ...pot,
        winners: [survivors[0].id],
        description: "Everyone else folded",
      })),
    };
    award(c, result);
    emit(`${survivors[0].name} won ${total} chips — everyone else folded`);
    return;
  }
  // A sole player with chips may respond to an outstanding wager, but cannot bet against all-ins.
  const withChips = c.players.filter(canAct);
  if (withChips.length === 1) {
    // When every opponent is all-in, only an actual outstanding wager can be called.
    // A nominal short-blind bring-in must not create an artificial action or side bet.
    const actualWager = Math.max(
      0,
      ...c.players
        .filter((p) => p.id !== withChips[0].id)
        .map((p) => p.streetBet),
    );
    c.currentBet = Math.min(c.currentBet, actualWager);
  }
  if (withChips.length <= 1)
    c.pending = c.pending.filter(
      (id) => player(c, id).streetBet < c.currentBet,
    );
  if (c.pending.length) {
    c.actor = c.pending[0];
    return;
  }
  refundUncalled(c, emit);
  c.actor = null;
  c.phase = c.street === 3 ? "showdown" : "awaiting";
  emit(`${STREETS[c.street]} betting complete`);
}
function start(c: Core, emit: (s: string) => void) {
  requireRule(
    c.phase === "between" || c.phase === "settled",
    "Finish this hand before dealing another.",
  );
  requireRule(
    c.players.filter((p) => p.stack > 0).length >= 2,
    "At least two players need chips. Rebuy between hands.",
  );
  if (c.handNumber > 0 || player(c, c.dealer).stack === 0)
    c.dealer = clockwise(c, c.dealer).find((p) => p.stack > 0)!.id;
  c.handNumber++;
  c.street = 0;
  c.phase = "betting";
  c.acted = {};
  c.currentBet = c.bigBlind;
  c.lastFullRaise = c.bigBlind;
  c.board = [];
  c.hands = {};
  c.mucked = [];
  c.preview = null;
  c.lastResult = null;
  c.refunds = [];
  c.players.forEach((p) => {
    p.contribution = 0;
    p.streetBet = 0;
    p.status = p.stack > 0 ? "active" : "sitting";
  });
  const headsUp = c.players.filter(live).length === 2;
  const sb = headsUp ? player(c, c.dealer) : clockwise(c, c.dealer).find(live)!;
  const bb = clockwise(c, sb.id).find(live)!;
  pay(sb, Math.min(sb.stack, c.smallBlind));
  pay(bb, Math.min(bb.stack, c.bigBlind));
  emit(`Hand #${c.handNumber} · ${player(c, c.dealer).name} deals`);
  emit(`${sb.name} posted ${sb.streetBet} · ${bb.name} posted ${bb.streetBet}`);
  c.pending = clockwise(c, bb.id)
    .filter(canAct)
    .map((p) => p.id);
  advance(c, emit);
}

function takeAction(
  c: Core,
  command: Extract<Command, { type: "action" }>,
  emit: (s: string) => void,
) {
  const legal = legalActions(c);
  requireRule(
    legal && legal.player.id === command.playerId,
    "It is not that player’s turn.",
  );
  const p = legal.player;
  if (command.kind === "fold") {
    p.status = "folded";
    emit(`${p.name} folded`);
  } else if (command.kind === "check") {
    requireRule(legal.check, `Call ${legal.call} chips or fold.`);
    c.acted[p.id] = c.currentBet;
    emit(`${p.name} checked`);
  } else if (
    command.kind === "call" ||
    (command.kind === "all-in" && legal.maximum <= c.currentBet)
  ) {
    requireRule(legal.owed > 0, "There is nothing to call. Check instead.");
    pay(p, legal.call);
    c.acted[p.id] = c.currentBet;
    emit(`${p.name} called ${legal.call}${p.stack === 0 ? " · all-in" : ""}`);
  } else {
    requireRule(
      legal.raise,
      "Raising is not available: action has not reopened, or no opponent can respond.",
    );
    const to = command.kind === "all-in" ? legal.maximum : command.to;
    requireRule(
      to !== undefined &&
        Number.isInteger(to) &&
        to > c.currentBet &&
        to <= legal.maximum,
      "Choose a valid total street bet.",
    );
    requireRule(
      to >= legal.minimum || to === legal.maximum,
      `The minimum raise is to ${legal.minimum}. A smaller increase must be all-in.`,
    );
    const increase = to - c.currentBet;
    if (increase >= c.lastFullRaise) c.lastFullRaise = increase;
    pay(p, to - p.streetBet);
    c.currentBet = to;
    c.acted[p.id] = to;
    c.pending = clockwise(c, p.id)
      .filter(
        (other) =>
          canAct(other) &&
          (other.streetBet < to || c.acted[other.id] === undefined),
      )
      .map((other) => other.id);
    emit(
      `${p.name} ${legal.owed === 0 && to === increase ? "bet" : "raised to"} ${to}${p.stack === 0 ? " · all-in" : ""}`,
    );
    advance(c, emit);
    return;
  }
  c.pending = c.pending.filter((id) => id !== p.id);
  advance(c, emit);
}

export function showdownResult(c: Core): Result {
  requireRule(
    c.phase === "showdown" || c.phase === "preview",
    "Showdown is not ready.",
  );
  const awards: Record<string, number> = {};
  const order = clockwise(c, c.dealer).map((p) => p.id);
  const pots = buildPots(c).map((pot) => {
    const eligible = pot.eligible.filter((id) => !c.mucked.includes(id));
    requireRule(eligible.length, "Every pot needs an eligible player.");
    let winners = eligible;
    let description = "Uncontested pot";
    if (pot.eligible.length > 1) {
      requireRule(c.board.length === 5, "Enter all five community cards.");
      eligible.forEach((id) =>
        requireRule(
          c.hands[id]?.length === 2,
          `Enter both cards for ${player(c, id).name}, or mark that hand as mucked.`,
        ),
      );
      const ranks = eligible.map((id) => ({
        id,
        rank: evaluate([...c.board, ...c.hands[id]]),
      }));
      const best = ranks.reduce((a, b) =>
        compareRanks(a.rank.score, b.rank.score) >= 0 ? a : b,
      );
      winners = ranks
        .filter((r) => compareRanks(r.rank.score, best.rank.score) === 0)
        .map((r) => r.id);
      description = best.rank.label;
    }
    winners.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const share = Math.floor(pot.amount / winners.length);
    const odd = pot.amount % winners.length;
    winners.forEach(
      (id, i) => (awards[id] = (awards[id] ?? 0) + share + (i < odd ? 1 : 0)),
    );
    return { ...pot, winners, description };
  });
  return { pots, awards, total: potTotal(c) };
}

function betweenHands(c: Core) {
  requireRule(
    c.phase === "between" || c.phase === "settled",
    "Change seats or add chips between hands.",
  );
}
function uniqueName(c: Core, name: string) {
  requireRule(
    !c.players.some((p) => p.name.toLowerCase() === name.toLowerCase()),
    "That name is already at the table.",
  );
}

function resultSignature(result: Result) {
  // Schema parsing may reorder object keys. Compare values, not their insertion order.
  return JSON.stringify([
    result.total,
    Object.entries(result.awards).sort(([a], [b]) => a.localeCompare(b)),
    result.pots.map((p) => [
      p.cap,
      p.amount,
      p.eligible,
      p.winners,
      p.description,
    ]),
  ]);
}

export function assertInvariants(session: Session) {
  const c = session.core;
  requireRule(
    c.players.length >= 2 && c.players.length <= 10,
    "A table needs 2–10 players.",
  );
  requireRule(
    new Set(c.players.map((p) => p.id)).size === c.players.length,
    "Player identities must be unique.",
  );
  requireRule(
    new Set(c.players.map((p) => p.name.toLowerCase())).size ===
      c.players.length,
    "Player names must be unique.",
  );
  requireRule(
    c.players.some((p) => p.id === c.dealer),
    "The dealer must be seated.",
  );
  requireRule(c.smallBlind <= c.bigBlind, "Blinds are invalid.");
  requireRule(
    c.players.every(
      (p) =>
        p.stack >= 0 && p.contribution >= 0 && p.streetBet <= p.contribution,
    ),
    "Chip counts are invalid.",
  );
  requireRule(
    c.players.reduce((total, p) => total + p.stack + p.contribution, 0) ===
      c.totalChips,
    "The session chip ledger does not balance.",
  );
  requireRule(
    c.addedChips - c.removedChips === c.totalChips,
    "Chip additions/removals do not balance.",
  );
  requireRule(
    c.actor === null ||
      (c.pending[0] === c.actor && canAct(player(c, c.actor))),
    "The current turn is invalid.",
  );
  requireRule(
    (c.phase === "betting") === (c.actor !== null),
    "The hand phase and current turn disagree.",
  );
  requireRule(
    c.phase === "betting" || c.pending.length === 0,
    "There cannot be queued actions outside betting.",
  );
  requireRule(
    c.pending.every((id) => canAct(player(c, id))) &&
      new Set(c.pending).size === c.pending.length,
    "The action queue is invalid.",
  );
  requireRule(
    !["between", "settled"].includes(c.phase) || potTotal(c) === 0,
    "Chips remain committed between hands.",
  );
  requireRule(
    (c.phase === "preview") === (c.preview !== null),
    "The payout preview and hand phase disagree.",
  );
  if (c.preview)
    requireRule(
      resultSignature(c.preview) === resultSignature(showdownResult(c)),
      "The saved payout preview does not match the shown cards.",
    );
  const cards = [...c.board, ...Object.values(c.hands).flat()];
  requireRule(
    new Set(cards).size === cards.length,
    "The same card cannot be entered twice.",
  );
}

export function restoreSession(input: unknown): Session {
  const session = sessionSchema.parse(input);
  assertInvariants(session);
  session.undo.forEach((snapshot) =>
    assertInvariants({ ...session, core: snapshot.core, undo: [] }),
  );
  return session;
}

/** Pure command transition. The caller persists this result before publishing it. */
export function applyCommand(original: Session, input: Envelope): Session {
  const envelope = envelopeSchema.parse(input);
  if (original.processed.includes(envelope.id)) return original;
  requireRule(
    envelope.expectedRevision === original.revision,
    "The table changed. Please review the current turn and try again.",
  );
  const session = structuredClone(original),
    c = session.core,
    command = envelope.command;
  const messages: string[] = [];
  const emit = (s: string) => messages.push(s);
  if (command.type === "undo") {
    const previous = session.undo.pop();
    requireRule(previous, "There is nothing to undo in this hand.");
    session.core = previous.core;
    emit(`Undo: ${previous.label}`);
  } else {
    const prior = structuredClone(c);
    switch (command.type) {
      case "start":
        start(c, emit);
        session.undo = [];
        break;
      case "action":
        takeAction(c, command, emit);
        break;
      case "deal":
        requireRule(
          c.phase === "awaiting" && c.street < 3,
          "Finish betting before dealing the next street.",
        );
        c.street++;
        c.phase = "betting";
        c.currentBet = 0;
        c.lastFullRaise = c.bigBlind;
        c.acted = {};
        c.players.forEach((p) => (p.streetBet = 0));
        c.pending = clockwise(c, c.dealer)
          .filter(canAct)
          .map((p) => p.id);
        emit(`${STREETS[c.street]} dealt`);
        advance(c, emit);
        break;
      case "showdown": {
        requireRule(
          c.phase === "showdown" || c.phase === "preview",
          "Enter cards at showdown.",
        );
        const eligible = c.players.filter(live).map((p) => p.id);
        requireRule(
          Object.keys(command.hands).every((id) => eligible.includes(id)) &&
            command.mucked.every((id) => eligible.includes(id)),
          "Only live hands belong at showdown.",
        );
        requireRule(
          new Set(command.mucked).size === command.mucked.length,
          "Mucked hands must be unique.",
        );
        for (const pot of buildPots(c))
          requireRule(
            pot.eligible.some((id) => !command.mucked.includes(id)),
            "Every pot needs an eligible winner. This hand cannot be mucked.",
          );
        c.board = command.board;
        c.hands = Object.fromEntries(
          Object.entries(command.hands).filter(
            ([id]) => !command.mucked.includes(id),
          ),
        );
        c.mucked = command.mucked;
        c.preview = null;
        c.phase = "showdown";
        emit("Showdown cards and mucked hands updated");
        break;
      }
      case "preview":
        c.preview = showdownResult(c);
        c.phase = "preview";
        emit("Payout preview prepared");
        break;
      case "settle": {
        requireRule(
          c.phase === "preview" && c.preview,
          "Review a payout preview first.",
        );
        const result = showdownResult(c);
        award(c, result);
        emit(
          `Settled ${result.total} chips · ${Object.entries(result.awards)
            .map(([id, n]) => `${player(c, id).name} +${n}`)
            .join(" · ")}`,
        );
        break;
      }
      case "rebuy": {
        betweenHands(c);
        requireRule(
          c.totalChips + command.amount <= MAX_CHIPS &&
            c.addedChips + command.amount <= MAX_CHIPS,
          "The session chip limit would be exceeded.",
        );
        player(c, command.playerId).stack += command.amount;
        c.totalChips += command.amount;
        c.addedChips += command.amount;
        emit(
          `${player(c, command.playerId).name} bought ${command.amount} more chips`,
        );
        break;
      }
      case "add-player":
        betweenHands(c);
        requireRule(c.players.length < 10, "Ten seats are already occupied.");
        uniqueName(c, command.name);
        requireRule(
          !c.players.some((p) => p.id === command.playerId),
          "That player identity is already seated.",
        );
        requireRule(
          c.totalChips + command.stack <= MAX_CHIPS &&
            c.addedChips + command.stack <= MAX_CHIPS,
          "The session chip limit would be exceeded.",
        );
        c.players.push({
          id: command.playerId,
          name: command.name,
          stack: command.stack,
          contribution: 0,
          streetBet: 0,
          status: "sitting",
        });
        c.totalChips += command.stack;
        c.addedChips += command.stack;
        emit(`${command.name} joined with ${command.stack} chips`);
        break;
      case "remove-player": {
        betweenHands(c);
        requireRule(
          c.players.length > 2,
          "Keep at least two seats at the table.",
        );
        const leaving = player(c, command.playerId);
        if (c.dealer === leaving.id)
          c.dealer =
            c.handNumber === 0
              ? clockwise(c, leaving.id)[0].id
              : clockwise(c, leaving.id).at(-2)!.id;
        c.players = c.players.filter((p) => p.id !== leaving.id);
        c.totalChips -= leaving.stack;
        c.removedChips += leaving.stack;
        emit(`${leaving.name} left with ${leaving.stack} chips`);
        break;
      }
      case "reorder":
        betweenHands(c);
        requireRule(
          command.ids.length === c.players.length &&
            new Set(command.ids).size === c.players.length &&
            command.ids.every((id) => c.players.some((p) => p.id === id)),
          "Seat order must contain every player once.",
        );
        c.players = command.ids.map((id) => player(c, id));
        emit("Seat order updated");
        break;
    }
    if (command.type !== "start")
      session.undo.push({ core: prior, label: messages[0] ?? command.type });
  }
  messages.forEach((message, i) =>
    session.events.push({
      id: `${envelope.id}:${i}`,
      hand: session.core.handNumber,
      at: envelope.at,
      message,
      correction: command.type === "undo",
    }),
  );
  session.revision++;
  session.processed.push(envelope.id);
  assertInvariants(session);
  return session;
}
