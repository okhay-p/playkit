import { expect, type Page } from "@playwright/test";

export async function openParticipant(page: Page, index: number) {
  await page
    .getByRole("button", {
      name: new RegExp(`^Edit (?:seat|player(?: or team)?) ${index}:`),
    })
    .click();
  return page.getByRole("dialog");
}

export async function editParticipant(
  page: Page,
  index: number,
  values: { name?: string; amount?: string },
) {
  const editor = await openParticipant(page, index);
  if (values.name !== undefined)
    await editor.getByRole("textbox").fill(values.name);
  if (values.amount !== undefined)
    await editor.getByRole("spinbutton").fill(values.amount);
  await editor
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
}

export async function removeParticipant(page: Page, index: number) {
  const editor = await openParticipant(page, index);
  await editor.getByRole("button", { name: /^Remove / }).click();
  await expect(editor).toHaveCount(0);
}

export async function addSeat(page: Page, index: number) {
  await page.getByRole("button", { name: "+ Add a seat", exact: true }).click();
  const editor = page.getByRole("dialog");
  await editor.getByRole("textbox").fill(`Player ${index}`);
  await editor.getByRole("button", { name: "Add seat", exact: true }).click();
  await expect(editor).toHaveCount(0);
}
