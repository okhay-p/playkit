import { expect, it } from "vitest";
import { createGame, projectGame, type WordGame } from "./engine";
import { authorizeToolAction, toolWireSchema } from "./phones";
it("requires host edit permission and limits word actions to the speaker", () => {
  const score = createGame("scorekeeper", ["A", "B"]),
    seat = score.players[0].id;
  expect(() =>
    authorizeToolAction(projectGame(score, seat), seat, false, {
      type: "score",
      label: "",
      scores: { [seat]: 3 },
    }),
  ).toThrow();
  expect(() =>
    authorizeToolAction(projectGame(score, seat), seat, true, {
      type: "score",
      label: "",
      scores: { [seat]: 3 },
    }),
  ).not.toThrow();
  expect(() =>
    authorizeToolAction(projectGame(score, seat), seat, true, { type: "next" }),
  ).toThrow();
  const words = createGame("undercover", ["A", "B", "C"]) as WordGame;
  words.phase = "clues";
  const speaker = words.order[0],
    other = words.order[1];
  expect(() =>
    authorizeToolAction(projectGame(words, speaker), speaker, false, {
      type: "next",
    }),
  ).not.toThrow();
  expect(() =>
    authorizeToolAction(projectGame(words, other), other, false, {
      type: "next",
    }),
  ).toThrow();
  expect(() =>
    authorizeToolAction(projectGame(words, speaker), speaker, false, {
      type: "vote",
      votes: { [other]: 3 },
    }),
  ).toThrow();
});
it("rejects wrong protocol versions and invalid phone commands", () => {
  expect(
    toolWireSchema.safeParse({
      type: "hello",
      version: 1,
      name: "A",
      credential: "a".repeat(43),
    }).success,
  ).toBe(false);
  expect(
    toolWireSchema.safeParse({
      type: "action",
      version: 2,
      id: "x",
      sessionId: "x",
      revision: -1,
      command: { type: "next" },
    }).success,
  ).toBe(false);
});
