import { z } from "zod";

export const configSchema = z.object({
  names: z.tuple([
    z.string().trim().min(1).max(40),
    z.string().trim().min(1).max(40),
  ]),
  seconds: z.tuple([
    z.number().int().min(1).max(86400),
    z.number().int().min(1).max(86400),
  ]),
  increment: z.number().int().min(0).max(3600),
  first: z.union([z.literal(0), z.literal(1)]),
});
export const savedSchema = z
  .object({
    version: z.literal(1),
    revision: z.number().int().nonnegative(),
    config: configSchema,
    remaining: z.tuple([
      z.number().nonnegative().finite(),
      z.number().nonnegative().finite(),
    ]),
    active: z.union([z.literal(0), z.literal(1)]),
    phase: z.enum(["ready", "running", "paused", "finished"]),
  })
  .refine(
    (s) =>
      s.phase === "finished"
        ? s.remaining[s.active] === 0
        : s.remaining.every((n) => n > 0),
    "Invalid clock state",
  );
export type Config = z.infer<typeof configSchema>;
export type Saved = z.infer<typeof savedSchema>;
export type Clock = Saved & { anchor: number | null };
export type Action =
  | { type: "start" | "pause" | "reset" | "checkpoint" }
  | { type: "move"; player: 0 | 1 };
export function createClock(config: Config): Clock {
  config = configSchema.parse(config);
  return {
    version: 1,
    revision: 0,
    config,
    remaining: [config.seconds[0] * 1000, config.seconds[1] * 1000],
    active: config.first,
    phase: "ready",
    anchor: null,
  };
}
/** Rendering and persistence use the same monotonic elapsed time calculation. */
export function at(clock: Clock, now: number): Clock {
  if (clock.phase !== "running" || clock.anchor === null) return clock;
  const remaining: [number, number] = [...clock.remaining];
  remaining[clock.active] = Math.max(
    0,
    remaining[clock.active] - Math.max(0, now - clock.anchor),
  );
  return {
    ...clock,
    remaining,
    anchor: Math.max(now, clock.anchor),
    phase: remaining[clock.active] === 0 ? "finished" : "running",
  };
}
export function transition(clock: Clock, action: Action, now: number): Clock {
  let next = at(clock, now);
  if (action.type === "reset")
    next = { ...createClock(clock.config), revision: clock.revision };
  else if (
    action.type === "start" &&
    (next.phase === "ready" || next.phase === "paused")
  )
    next = { ...next, phase: "running", anchor: now };
  else if (action.type === "pause" && next.phase === "running")
    next = { ...next, phase: "paused", anchor: null };
  else if (
    action.type === "move" &&
    next.phase === "running" &&
    next.active === action.player
  ) {
    const remaining: [number, number] = [...next.remaining];
    remaining[action.player] += next.config.increment * 1000;
    next = {
      ...next,
      remaining,
      active: action.player === 0 ? 1 : 0,
      anchor: now,
    };
  }
  return { ...next, revision: clock.revision + 1 };
}
export function save(clock: Clock): Saved {
  const { anchor: _anchor, ...saved } = clock;
  return savedSchema.parse(saved);
}
export function restore(value: unknown): Clock {
  const saved = savedSchema.parse(value);
  return {
    ...saved,
    phase: saved.phase === "running" ? "paused" : saved.phase,
    anchor: null,
  };
}
