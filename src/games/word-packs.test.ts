import { describe, expect, it } from "vitest";
import { createGame, projectGame, type WordGame } from "./engine";
import { parseCustomWords, wordPool } from "./word-packs";

describe("word selection", () => {
  it("keeps all 64 built-in words and draws only from the chosen category", () => {
    const all = wordPool("undercover", "all", "");
    expect(all).toHaveLength(32);
    expect(new Set(all.flat()).size).toBe(64);
    const food = wordPool("undercover", "food", "");
    for (let i = 0; i < 30; i++) {
      const g = createGame("undercover", ["A", "B", "C"], {
        category: "food",
      }) as WordGame;
      expect(
        food.some((pair) => pair.every((word) => g.words.includes(word))),
      ).toBe(true);
    }
  });

  it("reads spreadsheet CSV, quoted phrases, and empty separators", () => {
    expect(
      parseCustomWords(
        '\uFEFF"macaroni, cheese", "tea "\r\n"a ""quote""", ,coffee,',
      ),
    ).toEqual(["macaroni, cheese", "tea", 'a "quote"', "coffee"]);
    for (const text of ['"unclosed', '"closed"extra', 'bad"quote'])
      expect(() => parseCustomWords(text)).toThrow(/quotes/);
    expect(() => parseCustomWords("x".repeat(81))).toThrow(/80/);
    expect(() => parseCustomWords("a,".repeat(1001))).toThrow(/1,000/);
    expect(() => parseCustomWords(" ".repeat(100001))).toThrow(/100 KB/);
  });

  it("requires valid related pairs for Undercover and accepts a single Imposter word", () => {
    for (const text of ["", "coffee", "coffee,tea,beach"])
      expect(() => wordPool("undercover", "custom", text)).toThrow(
        /even number/,
      );
    expect(() => wordPool("undercover", "custom", "Coffee,coffee")).toThrow(
      /different/,
    );
    expect(() => wordPool("imposter", "custom", ", ,")).toThrow(/at least one/);
    const g = createGame("imposter", ["A", "B", "C"], {
      category: "custom",
      customWords: "Dragon",
    }) as WordGame;
    expect(g.words[0]).toBe("Dragon");
    const imposter = Object.keys(g.roles).find(
      (id) => g.roles[id] === "imposter",
    )!;
    expect(projectGame(g, imposter)).toMatchObject({
      card: { imposter: true },
    });
    expect(JSON.stringify(projectGame(g, imposter))).not.toContain("Dragon");
  });

  it("uses custom pair boundaries without retaining or exposing the whole list", () => {
    const g = createGame("undercover", ["A", "B", "C"], {
      category: "custom",
      customWords: "Dragon,Phoenix,Wizard,Witch",
    }) as WordGame;
    expect(
      [
        ["Dragon", "Phoenix"],
        ["Wizard", "Witch"],
      ].some((pair) => pair.every((word) => g.words.includes(word))),
    ).toBe(true);
    expect(g).not.toHaveProperty("customWords");
    const view = projectGame(g, g.players[0].id);
    expect(view).not.toHaveProperty("words");
    expect(view).not.toHaveProperty("customWords");
  });
});
