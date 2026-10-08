import Dexie, { type EntityTable } from "dexie";
import { z } from "zod";
import { associationSchema, playerCommandSchema } from "./protocol";
import { roomSchema, peerId, token } from "./signaling";
import { sessionSchema, type Session } from "../poker/model";
export function createSecret() {
  return btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
const endpoint = z.string().url();
export const hostSchema = roomSchema.extend({
  endpoint,
  sessionId: z.string(),
  peer: peerId,
  associations: z.array(associationSchema).max(10),
});
export type HostConfig = z.infer<typeof hostSchema>;
export const guestSchema = z.object({
  endpoint,
  room: token,
  invitation: token,
  peer: peerId,
  credential: token,
  name: z.string().trim().min(1).max(24),
  session: sessionSchema.nullable(),
  seat: z.string().nullable(),
  pending: playerCommandSchema.nullable(),
});
export type GuestConfig = z.infer<typeof guestSchema>;
const db = new Dexie("playkit-connections") as Dexie & {
  settings: EntityTable<{ key: string; value: unknown }, "key">;
};
db.version(1).stores({ settings: "key" });
export async function readHost(): Promise<HostConfig | null> {
  const row = await db.settings.get("host");
  return row ? hostSchema.parse(row.value) : null;
}
export async function readGuest(): Promise<GuestConfig | null> {
  const row = await db.settings.get("guest");
  return row ? guestSchema.parse(row.value) : null;
}
export const saveHost = (value: HostConfig) =>
  db.settings.put({ key: "host", value });
export const saveGuest = (value: GuestConfig) =>
  db.settings.put({ key: "guest", value });
export const eraseHost = () => db.settings.delete("host");
export const eraseGuest = () => db.settings.delete("guest");
export function invitationLink(
  config: Pick<HostConfig, "room" | "invitation">,
) {
  // Fragment credentials are not sent to the web host or included in Referer headers.
  return `${location.origin}/join#${config.room}.${config.invitation}`;
}
export function parseInvitation(fragment: string) {
  const parts = fragment.replace(/^#/, "").split(".");
  return z
    .object({ room: token, invitation: token })
    .parse({ room: parts[0], invitation: parts[1] });
}
export function publicSnapshot(session: Session): Session {
  return { ...session, undo: [], processed: [] };
}
