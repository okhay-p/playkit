import { expect, test, type Browser, type Page } from "@playwright/test";
async function confirm(page: Page) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
}
async function action(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).click();
  await confirm(page);
}
async function enable(host: Page) {
  await host.goto("/poker/new");
  await host.getByRole("button", { name: "Create table", exact: true }).click();
  await host.getByRole("button", { name: "Phones", exact: true }).click();
  await host
    .getByRole("button", { name: "Enable phone joining", exact: true })
    .click();
  const input = host.getByLabel("Invitation link");
  await expect(input).toBeVisible();
  return input.inputValue();
}
async function join(
  browser: Browser,
  link: string,
  name: string,
  seat: string,
  host: Page,
) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: browser.browserType().name() === "chromium",
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(link);
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Join table", exact: true }).click();
  await page.getByLabel("Choose your seat").selectOption({ label: seat });
  await page.getByRole("button", { name: "Request seat", exact: true }).click();
  await host
    .getByRole("button", { name: `Approve ${name}`, exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Friday night poker", exact: true }),
  ).toBeVisible();
  return { page, context };
}
// These are real native data channels, separate IndexedDB stores, and a local SQLite-backed Worker.
test("host and two phones play, settle, correct, and close a complete hand", async ({
  page: host,
  browser,
}) => {
  test.setTimeout(300_000);
  const link = await enable(host);
  const first = await join(browser, link, "Casey phone", "Casey", host);
  const second = await join(browser, link, "Alex phone", "Alex", host);
  try {
    await host
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await expect(
      first.page.getByRole("button", { name: "Start hand", exact: true }),
    ).toBeDisabled();
    await host.getByRole("button", { name: "Start hand", exact: true }).click();
    await confirm(host);
    await expect(
      first.page.getByRole("heading", { name: "Casey’s turn" }),
    ).toBeVisible();
    await expect(
      second.page.getByRole("button", { name: "Call 10", exact: true }),
    ).toBeDisabled();
    await host.getByRole("button", { name: "Raise", exact: true }).click();
    await action(first.page, "Call 10");
    await expect(
      host.getByRole("dialog").getByRole("button", { name: /Record raise/ }),
    ).toBeDisabled();
    await expect(
      host
        .getByRole("dialog")
        .getByText(
          "The table changed. Close this action and review the updated turn.",
          { exact: true },
        ),
    ).toBeVisible();
    await host
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await expect(
      second.page.getByRole("heading", { name: "Alex’s turn" }),
    ).toBeVisible();
    await action(second.page, "Call 10");
    await action(host, "Call 5");
    await action(host, "Check");
    for (const street of ["Flop", "Turn", "River"]) {
      await expect(
        first.page.getByRole("button", {
          name: `${street} dealt`,
          exact: true,
        }),
      ).toBeDisabled();
      await host
        .getByRole("button", { name: `${street} dealt`, exact: true })
        .click();
      for (const actor of ["Jordan", "Taylor", "Casey", "Alex"]) {
        const operator =
          actor === "Casey"
            ? first.page
            : actor === "Alex"
              ? second.page
              : host;
        await expect(
          operator.getByRole("heading", { name: `${actor}’s turn` }),
        ).toBeVisible();
        await action(operator, "Check");
      }
    }
    await expect(
      second.page.getByRole("button", { name: "Enter cards", exact: true }),
    ).toBeDisabled();
    await host
      .getByRole("button", { name: "Enter cards", exact: true })
      .click();
    for (const [i, card] of ["2c", "3d", "7h", "9s", "Jc"].entries())
      await host.getByLabel(`Community card ${i + 1}`).selectOption(card);
    for (const [name, cards] of Object.entries({
      Alex: ["As", "Ad"],
      Jordan: ["Ks", "Kd"],
      Taylor: ["Qs", "Qd"],
      Casey: ["Ts", "Td"],
    }))
      for (const [i, card] of cards.entries())
        await host.getByLabel(`${name} card ${i + 1}`).selectOption(card);
    await host
      .getByRole("button", { name: "Save showdown cards", exact: true })
      .click();
    await host
      .getByRole("button", { name: "Preview payout", exact: true })
      .click();
    await expect(
      first.page.getByRole("heading", {
        name: "Review the payout",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      first.page.getByRole("button", { name: "Confirm payout", exact: true }),
    ).toBeDisabled();
    await host
      .getByRole("button", { name: "Confirm payout", exact: true })
      .click();
    await confirm(host);
    await expect(
      second.page.getByRole("heading", {
        name: "Chips settled ✓",
        exact: true,
      }),
    ).toBeVisible();
    await host.getByRole("button", { name: "Undo last change" }).click();
    await confirm(host);
    await expect(
      second.page.getByRole("heading", {
        name: "Review the payout",
        exact: true,
      }),
    ).toBeVisible();
    await host
      .getByRole("button", { name: "Confirm payout", exact: true })
      .click();
    await confirm(host);
    await host.getByRole("button", { name: "Next hand", exact: true }).click();
    await confirm(host);
    await expect(
      first.page.getByRole("heading", { name: "Alex’s turn" }),
    ).toBeVisible();
    await host.getByRole("button", { name: "End", exact: true }).click();
    await host
      .getByRole("button", { name: "End and clear table", exact: true })
      .click();
    await expect(
      first.page.getByRole("heading", { name: "Take a seat.", exact: true }),
    ).toBeVisible();
    await expect(
      second.page.getByRole("heading", { name: "Take a seat.", exact: true }),
    ).toBeVisible();
  } finally {
    await first.context.close();
    await second.context.close();
  }
});

test("phones recover after client/host refresh, freeze offline, and require approval after revocation", async ({
  page: host,
  browser,
}) => {
  test.setTimeout(240_000);
  // Deliberately lose acknowledgments, not bets. Reloading the host clears this test-only flag.
  await host.addInitScript(() => {
    const original = RTCDataChannel.prototype.send;
    RTCDataChannel.prototype.send = function (
      this: RTCDataChannel,
      data: unknown,
    ) {
      if (
        typeof data === "string" &&
        (window as Window & { dropPokerAck?: boolean }).dropPokerAck
      ) {
        const chunk = JSON.parse(data);
        if (chunk.index === 0 && JSON.parse(chunk.text).type === "ack") {
          const testWindow = window as Window & { droppedPokerAcks?: number };
          testWindow.droppedPokerAcks = (testWindow.droppedPokerAcks ?? 0) + 1;
          return;
        }
      }
      Reflect.apply(original, this, [data]);
    };
  });
  const link = await enable(host);
  const { page: phone, context } = await join(
    browser,
    link,
    "Casey phone",
    "Casey",
    host,
  );
  try {
    await host
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await host.getByRole("button", { name: "Start hand", exact: true }).click();
    await confirm(host);
    await phone.reload();
    await expect(
      phone.getByRole("button", { name: "Call 10", exact: true }),
    ).toBeEnabled();
    await host.evaluate(() => {
      (window as Window & { dropPokerAck?: boolean }).dropPokerAck = true;
    });
    await phone.getByRole("button", { name: "Call 10", exact: true }).click();
    await confirm(phone);
    await expect(
      host.getByRole("heading", { name: "Alex’s turn" }),
    ).toBeVisible();
    await expect
      .poll(() =>
        host.evaluate(
          () =>
            (window as Window & { droppedPokerAcks?: number })
              .droppedPokerAcks ?? 0,
        ),
      )
      .toBeGreaterThanOrEqual(2);
    await phone.reload();
    // Confirm rejoin reached the old host and consumed its one retry before restarting it.
    await expect
      .poll(() =>
        host.evaluate(
          () =>
            (window as Window & { droppedPokerAcks?: number })
              .droppedPokerAcks ?? 0,
        ),
      )
      .toBeGreaterThanOrEqual(3);
    await host.reload();
    await expect(
      host.getByRole("button", { name: "Resume game", exact: true }),
    ).toBeVisible();
    await expect(
      phone.getByText("Host is reviewing the recovered table", { exact: true }),
    ).toBeVisible();
    await expect(
      phone.getByRole("button", { name: "Call 10", exact: true }),
    ).toBeDisabled();
    await expect(
      phone.getByText("Last table update saved on this phone", { exact: true }),
    ).toBeVisible();
    await expect(phone.getByRole("alert")).toHaveCount(0);
    await host
      .getByRole("button", { name: "Resume game", exact: true })
      .click();
    await expect(
      phone.getByText("Your seat: Casey", { exact: true }),
    ).toBeVisible();
    await host.getByRole("button", { name: "History", exact: true }).click();
    await expect(
      host.getByRole("dialog").getByText(/Casey called 10/),
    ).toHaveCount(1);
    await host
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await context.setOffline(true);
    await expect(
      phone.getByText("Waiting for host", { exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await action(host, "Call 10");
    await context.setOffline(false);
    await phone
      .getByRole("button", { name: "Reconnect to host", exact: true })
      .click();
    await expect(
      phone.getByRole("heading", { name: "Jordan’s turn" }),
    ).toBeVisible();
    await host.getByRole("button", { name: "Phones", exact: true }).click();
    await host
      .getByRole("button", { name: "Disconnect Casey phone", exact: true })
      .click();
    await expect(phone.getByLabel("Choose your seat")).toBeVisible();
    await phone.getByLabel("Choose your seat").selectOption({ label: "Casey" });
    await phone
      .getByRole("button", { name: "Request seat", exact: true })
      .click();
    await host
      .getByRole("button", { name: "Approve Casey phone", exact: true })
      .click();
    await expect(
      phone.getByText("Your seat: Casey", { exact: true }),
    ).toBeVisible();
    await host
      .getByRole("button", { name: "Close phone joining", exact: true })
      .click();
    await host
      .getByRole("button", { name: "Confirm close joining", exact: true })
      .click();
    await expect(
      phone.getByRole("heading", { name: "Take a seat.", exact: true }),
    ).toBeVisible();
    await expect(
      host.getByRole("heading", { name: "Jordan’s turn" }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
