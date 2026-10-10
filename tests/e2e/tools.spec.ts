import { removeParticipant } from "./setup-participants";
import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  observeConnections,
  attachConnections,
} from "./connection-diagnostics";
test.beforeEach(async ({ page }, info) => {
  await observeConnections(page, info);
});
test.afterEach(async ({}, info) => {
  await attachConnections(info);
});
async function start(page: Page, path: string, title: string) {
  await page.goto(path);
  await page
    .getByRole("button", { name: `Start ${title}`, exact: true })
    .click();
}
test("scorekeeper records, corrects, undoes, and recovers offline", async ({
  page,
  context,
}) => {
  await start(page, "/scorekeeper", "Scorekeeper");
  await page.getByLabel("Alex score", { exact: true }).fill("10");
  await page.getByLabel("Jordan score", { exact: true }).fill("-2");
  await page
    .getByRole("button", { name: "Record scores", exact: true })
    .click();
  await expect(page.getByText("Leading: Alex", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit Round 1", exact: true }).click();
  await page.getByLabel("Jordan score", { exact: true }).fill("12");
  await page.getByRole("button", { name: "Save round", exact: true }).click();
  await expect(
    page.getByText("Leading: Jordan", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Undo last change", exact: true })
    .click();
  await expect(page.getByText("Leading: Alex", { exact: true })).toBeVisible();
  await expect(page.getByText(/Offline ready/)).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("Leading: Alex", { exact: true })).toBeVisible();
  await context.setOffline(false);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      this: IDBObjectStore,
      ...args: Parameters<typeof original>
    ) {
      if (this.transaction.db.name === "playkit-tools")
        throw new DOMException(
          "Simulated storage failure",
          "QuotaExceededError",
        );
      return Reflect.apply(original, this, args);
    };
  });
  await page.getByLabel("Alex score", { exact: true }).fill("7");
  await page
    .getByRole("button", { name: "Record scores", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText("Leading: Alex", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Alex score", { exact: true })).toHaveValue("7");
  await expect(
    page.getByRole("button", { name: "Edit Round 2", exact: true }),
  ).toHaveCount(0);
});
test("knockout handles a bye, advances winners, protects played later rounds, and resets explicitly", async ({
  page,
}) => {
  await page.goto("/tournament");
  await removeParticipant(page, 4);
  await page.getByLabel("Format").selectOption("knockout");
  await page
    .getByRole("button", { name: "Start Tournament manager", exact: true })
    .click();
  await expect(
    page.getByText("Alex advances with a bye", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Jordan wins", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Round 2", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Alex wins", exact: true }).click();
  await expect(page.getByText("Champion: Alex", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Taylor wins", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Reset later rounds");
  await page
    .getByRole("button", { name: "Reset round 1 and later", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm reset matches", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Round 2", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByText("Alex advances with a bye", { exact: true }),
  ).toBeVisible();
});
async function deal(page: Page, count: number) {
  for (let i = 0; i < count; i++) {
    const player = await page
      .getByRole("heading", { name: /^Pass to / })
      .textContent();
    await page
      .getByRole("button", { name: "Reveal my card", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name:
          i === count - 1
            ? "Everyone ready · start clues"
            : "Card hidden · next player",
        exact: true,
      }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Hide card", exact: true }).click();
    await page
      .getByRole("button", {
        name:
          i === count - 1
            ? "Everyone ready · start clues"
            : "Card hidden · next player",
        exact: true,
      })
      .click();
    // The next action persists asynchronously; don't reveal the previous card
    // while its replacement and privacy reset are still pending.
    await expect(
      page.getByRole("heading", { name: player!, exact: true }),
    ).toHaveCount(0);
  }
}
async function clues(page: Page, count: number) {
  for (let i = 0; i < count; i++)
    await page.getByRole("button", { name: "Clue given", exact: true }).click();
  await page.getByRole("button", { name: "Start voting", exact: true }).click();
}
test("Undercover hides cards on recovery, validates voting, and handles two ties", async ({
  page,
}) => {
  await start(page, "/undercover", "Undercover");
  await page
    .getByRole("button", { name: "Reveal my card", exact: true })
    .click();
  await expect(page.getByText("YOUR WORD", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("YOUR WORD", { exact: true })).toHaveCount(0);
  await deal(page, 4);
  await clues(page, 4);
  await page.getByRole("button", { name: "Record vote", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("exactly one vote");
  await page.getByLabel("Votes for Alex", { exact: true }).fill("2");
  await page.getByLabel("Votes for Jordan", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Record vote", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Runoff vote", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Votes for Alex", { exact: true }).fill("2");
  await page.getByLabel("Votes for Jordan", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Record vote", exact: true }).click();
  await expect(
    page.getByText("Cycle 2 · 4 still playing", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Clue given", exact: true }),
  ).toBeVisible();
});
test("Imposter receives no word and can win with a final guess", async ({
  page,
}) => {
  await start(page, "/imposter", "Imposter");
  let imposter = "";
  for (const name of ["Alex", "Jordan", "Taylor", "Casey"]) {
    await expect(
      page.getByRole("heading", { name: `Pass to ${name}`, exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Reveal my card", exact: true })
      .click();
    if (
      await page.getByText("You are the imposter", { exact: true }).isVisible()
    ) {
      imposter = name;
      await expect(page.getByText("YOUR WORD", { exact: true })).toHaveCount(0);
    }
    await page.getByRole("button", { name: "Hide card", exact: true }).click();
    await page
      .getByRole("button", {
        name:
          name === "Casey"
            ? "Everyone ready · start clues"
            : "Card hidden · next player",
        exact: true,
      })
      .click();
  }
  expect(imposter).not.toBe("");
  await clues(page, 4);
  await page.getByLabel(`Votes for ${imposter}`, { exact: true }).fill("4");
  await page.getByRole("button", { name: "Record vote", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: `${imposter} gets one guess.`,
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Guess was correct", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Imposters win!", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Civilian word:/)).toBeVisible();
});
for (const kind of ["undercover", "imposter"] as const) {
  test(`${kind} selects categories and validates a custom CSV upload before dealing`, async ({
    page,
  }) => {
    await page.goto(`/${kind}`);
    const category = page.getByLabel("Word category");
    await expect(category).toHaveValue("all");
    await category.selectOption("food");
    await expect(category).toHaveValue("food");
    await category.selectOption("custom");
    await page
      .getByRole("button", {
        name: `Start ${kind === "undercover" ? "Undercover" : "Imposter"}`,
        exact: true,
      })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      kind === "undercover" ? "even number" : "at least one",
    );
    const words = kind === "undercover" ? "Dragon,Phoenix" : "Dragon";
    await page
      .getByLabel("Upload word list (.csv or .txt)", { exact: true })
      .setInputFiles({
        name: "words.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(words),
      });
    await expect(
      page.getByRole("textbox", { name: "Custom words", exact: true }),
    ).toHaveValue(words);
    await page
      .getByRole("button", {
        name: `Start ${kind === "undercover" ? "Undercover" : "Imposter"}`,
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Reveal my card", exact: true })
      .click();
    if (kind === "undercover") {
      await expect(page.getByText(/^(Dragon|Phoenix)$/)).toBeVisible();
    } else if (
      await page.getByText("You are the imposter", { exact: true }).isVisible()
    ) {
      await expect(page.getByText("Dragon", { exact: true })).toHaveCount(0);
    } else {
      await expect(page.getByText("Dragon", { exact: true })).toBeVisible();
    }
    await page.reload();
    await expect(page.getByText(/^(Dragon|Phoenix)$/)).toHaveCount(0);
  });
}
async function openJoining(host: Page) {
  await host.getByRole("button", { name: "Invite", exact: true }).click();
  await host
    .getByRole("button", { name: "Enable joining", exact: true })
    .click();
  await expect(host.getByLabel("Game invitation")).toBeVisible();
  return host.getByLabel("Game invitation").inputValue();
}
async function join(
  browser: Browser,
  link: string,
  host: Page,
  player: string,
) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await observeConnections(page, test.info());
  await page.goto(link);
  await page.getByLabel("Your name", { exact: true }).fill(`${player} phone`);
  await page.getByRole("button", { name: "Join game", exact: true }).click();
  const picker = page.getByRole("combobox", {
    name: "Choose your player",
    exact: true,
  });
  // The roster arrives over WebRTC, whose negotiation deadline is 30 seconds.
  // Allow that deadline plus rendering rather than the 15-second action timeout.
  await expect(picker).toBeVisible({ timeout: 35_000 });
  await picker.selectOption({ label: player });
  await page
    .getByRole("button", { name: "Request player", exact: true })
    .click();
  await host
    .getByRole("button", { name: `Approve ${player} phone`, exact: true })
    .click();
  await expect(
    page.getByText("Connected to host", { exact: true }),
  ).toBeVisible();
  return { page, context };
}
test("scorekeeper phones require approval and edit permission, sync, recover, and close", async ({
  page: host,
  browser,
}) => {
  await start(host, "/scorekeeper", "Scorekeeper");
  const link = await openJoining(host);
  const phone = await join(browser, link, host, "Alex");
  try {
    await expect(
      phone.page.getByRole("button", { name: "Record scores", exact: true }),
    ).toHaveCount(0);
    await host
      .getByLabel("Allow approved phones to record results", { exact: true })
      .check();
    await expect(
      phone.page.getByRole("button", { name: "Record scores", exact: true }),
    ).toBeVisible();
    await host
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await phone.page.getByLabel("Alex score", { exact: true }).fill("7");
    await phone.page
      .getByRole("button", { name: "Record scores", exact: true })
      .click();
    await expect(
      host.getByText("Leading: Alex", { exact: true }),
    ).toBeVisible();
    await host.reload();
    // A fresh WebRTC negotiation has a 30-second deadline. Allow that deadline
    // plus host restoration instead of the default eight-second UI wait.
    await expect(
      phone.page.getByText("Connected to host", { exact: true }),
    ).toBeVisible({ timeout: 35_000 });
    await phone.page.reload();
    await expect(
      phone.page.getByText("Connected to host", { exact: true }),
    ).toBeVisible({ timeout: 35_000 });
    await expect(
      phone.page.getByText("Leading: Alex", { exact: true }),
    ).toBeVisible();
    await host.getByRole("button", { name: "Invite", exact: true }).click();
    await host
      .getByRole("button", { name: "Close joining", exact: true })
      .click();
    await host
      .getByRole("button", { name: "Confirm close joining", exact: true })
      .click();
    await expect(
      phone.page.getByRole("button", { name: "Join game", exact: true }),
    ).toBeVisible();
  } finally {
    await phone.context.close();
  }
});
test("word-game phone gets only its own card and can finish only its own clue", async ({
  page: host,
  browser,
}) => {
  await start(host, "/undercover", "Undercover");
  const link = await openJoining(host);
  const phone = await join(browser, link, host, "Alex");
  try {
    const saved = await phone.page.evaluate(() =>
      JSON.parse(localStorage.getItem("playkit-tools-guest")!),
    );
    expect(saved.view).not.toHaveProperty("roles");
    expect(saved.view).not.toHaveProperty("words");
    expect(saved.view.revealed).toBeNull();
    expect(saved.view.card.word).toBeTruthy();
    await phone.page
      .getByRole("button", { name: "Reveal my card", exact: true })
      .click();
    await expect(
      phone.page.getByText("YOUR WORD", { exact: true }),
    ).toBeVisible();
    await host
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await deal(host, 4);
    for (let i = 0; i < 4; i++) {
      const heading = host.getByRole("heading", { name: /’s clue$/ });
      await expect(heading).toBeVisible();
      const active = await heading.innerText();
      if (active === "Alex’s clue")
        await phone.page
          .getByRole("button", { name: "Clue given", exact: true })
          .click();
      else {
        await expect(
          phone.page.getByRole("button", { name: "Clue given", exact: true }),
        ).toHaveCount(0);
        await host
          .getByRole("button", { name: "Clue given", exact: true })
          .click();
      }
      if (i < 3)
        await expect(
          host.getByRole("heading", { name: active, exact: true }),
        ).toHaveCount(0);
    }
    await expect(
      phone.page.getByRole("heading", { name: "Talk it out.", exact: true }),
    ).toBeVisible();
    await expect(
      phone.page.getByRole("button", { name: "Start voting", exact: true }),
    ).toHaveCount(0);
    await host.getByRole("button", { name: "Invite", exact: true }).click();
    await host
      .getByRole("button", { name: "Close joining", exact: true })
      .click();
    await host
      .getByRole("button", { name: "Confirm close joining", exact: true })
      .click();
  } finally {
    await phone.context.close();
  }
});
