import { describe, expect, it } from "vitest";
import {
  at,
  createClock,
  restore,
  save,
  transition,
  type Config,
} from "./engine";
const config: Config = {
  names: ["Alex", "Jordan"],
  seconds: [60, 90],
  increment: 2,
  first: 1,
};
describe("shared chess clock", () => {
  it("starts explicitly, switches active players and awards Fischer increment only to the mover", () => {
    const ready = createClock(config);
    expect(at(ready, 100000).remaining).toEqual([60000, 90000]);
    let clock = transition(ready, { type: "start" }, 1000);
    clock = transition(clock, { type: "move", player: 1 }, 5500);
    expect(clock.remaining).toEqual([60000, 87500]);
    expect(clock.active).toBe(0);
    clock = transition(clock, { type: "move", player: 0 }, 7500);
    expect(clock.remaining).toEqual([60000, 87500]);
    expect(clock.active).toBe(1);
  });
  it("ignores inactive and rapid duplicate taps without granting another increment", () => {
    const clock = transition(createClock(config), { type: "start" }, 0);
    expect(transition(clock, { type: "move", player: 0 }, 1000).active).toBe(1);
    const moved = transition(clock, { type: "move", player: 1 }, 1000);
    const duplicate = transition(moved, { type: "move", player: 1 }, 1000);
    expect(duplicate.remaining).toEqual(moved.remaining);
    expect(duplicate.active).toBe(0);
  });
  it("accounts for delayed rendering without depending on tick count", () => {
    const clock = transition(createClock(config), { type: "start" }, 100);
    expect(at(clock, 45100).remaining).toEqual([60000, 45000]);
    const checkpoint = transition(clock, { type: "checkpoint" }, 25100);
    expect(at(checkpoint, 45100).remaining).toEqual(at(clock, 45100).remaining);
    expect(at(clock, 0).remaining).toEqual(clock.remaining);
  });
  it("pauses elapsed time and requires an explicit resume", () => {
    let clock = transition(createClock(config), { type: "start" }, 0);
    clock = transition(clock, { type: "pause" }, 10000);
    expect(clock.phase).toBe("paused");
    expect(at(clock, 100000).remaining).toEqual([60000, 80000]);
    expect(
      transition(clock, { type: "move", player: 1 }, 100000).remaining,
    ).toEqual(clock.remaining);
    clock = transition(clock, { type: "start" }, 100000);
    expect(at(clock, 105000).remaining).toEqual([60000, 75000]);
  });
  it("expires at zero even if a late move would otherwise add increment", () => {
    const clock = transition(createClock(config), { type: "start" }, 0);
    for (const now of [90000, 1000000]) {
      const expired = transition(clock, { type: "move", player: 1 }, now);
      expect(expired.phase).toBe("finished");
      expect(expired.active).toBe(1);
      expect(expired.remaining).toEqual([60000, 0]);
      expect(transition(expired, { type: "start" }, now).phase).toBe(
        "finished",
      );
    }
  });
  it("resets configured times and first player, including after expiration", () => {
    const clock = at(
      transition(createClock(config), { type: "start" }, 0),
      100000,
    );
    const reset = transition(clock, { type: "reset" }, 100000);
    expect(reset.remaining).toEqual([60000, 90000]);
    expect(reset.phase).toBe("ready");
    expect(reset.active).toBe(1);
    expect(reset.anchor).toBeNull();
  });
  it("restores a running saved snapshot paused, without reconstructing elapsed browser downtime", () => {
    const clock = transition(
      transition(createClock(config), { type: "start" }, 100),
      { type: "checkpoint" },
      5100,
    );
    const saved = save(clock);
    expect(saved).not.toHaveProperty("anchor");
    const recovered = restore(saved);
    expect(recovered.phase).toBe("paused");
    expect(at(recovered, 1000000).remaining).toEqual([60000, 85000]);
    expect(restore(save(createClock(config))).phase).toBe("ready");
    expect(restore(save(at(clock, 1000000))).phase).toBe("finished");
  });
  it("rejects invalid setup and corrupt recovered state", () => {
    for (const seconds of [0, -1, 1.5, Infinity, 86401])
      expect(() =>
        createClock({ ...config, seconds: [seconds, 60] }),
      ).toThrow();
    expect(() => createClock({ ...config, increment: -1 })).toThrow();
    expect(() => createClock({ ...config, names: [" ", "B"] })).toThrow();
    expect(() =>
      restore({ ...save(createClock(config)), remaining: [0, 90] }),
    ).toThrow();
    expect(() =>
      restore({ ...save(createClock(config)), version: 2 }),
    ).toThrow();
  });
});
