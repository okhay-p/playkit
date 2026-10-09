export const wordCategories = [
  {
    id: "food",
    label: "Food & drink",
    pairs: [
      ["Coffee", "Tea"],
      ["Cake", "Cookie"],
      ["Pizza", "Burger"],
      ["Honey", "Sugar"],
      ["Soup", "Stew"],
      ["Lemon", "Lime"],
    ],
  },
  {
    id: "nature",
    label: "Nature & animals",
    pairs: [
      ["Beach", "Island"],
      ["Rain", "Snow"],
      ["Moon", "Sun"],
      ["River", "Lake"],
      ["Mountain", "Hill"],
      ["Forest", "Garden"],
      ["Dolphin", "Whale"],
      ["Ocean", "Sea"],
    ],
  },
  {
    id: "travel",
    label: "Places & transport",
    pairs: [
      ["Train", "Bus"],
      ["Library", "Bookshop"],
      ["Bicycle", "Scooter"],
      ["Airport", "Station"],
      ["Hotel", "Hostel"],
    ],
  },
  {
    id: "objects",
    label: "Everyday objects",
    pairs: [
      ["Pillow", "Blanket"],
      ["Camera", "Telescope"],
      ["Boots", "Sneakers"],
      ["Candle", "Lamp"],
      ["Wallet", "Purse"],
      ["Kite", "Balloon"],
    ],
  },
  {
    id: "activities",
    label: "Arts & activities",
    pairs: [
      ["Guitar", "Piano"],
      ["Football", "Basketball"],
      ["Camping", "Picnic"],
      ["Painting", "Drawing"],
      ["Cinema", "Theatre"],
      ["Chess", "Checkers"],
      ["Violin", "Cello"],
    ],
  },
] as const;

export type WordCategory =
  "all" | "custom" | (typeof wordCategories)[number]["id"];
export const maxCustomBytes = 100_000;

// Commas and line breaks separate entries; CSV quotes allow commas in a phrase.
export function parseCustomWords(text: string): string[] {
  if (new TextEncoder().encode(text).length > maxCustomBytes)
    throw new Error("Use a word list smaller than 100 KB.");
  const words: string[] = [];
  let value = "",
    quoted = false,
    closed = false;
  const finish = () => {
    const word = value.trim();
    if (word.length > 80)
      throw new Error("Keep each word or phrase to 80 characters or fewer.");
    if (word) words.push(word);
    value = "";
    closed = false;
  };
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else value += char;
    } else if (char === "," || char === "\n" || char === "\r") finish();
    else if (char === '"' && !value.trim() && !closed) {
      quoted = true;
      value = "";
    } else if (char === '"' || (closed && char.trim()))
      throw new Error("Check the CSV quotes in your word list.");
    else value += char;
  }
  if (quoted) throw new Error("Close the CSV quotes in your word list.");
  finish();
  if (words.length > 1000) throw new Error("Use at most 1,000 words.");
  return words;
}

export function wordPool(
  kind: "undercover" | "imposter",
  category: WordCategory,
  custom: string,
): [string, string][] {
  if (category !== "custom") {
    const categories =
      category === "all"
        ? wordCategories
        : wordCategories.filter((c) => c.id === category);
    if (!categories.length) throw new Error("Choose a word category.");
    return categories.flatMap((c) =>
      c.pairs.map(([a, b]): [string, string] => [a, b]),
    );
  }
  const words = parseCustomWords(custom);
  if (kind === "imposter") {
    const unique = [...new Set(words.map((word) => word.toLocaleLowerCase()))];
    if (!unique.length) throw new Error("Add at least one custom word.");
    return unique.map((key) => {
      const word = words.find((w) => w.toLocaleLowerCase() === key)!;
      return [word, word];
    });
  }
  if (words.length < 2 || words.length % 2)
    throw new Error(
      "Undercover needs an even number of words: each consecutive two form a related pair.",
    );
  const pairs: [string, string][] = [];
  for (let i = 0; i < words.length; i += 2) {
    if (words[i].toLocaleLowerCase() === words[i + 1].toLocaleLowerCase())
      throw new Error("Use two different words in each Undercover pair.");
    pairs.push([words[i], words[i + 1]]);
  }
  return pairs;
}
