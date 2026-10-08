import { describe, expect, it } from "vitest";
import { applyCommand, createSession, restoreSession } from "../poker/engine";
import {
  approveSeat,
  authorizeCommand,
  wireSchema,
  type Association,
  type PlayerCommand,
} from "./protocol";
import { parseInvitation, publicSnapshot } from "./credentials";
function fixture() {
  const session = applyCommand(
    createSession(
      {
        name: "Together",
        smallBlind: 5,
        bigBlind: 10,
        dealerIndex: 0,
        players: [
          { name: "Alex", stack: 100 },
          { name: "Jordan", stack: 100 },
        ],
      },
      "table",
    ),
    { id: "start", expectedRevision: 0, at: "now", command: { type: "start" } },
  );
  const binding: Association = {
    peer: "phone-123456789012",
    credential: "x".repeat(43),
    seat: session.core.actor!,
    name: "Alex",
  };
  const command: PlayerCommand = {
    type: "command",
    version: 1,
    sessionId: "table",
    id: `${binding.peer}:one`,
    expectedRevision: session.revision,
    command: { type: "action", playerId: binding.seat, kind: "call" },
  };
  return { session, binding, command };
}
describe("phone authorization and retries", () => {
  it("rejects unapproved peers, impersonated seats, host operations and other tables", () => {
    const { session, binding, command } = fixture();
    expect(() =>
      authorizeCommand(session, undefined, binding.peer, command),
    ).toThrow(/approve/);
    expect(() =>
      authorizeCommand(session, binding, "another-phone", command),
    ).toThrow(/approve/);
    expect(() =>
      authorizeCommand(session, binding, binding.peer, {
        ...command,
        command: { type: "action", playerId: "other", kind: "fold" },
      }),
    ).toThrow(/own player/);
    for (const type of ["start", "deal", "undo", "settle", "preview"] as const)
      expect(() =>
        authorizeCommand(session, binding, binding.peer, {
          ...command,
          command: { type },
        }),
      ).toThrow(/own player/);
    expect(() =>
      authorizeCommand(session, binding, binding.peer, {
        ...command,
        sessionId: "wrong",
      }),
    ).toThrow(/another table/);
    expect(() =>
      authorizeCommand(session, binding, binding.peer, {
        ...command,
        id: "someone-elses-command",
      }),
    ).toThrow(/identity/);
  });
  it("resending after host reload never repeats a committed bet", () => {
    const { session, binding, command } = fixture();
    const envelope = authorizeCommand(session, binding, binding.peer, command);
    const accepted = applyCommand(session, envelope);
    const recovered = restoreSession(JSON.parse(JSON.stringify(accepted)));
    expect(applyCommand(recovered, envelope)).toEqual(accepted);
    expect(accepted.revision).toBe(session.revision + 1);
  });
  it("concurrent host/player commands accept only one revision", () => {
    const { session, binding, command } = fixture();
    const hostFirst = applyCommand(session, {
      id: "host-call",
      expectedRevision: session.revision,
      at: "now",
      command: command.command,
    });
    expect(() =>
      applyCommand(
        hostFirst,
        authorizeCommand(session, binding, binding.peer, command),
      ),
    ).toThrow(/changed/);
    const phoneFirst = applyCommand(
      session,
      authorizeCommand(session, binding, binding.peer, command),
    );
    expect(() =>
      applyCommand(phoneFirst, {
        id: "host-fold",
        expectedRevision: session.revision,
        at: "now",
        command: { type: "action", playerId: binding.seat, kind: "fold" },
      }),
    ).toThrow(/changed/);
  });
  it("rejects out-of-turn actions and double seat approval; allows explicit replacement", () => {
    const { session, binding, command } = fixture();
    const other = {
      ...binding,
      peer: "other-123456789012",
      seat: session.core.players.find((p) => p.id !== binding.seat)!.id,
    };
    expect(() =>
      applyCommand(
        session,
        authorizeCommand(session, other, other.peer, {
          ...command,
          id: `${other.peer}:one`,
          command: { type: "action", playerId: other.seat, kind: "fold" },
        }),
      ),
    ).toThrow(/turn/);
    expect(() =>
      approveSeat([binding], { ...binding, peer: other.peer }),
    ).toThrow(/already/);
    expect(approveSeat([], { ...binding, peer: other.peer })).toHaveLength(1);
  });
  it("validates protocol versions and strips host-only snapshot bookkeeping", () => {
    const { session, command } = fixture();
    expect(wireSchema.safeParse({ ...command, version: 2 }).success).toBe(
      false,
    );
    const snapshot = publicSnapshot(session);
    expect(snapshot.processed).toEqual([]);
    expect(snapshot.undo).toEqual([]);
    expect(restoreSession(snapshot).core).toEqual(session.core);
  });
  it("requires the full high-entropy invitation", () => {
    expect(parseInvitation(`#${"a".repeat(43)}.${"b".repeat(43)}`)).toEqual({
      room: "a".repeat(43),
      invitation: "b".repeat(43),
    });
    expect(() => parseInvitation("#1234.secret")).toThrow();
  });
});
