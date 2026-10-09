import { test, expect, type Page } from "@playwright/test";
async function setup(page: Page) {
  await page.goto("/chess");
  await page.getByLabel("Player 1 starting seconds").fill("60");
  await page.getByLabel("Player 2 starting seconds").fill("90");
  await page.getByLabel("Increment per move (seconds)").fill("2");
  await page.getByLabel("First to move").selectOption("1");
  await page.getByRole("button", { name: "Save clock", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Start clock", exact: true }),
  ).toBeEnabled();
}
async function stopped(page: Page) {
  await expect(
    page.getByRole("button", { name: "Resume clock", exact: true }),
  ).toBeEnabled();
}

test("chess switches with increments, pauses, restores, expires and resets", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Install before app timers start, and pause later than the initial time.
  // Pausing at the runner's wall clock can race the browser clock under load.
  await page.clock.install({ time: new Date("2026-01-01T08:00:00Z") });
  await setup(page);
  await page.clock.pauseAt(new Date("2026-01-01T10:00:00Z"));
  await expect(page.getByTestId("clock-0")).toHaveText("1:00");
  await expect(page.getByTestId("clock-1")).toHaveText("1:30");
  await page.getByRole("button", { name: "Start clock", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Black clock", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "White clock", exact: true }),
  ).toBeDisabled();
  await page.clock.runFor(5000);
  await expect(page.getByTestId("clock-1")).toHaveText("1:25");
  // Rendering the new time can precede the checkpoint's IndexedDB commit.
  await expect(
    page.getByRole("button", { name: "Black clock", exact: true }),
  ).toBeEnabled();
  // Two taps queued before the first save finishes must switch only once.
  await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>(
      '[aria-label="Black clock"]',
    )!;
    button.click();
    button.click();
  });
  await expect(
    page.getByRole("button", { name: "White clock", exact: true }),
  ).toBeEnabled();
  await expect(page.getByTestId("clock-1")).toHaveText("1:27");
  await page.clock.runFor(3000);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await stopped(page);
  await page.clock.runFor(10000);
  await expect(page.getByTestId("clock-0")).toHaveText("0:57");
  await page.reload();
  await stopped(page);
  await expect(page.getByText(/Recovered clock/)).toBeVisible();
  await expect(page.getByTestId("clock-0")).toHaveText("0:57");
  await page.getByRole("button", { name: "Resume clock", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "White clock", exact: true }),
  ).toBeEnabled();
  // Advance the monotonic clock while skipping most rendering callbacks.
  await page.clock.fastForward(58000);
  await expect(
    page.getByText("White ran out of time.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "White clock", exact: true }),
  ).toBeDisabled();
  await expect(page.getByTestId("clock-0")).toHaveText("0:00");
  await page.getByRole("button", { name: "Reset clock", exact: true }).click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.getByTestId("clock-0")).toHaveText("0:00");
  await page.getByRole("button", { name: "Reset clock", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm reset", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Start clock", exact: true }),
  ).toBeEnabled();
  await expect(page.getByTestId("clock-0")).toHaveText("1:00");
  await expect(page.getByTestId("clock-1")).toHaveText("1:30");
  expect(errors).toEqual([]);
});

test("chess pauses on hiding or navigation and reloads offline without touching poker", async ({
  page,
  context,
}) => {
  await page.goto("/poker/new");
  await page.getByRole("button", { name: "Create table", exact: true }).click();
  const poker = await savedPoker(page);
  expect(poker).toBeTruthy();
  await setup(page);
  await expect(
    page.getByRole("status").filter({ hasText: "Offline ready" }),
  ).toBeVisible({ timeout: 30000 });
  // Hiding in the same task as Start must queue a pause behind its pending save.
  await page.evaluate(() => {
    const start = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Start clock",
    )!;
    start.click();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await stopped(page);
  await page.evaluate(() => {
    delete (document as any).visibilityState;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await stopped(page);
  await page.getByRole("button", { name: "Resume clock", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await stopped(page);
  await page.evaluate(() => {
    delete (document as any).visibilityState;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await stopped(page);
  await page.getByRole("button", { name: "Resume clock", exact: true }).click();
  await page
    .getByRole("link", { name: "Back to toolkit", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Open chess clock →", exact: true })
    .click();
  await stopped(page);
  await context.setOffline(true);
  await page.reload();
  await stopped(page);
  await expect(
    page.getByRole("status").filter({ hasText: "Offline ready" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resume clock", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Black clock", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await stopped(page);
  await context.setOffline(false);
  await page.getByRole("button", { name: "New clock", exact: true }).click();
  await expect(page.getByLabel("Player 2 starting seconds")).toHaveValue("90");
  await page.getByRole("button", { name: "3 + 2", exact: true }).click();
  await page.getByRole("button", { name: "Save clock", exact: true }).click();
  await expect(page.getByTestId("clock-0")).toHaveText("3:00");
  expect(await savedPoker(page)).toEqual(poker);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("a stale clock tab cannot overwrite another tab and storage failures stop play", async ({
  page,
  context,
}) => {
  await setup(page);
  const other = await context.newPage();
  await other.goto("/chess");
  await expect(
    other.getByRole("button", { name: "Start clock", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Start clock", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeEnabled();
  await other.getByRole("button", { name: "Start clock", exact: true }).click();
  await expect(other.getByRole("alert")).toContainText("could not be saved");
  await expect(
    other.getByRole("button", { name: "Start clock", exact: true }),
  ).toBeDisabled();
  await other.close();
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
      if (this.transaction.db.name === "playkit-chess")
        throw new DOMException("Test write failure", "QuotaExceededError");
      return put.apply(this, args);
    };
  });
  // The next running checkpoint hits the failure; no control should be needed to stop play.
  await expect(page.getByRole("alert")).toContainText("Play is paused");
  await expect(
    page.getByRole("button", { name: "Resume clock", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await stopped(page);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

async function savedPoker(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("playkit");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      return await new Promise<unknown>((resolve, reject) => {
        const request = db
          .transaction("sessions")
          .objectStore("sessions")
          .get("active");
        request.onsuccess = () => resolve(request.result?.payload);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });
}
