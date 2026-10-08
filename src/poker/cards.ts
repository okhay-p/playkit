export const RANKS = "23456789TJQKA";
export const SUITS = ["c", "d", "h", "s"] as const;
export const DECK = SUITS.flatMap((suit) =>
  [...RANKS].map((rank) => rank + suit),
);
export const suitGlyph: Record<string, string> = {
  c: "♣",
  d: "♦",
  h: "♥",
  s: "♠",
};
const labels = [
  "High card",
  "One pair",
  "Two pair",
  "Three of a kind",
  "Straight",
  "Flush",
  "Full house",
  "Four of a kind",
  "Straight flush",
];

export type HandRank = { score: number[]; label: string; cards: string[] };

export function compareRanks(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

function five(cards: string[]): HandRank {
  const ranks = cards.map((c) => RANKS.indexOf(c[0]) + 2).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  ranks.forEach((rank) => counts.set(rank, (counts.get(rank) ?? 0) + 1));
  const groups = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || b[0] - a[0],
  );
  const unique = [...counts.keys()].sort((a, b) => b - a);
  const straight =
    unique.length === 5
      ? unique[0] - unique[4] === 4
        ? unique[0]
        : unique.join(",") === "14,5,4,3,2"
          ? 5
          : 0
      : 0;
  const flush = cards.every((c) => c[1] === cards[0][1]);
  let score: number[];
  if (straight && flush) score = [8, straight];
  else if (groups[0][1] === 4) score = [7, groups[0][0], groups[1][0]];
  else if (groups[0][1] === 3 && groups[1][1] === 2)
    score = [6, groups[0][0], groups[1][0]];
  else if (flush) score = [5, ...ranks];
  else if (straight) score = [4, straight];
  else if (groups[0][1] === 3)
    score = [3, groups[0][0], ...groups.slice(1).map((g) => g[0])];
  else if (groups[0][1] === 2 && groups[1][1] === 2)
    score = [2, groups[0][0], groups[1][0], groups[2][0]];
  else if (groups[0][1] === 2)
    score = [1, groups[0][0], ...groups.slice(1).map((g) => g[0])];
  else score = [0, ...ranks];
  return {
    score,
    label: score[0] === 8 && score[1] === 14 ? "Royal flush" : labels[score[0]],
    cards,
  };
}

export function evaluate(cards: string[]): HandRank {
  if (
    cards.length < 5 ||
    cards.length > 7 ||
    new Set(cards).size !== cards.length ||
    cards.some((c) => !DECK.includes(c))
  ) {
    throw new Error("A hand needs five to seven different, valid cards.");
  }
  let best: HandRank | undefined;
  for (let a = 0; a < cards.length - 4; a++)
    for (let b = a + 1; b < cards.length - 3; b++)
      for (let c = b + 1; c < cards.length - 2; c++)
        for (let d = c + 1; d < cards.length - 1; d++)
          for (let e = d + 1; e < cards.length; e++) {
            const rank = five([
              cards[a],
              cards[b],
              cards[c],
              cards[d],
              cards[e],
            ]);
            if (!best || compareRanks(rank.score, best.score) > 0) best = rank;
          }
  return best!;
}
