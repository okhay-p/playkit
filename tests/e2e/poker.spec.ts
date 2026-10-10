import {
  addSeat,
  editParticipant,
  removeParticipant,
} from "./setup-participants";
import { test, expect, type Page } from "@playwright/test";

async function confirm(page: Page) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function setup(page: Page, stacks?: number[]) {
  await page.goto("/poker/new");
  if (stacks)
    for (let i = 0; i < stacks.length; i++)
      await editParticipant(page, i + 1, { amount: String(stacks[i]) });
  await page.getByRole("button", { name: "Create table", exact: true }).click();
  await page.getByRole("button", { name: "Start hand", exact: true }).click();
  await confirm(page);
  await expect(
    page.getByRole("heading", { name: "Casey’s turn" }),
  ).toBeVisible();
}
async function act(page: Page, name: string | RegExp) {
  await page.getByRole("button", { name, exact: true }).click();
  await confirm(page);
}
async function checkStreet(page: Page) {
  for (let i = 0; i < 4; i++) await act(page, "Check");
}
async function saved(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("playkit");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      return await new Promise<any>((resolve, reject) => {
        const req = db
          .transaction("sessions")
          .objectStore("sessions")
          .get("active");
        req.onsuccess = () => resolve(req.result?.payload);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  });
}
test("plays a complete physical hand, restores a preview, settles, and corrects it", async ({
  page,
}) => {
  // This walkthrough spans two hands and dozens of native dialog/card interactions.
  // Headless WebKit's software renderer needs more total time; each action still has a 15s limit.
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await setup(page);
  await act(page, "Call 10");
  await page
    .getByRole("button", { name: "↶ Undo last change", exact: true })
    .click();
  await confirm(page);
  await expect(
    page.getByRole("heading", { name: "Casey’s turn" }),
  ).toBeVisible();
  expect((await saved(page)).core.players[3].contribution).toBe(0);
  await act(page, "Call 10");
  await act(page, "Call 10");
  await act(page, "Call 5");
  await act(page, "Check");
  for (const street of ["Flop", "Turn", "River"]) {
    await page
      .getByRole("button", { name: `${street} dealt`, exact: true })
      .click();
    await checkStreet(page);
  }
  await page
    .getByRole("button", { name: "Preview payout", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Enter all five community cards",
  );
  await page.getByRole("button", { name: "Enter cards", exact: true }).click();
  for (const [i, card] of ["2c", "3d", "7h", "9s", "Jc"].entries())
    await page.getByLabel(`Community card ${i + 1}`).selectOption(card);
  const holeCards = {
    Alex: ["As", "Ad"],
    Jordan: ["Ks", "Kd"],
    Taylor: ["Qs", "Qd"],
    Casey: ["Ts", "Td"],
  };
  for (const [name, cards] of Object.entries(holeCards))
    for (const [i, card] of cards.entries())
      await page.getByLabel(`${name} card ${i + 1}`).selectOption(card);
  await expect(
    page.getByLabel("Jordan card 1").locator('option[value="As"]'),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Save showdown cards", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Preview payout", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review the payout" }),
  ).toBeVisible();
  const preview = await saved(page);
  expect(preview.core.preview.awards[preview.core.players[0].id]).toBe(40);
  expect(preview.core.players[0].stack).toBe(990);
  await page.getByRole("button", { name: "Enter cards", exact: true }).click();
  await page.getByLabel("Alex card 2").selectOption("Ac");
  await page
    .getByRole("button", { name: "Save showdown cards", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review the payout" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "↶ Undo last change", exact: true })
    .click();
  await confirm(page);
  expect((await saved(page)).core.hands[preview.core.players[0].id]).toEqual([
    "As",
    "Ad",
  ]);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Confirm payout", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Resume game", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm payout", exact: true })
    .click();
  await confirm(page);
  await expect(
    page.getByRole("heading", { name: "Chips settled ✓" }),
  ).toBeVisible();
  expect((await saved(page)).core.players.map((p: any) => p.stack)).toEqual([
    1030, 990, 990, 990,
  ]);
  await page
    .getByRole("button", { name: "↶ Undo last change", exact: true })
    .click();
  await confirm(page);
  await expect(
    page.getByRole("heading", { name: "Review the payout" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm payout", exact: true })
    .click();
  await confirm(page);
  await page.getByRole("button", { name: "Next hand", exact: true }).click();
  await confirm(page);
  expect((await saved(page)).undo).toHaveLength(0);
  expect(errors).toEqual([]);
});
test("fold win, rebuy, cashout, and clear the table", async ({ page }) => {
  await setup(page);
  for (let i = 0; i < 3; i++) await act(page, "Fold");
  let session = await saved(page);
  expect(session.core.phase).toBe("settled");
  expect(session.core.players.map((p: any) => p.stack)).toEqual([
    1000, 995, 1005, 1000,
  ]);
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await page.getByRole("button", { name: "Record rebuy", exact: true }).click();
  await expect(page.getByText("5,000 total chips")).toBeVisible();
  await page
    .getByRole("button", { name: "Remove", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Confirm removal", exact: true })
    .click();
  session = await saved(page);
  expect(session.core.removedChips).toBe(2000);
  expect(session.core.totalChips).toBe(3000);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "End", exact: true }).click();
  await page
    .getByRole("button", { name: "End and clear table", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Set up a poker table →" }),
  ).toBeVisible();
  expect(await saved(page)).toBeUndefined();
});
test("all-in side pots enforce muck eligibility and return excess", async ({
  page,
}) => {
  await setup(page, [30, 50, 100, 200]);
  for (let i = 0; i < 4; i++) await act(page, /All-in ·/);
  const runout = await saved(page);
  expect(runout.core.refunds.map((r: any) => r.amount)).toEqual([100]);
  for (const street of ["Flop", "Turn", "River"])
    await page
      .getByRole("button", { name: `${street} dealt`, exact: true })
      .click();
  await page.getByRole("button", { name: "Enter cards", exact: true }).click();
  for (const [i, card] of ["2c", "3d", "7h", "9s", "Jc"].entries())
    await page.getByLabel(`Community card ${i + 1}`).selectOption(card);
  const cards = {
    Alex: ["As", "Ad"],
    Jordan: ["Ks", "Kd"],
    Taylor: ["Qs", "Qd"],
    Casey: ["Ts", "Td"],
  };
  for (const [name, hand] of Object.entries(cards))
    for (const [i, card] of hand.entries())
      await page.getByLabel(`${name} card ${i + 1}`).selectOption(card);
  const muck = page.getByRole("checkbox", { name: "Muck", exact: true });
  await muck.nth(3).check();
  await expect(muck.nth(2)).toBeDisabled();
  await page
    .getByRole("button", { name: "Save showdown cards", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Preview payout", exact: true })
    .click();
  const preview = await saved(page);
  expect(preview.core.preview.pots.map((p: any) => p.amount)).toEqual([
    120, 60, 100,
  ]);
  expect(Object.values(preview.core.preview.awards)).toEqual([120, 60, 100]);
  await page
    .getByRole("button", { name: "Confirm payout", exact: true })
    .click();
  await confirm(page);
  expect((await saved(page)).core.players.map((p: any) => p.stack)).toEqual([
    120, 60, 100, 100,
  ]);
});
test("stale actions in another tab cannot overwrite a saved turn", async ({
  page,
  context,
}) => {
  await setup(page);
  const other = await context.newPage();
  await other.goto("/poker");
  await other.getByRole("button", { name: "Resume game", exact: true }).click();
  await act(page, "Call 10");
  await other.getByRole("button", { name: "Call 10", exact: true }).click();
  await other
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(
    other.getByRole("alert").filter({ hasText: "changed in another tab" }),
  ).toBeVisible();
  await expect(
    other
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm", exact: true }),
  ).toBeDisabled();
  const snapshot = await saved(other);
  expect(snapshot.revision).toBe(2);
  expect(snapshot.core.actor).toBe(snapshot.core.players[0].id);
  await other.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    other.getByRole("heading", { name: "Alex’s turn" }),
  ).toBeVisible();
  await act(page, "Call 10");
  await other.getByRole("button", { name: "End", exact: true }).click();
  await other
    .getByRole("button", { name: "End and clear table", exact: true })
    .click();
  await expect(other.getByRole("alert")).toContainText(
    "Review it before ending",
  );
  expect((await saved(other)).revision).toBe(3);
});
test("cached app restores and plays while offline, with no horizontal overflow", async ({
  page,
  context,
}) => {
  await setup(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect(
    page.getByText("Saved on this device · Offline ready"),
  ).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("button", { name: "Resume game", exact: true }).click();
  await act(page, "Call 10");
  await expect(
    page.getByRole("heading", { name: "Alex’s turn" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const fonts = await page.evaluate(() => ({
    dm: document.fonts.check('16px "DM Sans"'),
    nunito: document.fonts.check("800 16px Nunito"),
  }));
  expect(fonts).toEqual({ dm: true, nunito: true });
});
test("ten-player setup and table fit the viewport", async ({ page }) => {
  await page.goto("/poker/new");
  for (let i = 0; i < 6; i++) await addSeat(page, i + 5);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Create table", exact: true }).click();
  await expect(page.locator(".seat")).toHaveCount(10);
  const overlap = await page.locator(".seat").evaluateAll((seats) => {
    const rects = seats.map((seat) => seat.getBoundingClientRect());
    return rects.some((a, i) =>
      rects.some(
        (b, j) =>
          i < j &&
          Math.min(a.right, b.right) > Math.max(a.left, b.left) &&
          Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top),
      ),
    );
  });
  expect(overlap).toBe(false);
});

test("a failed storage transaction never advances the visible turn", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    (window as any).restorePut = () => {
      IDBObjectStore.prototype.put = original;
    };
    IDBObjectStore.prototype.put = function (
      ...args: Parameters<typeof original>
    ) {
      if (this.name === "sessions")
        throw new DOMException("Storage full", "QuotaExceededError");
      return original.apply(this, args);
    };
  });
  await page.getByRole("button", { name: "Call 10", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Storage full");
  expect((await saved(page)).revision).toBe(1);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Casey’s turn" }),
  ).toBeVisible();
  await page.evaluate(() => (window as any).restorePut());
  await act(page, "Call 10");
  await expect(
    page.getByRole("heading", { name: "Alex’s turn" }),
  ).toBeVisible();
});

test("heads-up betting, raises, fold payout, and pre-hand recovery work end to end", async ({
  page,
}) => {
  await page.goto("/poker/new");
  await removeParticipant(page, 4);
  await removeParticipant(page, 3);
  await page.getByRole("button", { name: "Create table", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Start hand", exact: true }),
  ).toBeEnabled();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Start hand", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Resume game", exact: true }).click();
  await page.getByRole("button", { name: "Start hand", exact: true }).click();
  await confirm(page);
  await expect(
    page.getByRole("heading", { name: "Alex’s turn" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Raise", exact: true }).click();
  await page.getByLabel("Total bet on this street").fill("40");
  await page
    .getByRole("button", { name: "Record raise to 40", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Jordan’s turn" }),
  ).toBeVisible();
  await act(page, "Call 30");
  await page.getByRole("button", { name: "Flop dealt", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Jordan’s turn" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Bet", exact: true }).click();
  await page.getByLabel("Total bet on this street").fill("50");
  await page
    .getByRole("button", { name: "Record bet to 50", exact: true })
    .click();
  await act(page, "Call 50");
  await page.getByRole("button", { name: "Turn dealt", exact: true }).click();
  await act(page, "Check");
  await page.getByRole("button", { name: "Bet", exact: true }).click();
  await page.getByLabel("Total bet on this street").fill("40");
  await page
    .getByRole("button", { name: "Record bet to 40", exact: true })
    .click();
  await act(page, "Fold");
  await expect(
    page.getByRole("heading", { name: "Chips settled ✓" }),
  ).toBeVisible();
  const result = await saved(page);
  expect(result.core.players.map((p: any) => p.stack)).toEqual([1090, 910]);
  expect(result.core.refunds.map((r: any) => r.amount)).toEqual([40]);
  await page.getByRole("button", { name: "Next hand", exact: true }).click();
  await confirm(page);
  await expect(
    page.getByRole("heading", { name: "Jordan’s turn" }),
  ).toBeVisible();
  expect((await saved(page)).core.handNumber).toBe(2);
});

test("short all-in blind runs out, settles, rebuys, and starts another hand", async ({
  page,
}) => {
  await page.goto("/poker/new");
  await removeParticipant(page, 4);
  await removeParticipant(page, 3);
  await editParticipant(page, 1, { amount: "100" });
  await editParticipant(page, 2, { amount: "3" });
  await page.getByRole("button", { name: "Create table", exact: true }).click();
  await page.getByRole("button", { name: "Start hand", exact: true }).click();
  await confirm(page);
  for (const street of ["Flop", "Turn", "River"])
    await page
      .getByRole("button", { name: `${street} dealt`, exact: true })
      .click();
  await page.getByRole("button", { name: "Enter cards", exact: true }).click();
  for (const [i, card] of ["2c", "3d", "7h", "9s", "Jc"].entries())
    await page.getByLabel(`Community card ${i + 1}`).selectOption(card);
  for (const [name, cards] of Object.entries({
    Alex: ["As", "Ad"],
    Jordan: ["Ks", "Kd"],
  }))
    for (const [i, card] of cards.entries())
      await page.getByLabel(`${name} card ${i + 1}`).selectOption(card);
  await page
    .getByRole("button", { name: "Save showdown cards", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Preview payout", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm payout", exact: true })
    .click();
  await confirm(page);
  expect((await saved(page)).core.players.map((p: any) => p.stack)).toEqual([
    103, 0,
  ]);
  await expect(
    page.getByRole("button", { name: "Next hand", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Player", exact: true })
    .selectOption({ label: "Jordan" });
  await page
    .getByRole("dialog")
    .getByRole("spinbutton", { name: "Chips", exact: true })
    .fill("50");
  await page.getByRole("button", { name: "Record rebuy", exact: true }).click();
  await expect(page.getByText("153 total chips")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Next hand", exact: true }).click();
  await confirm(page);
  await expect(
    page.getByRole("heading", { name: "Jordan’s turn" }),
  ).toBeVisible();
});
