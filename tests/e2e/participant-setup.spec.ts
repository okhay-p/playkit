import { expect, test } from "@playwright/test";
import {
  editParticipant,
  openParticipant,
  removeParticipant,
} from "./setup-participants";

for (const path of [
  "/poker/new",
  "/chess",
  "/scorekeeper",
  "/tournament",
  "/undercover",
  "/imposter",
]) {
  test(`${path} shows complete long names and cancels edits without starting a game`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto(path);
    const name = "ABCDEFGHIJKLMNOPQRSTUVWX";
    await editParticipant(page, 1, { name });
    const cardName = page
      .locator(".participant-name")
      .filter({ hasText: name });
    await expect(cardName).toHaveText(name);
    expect(
      await cardName.evaluate((el) => {
        const style = getComputedStyle(el);
        return (
          el.scrollWidth <= el.clientWidth &&
          style.whiteSpace !== "nowrap" &&
          style.textOverflow !== "ellipsis"
        );
      }),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const editor = await openParticipant(page, 1);
    await expect(editor.getByRole("textbox")).toBeFocused();
    await editor.getByRole("textbox").fill("Discard this edit");
    await editor.press("Escape");
    await expect(editor).toHaveCount(0);
    await expect(cardName).toHaveText(name);
    await expect(
      page.getByRole("button", { name: new RegExp(`^Edit .* 1: ${name}$`) }),
    ).toBeFocused();
    await expect(
      page.getByRole("heading", {
        name:
          path === "/chess"
            ? "Set up your clock"
            : path === "/poker/new"
              ? "Seats, clockwise"
              : path === "/scorekeeper" || path === "/tournament"
                ? "Players or teams"
                : "Players",
        exact: true,
      }),
    ).toBeVisible();
  });
}

test("poker editor validates chips, preserves dealer identity, and undoes a removal in place", async ({
  page,
}) => {
  await page.goto("/poker/new");
  const dealer = page.getByLabel("First dealer");
  await dealer.selectOption({ label: "Taylor" });
  await removeParticipant(page, 1);
  await expect(dealer.locator("option:checked")).toHaveText("Taylor");
  await page.getByRole("button", { name: "Undo removal", exact: true }).click();
  await expect(dealer.locator("option:checked")).toHaveText("Taylor");
  await expect(page.locator(".participant-name")).toHaveText([
    "Alex",
    "Jordan",
    "Taylor",
    "Casey",
  ]);
  const editor = await openParticipant(page, 1);
  await editor.getByRole("spinbutton").fill("0");
  await editor
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(editor).toBeVisible();
  await editor.getByRole("spinbutton").fill("1234");
  await editor
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(page.getByText("1,234 chips", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create table", exact: true }).click();
  await expect(page.locator(".seat")).toHaveCount(4);
});

test("adding teams commits only on save and rejects blank or duplicate names", async ({
  page,
}) => {
  await page.goto("/scorekeeper");
  const add = page.getByRole("button", {
    name: "+ Add a player or team",
    exact: true,
  });
  await add.click();
  let editor = page.getByRole("dialog");
  await editor.getByRole("textbox").fill("Cancelled team");
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".participant-name")).toHaveCount(4);
  await add.click();
  editor = page.getByRole("dialog");
  await editor.getByRole("textbox").fill("   ");
  await editor
    .getByRole("button", { name: "Add player or team", exact: true })
    .click();
  await expect(editor.getByRole("alert")).toHaveText("Enter a name.");
  await editor.getByRole("textbox").fill(" alex ");
  await editor
    .getByRole("button", { name: "Add player or team", exact: true })
    .click();
  await expect(editor.getByRole("alert")).toContainText("different name");
  await editor.getByRole("textbox").fill("Friday Night Strategists");
  await editor
    .getByRole("button", { name: "Add player or team", exact: true })
    .click();
  await expect(page.locator(".participant-name")).toHaveCount(5);
  await page
    .getByRole("button", { name: "Start Scorekeeper", exact: true })
    .click();
  await expect(
    page.getByLabel("Friday Night Strategists score", { exact: true }),
  ).toBeVisible();
});

test("word-game minimum and chess fixed sides cannot be removed", async ({
  page,
}) => {
  await page.goto("/undercover");
  await removeParticipant(page, 4);
  let editor = await openParticipant(page, 3);
  await expect(
    editor.getByRole("button", { name: "Remove player", exact: true }),
  ).toBeDisabled();
  await editor.press("Escape");
  await page.goto("/chess");
  await expect(page.getByRole("button", { name: /^\+ Add / })).toHaveCount(0);
  editor = await openParticipant(page, 2);
  await expect(editor.getByRole("button", { name: /^Remove / })).toHaveCount(0);
  await editor.getByRole("spinbutton").fill("90");
  await editor
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await page.getByRole("button", { name: "Save clock", exact: true }).click();
  await expect(page.getByTestId("clock-1")).toHaveText("1:30");
});
