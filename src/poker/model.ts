import { z } from "zod";

export const MAX_CHIPS = 1_000_000_000;
const chips = z.number().int().min(0).max(MAX_CHIPS);
const card = z.string().regex(/^[2-9TJQKA][cdhs]$/);
export const playerSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(24),
  stack: chips,
  contribution: chips,
  streetBet: chips,
  status: z.enum(["sitting", "active", "folded"]),
});
export const potSchema = z.object({
  amount: chips,
  eligible: z.array(z.string()),
  cap: chips,
});
const resultSchema = z.object({
  pots: z.array(
    potSchema.extend({ winners: z.array(z.string()), description: z.string() }),
  ),
  awards: z.record(z.string(), chips),
  total: chips,
});
export const coreSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(40),
  players: z.array(playerSchema).min(2).max(10),
  dealer: z.string(),
  smallBlind: chips.min(1),
  bigBlind: chips.min(1),
  handNumber: z.number().int().min(0),
  phase: z.enum([
    "between",
    "betting",
    "awaiting",
    "showdown",
    "preview",
    "settled",
  ]),
  street: z.number().int().min(0).max(3),
  actor: z.string().nullable(),
  pending: z.array(z.string()),
  currentBet: chips,
  lastFullRaise: chips.min(1),
  acted: z.record(z.string(), chips),
  totalChips: chips,
  addedChips: chips,
  removedChips: chips,
  board: z.array(card).max(5),
  hands: z.record(z.string(), z.array(card).max(2)),
  mucked: z.array(z.string()),
  refunds: z.array(z.object({ playerId: z.string(), amount: chips })),
  preview: resultSchema.nullable(),
  lastResult: resultSchema.nullable(),
});
export const sessionSchema = z.object({
  version: z.literal(1),
  revision: z.number().int().min(0),
  core: coreSchema,
  events: z.array(
    z.object({
      id: z.string(),
      hand: z.number(),
      message: z.string(),
      at: z.string(),
      correction: z.boolean(),
    }),
  ),
  undo: z.array(z.object({ core: coreSchema, label: z.string() })),
  processed: z.array(z.string()),
});
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start") }),
  z.object({
    type: z.literal("action"),
    playerId: z.string(),
    kind: z.enum(["fold", "check", "call", "raise", "all-in"]),
    to: chips.optional(),
  }),
  z.object({ type: z.literal("deal") }),
  z.object({
    type: z.literal("showdown"),
    board: z.array(card).max(5),
    hands: z.record(z.string(), z.array(card).max(2)),
    mucked: z.array(z.string()),
  }),
  z.object({ type: z.literal("preview") }),
  z.object({ type: z.literal("settle") }),
  z.object({ type: z.literal("undo") }),
  z.object({
    type: z.literal("rebuy"),
    playerId: z.string(),
    amount: chips.min(1),
  }),
  z.object({
    type: z.literal("add-player"),
    name: z.string().trim().min(1).max(24),
    stack: chips.min(1),
    playerId: z.string().min(1),
  }),
  z.object({ type: z.literal("remove-player"), playerId: z.string() }),
  z.object({ type: z.literal("reorder"), ids: z.array(z.string()) }),
]);
export const envelopeSchema = z.object({
  id: z.string().min(1),
  expectedRevision: z.number().int().min(0),
  at: z.string(),
  command: commandSchema,
});
export type Player = z.infer<typeof playerSchema>;
export type Core = z.infer<typeof coreSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type Pot = z.infer<typeof potSchema>;
export type Result = z.infer<typeof resultSchema>;
export type Command = z.infer<typeof commandSchema>;
export type Envelope = z.infer<typeof envelopeSchema>;
export const STREETS = ["Preflop", "Flop", "Turn", "River"];
