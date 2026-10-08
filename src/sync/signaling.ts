import { z } from "zod";
export const token = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/);
export const peerId = z.string().regex(/^[a-zA-Z0-9-]{16,64}$/);
export const signalSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("auth"),
    role: z.enum(["host", "guest"]),
    secret: token,
    credential: token.optional(),
    peer: peerId,
  }),
  z.object({
    type: z.literal("signal"),
    to: peerId,
    description: z
      .object({
        type: z.enum(["offer", "answer"]),
        sdp: z.string().max(32_000),
      })
      .optional(),
    candidate: z
      .object({
        candidate: z.string().max(2048),
        sdpMid: z.string().nullable(),
        sdpMLineIndex: z.number().nullable(),
        usernameFragment: z.string().nullable().optional(),
      })
      .optional(),
  }),
]);
export type Signal = z.infer<typeof signalSchema>;
export const roomSchema = z.object({
  room: token,
  hostSecret: token,
  invitation: token,
  expires: z.number(),
});
export type RoomCredentials = z.infer<typeof roomSchema>;
