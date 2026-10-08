import { z } from "zod";
import {
  commandSchema,
  sessionSchema,
  type Envelope,
  type Session,
} from "../poker/model";
import { peerId, token } from "./signaling";
export const playerCommandSchema = z.object({
  type: z.literal("command"),
  version: z.literal(1),
  sessionId: z.string().min(1).max(128),
  id: z.string().min(1).max(128),
  expectedRevision: z.number().int().min(0),
  command: commandSchema,
});
export const wireSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hello"),
    version: z.literal(1),
    credential: token,
    name: z.string().trim().min(1).max(24),
  }),
  z.object({
    type: z.literal("request-seat"),
    version: z.literal(1),
    seat: z.string().min(1).max(128),
  }),
  playerCommandSchema,
  z.object({ type: z.literal("snapshot-request"), version: z.literal(1) }),
  z.object({
    type: z.literal("welcome"),
    version: z.literal(1),
    seats: z
      .array(
        z.object({ id: z.string(), name: z.string(), claimed: z.boolean() }),
      )
      .max(10),
  }),
  z.object({
    type: z.literal("snapshot"),
    version: z.literal(1),
    seat: z.string(),
    paused: z.boolean(),
    session: sessionSchema,
  }),
  z.object({
    type: z.literal("ack"),
    version: z.literal(1),
    id: z.string(),
    ok: z.boolean(),
    revision: z.number().int().min(0),
    error: z.string().optional(),
  }),
  z.object({
    type: z.literal("notice"),
    version: z.literal(1),
    message: z.string(),
    revoked: z.boolean().optional(),
  }),
  z.object({ type: z.literal("closed"), version: z.literal(1) }),
]);
export type Wire = z.infer<typeof wireSchema>;
export type PlayerCommand = Extract<Wire, { type: "command" }>;
export type Association = {
  peer: string;
  credential: string;
  seat: string;
  name: string;
};
export const associationSchema = z.object({
  peer: peerId,
  credential: token,
  seat: z.string(),
  name: z.string(),
});
/** Authorization comes from the approved channel; payload names/seat IDs confer no rights. */
export function authorizeCommand(
  session: Session,
  binding: Association | undefined,
  peer: string,
  data: PlayerCommand,
): Envelope {
  if (!binding || binding.peer !== peer)
    throw new Error("Ask the host to approve your seat first.");
  if (data.sessionId !== session.core.id)
    throw new Error("This action belongs to another table.");
  if (!data.id.startsWith(`${peer}:`))
    throw new Error("Invalid action identity.");
  if (data.command.type !== "action" || data.command.playerId !== binding.seat)
    throw new Error("You can only record your own player actions.");
  return {
    id: data.id,
    expectedRevision: data.expectedRevision,
    at: new Date().toISOString(),
    command: { ...data.command, playerId: binding.seat },
  };
}
export function approveSeat(
  associations: Association[],
  binding: Association,
): Association[] {
  if (
    associations.some((a) => a.peer !== binding.peer && a.seat === binding.seat)
  )
    throw new Error("That seat already has a phone. Disconnect it first.");
  return [...associations.filter((a) => a.peer !== binding.peer), binding];
}
