import { test, expect } from "@playwright/test";

test("preset selection survives rapid changes and keyboard activation stays immediate", async ({
  page,
}) => {
  await page.goto("/chess");
  const first = page.getByRole("button", { name: "1 + 0", exact: true });
  const second = page.getByRole("button", { name: "3 + 2", exact: true });
  await expect(
    page.getByRole("button", { name: "5 + 0", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await first.click();
  await second.click();
  await first.click();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(second).toHaveAttribute("aria-pressed", "false");
  await expect(
    page.getByText("White · 60 seconds", { exact: true }),
  ).toBeVisible();
  await second.focus();
  await second.press("Enter");
  await expect(second).toHaveAttribute("aria-pressed", "true");
  expect(
    await second.evaluate(
      (el) => getComputedStyle(el, "::after").transitionDuration,
    ),
  ).toBe("0s");
  await page.getByRole("button", { name: "Save clock", exact: true }).click();
  const reset = page.getByRole("button", { name: "Reset clock", exact: true });
  await reset.focus();
  await reset.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((el) => el.getAnimations().length)).toBe(0);
  await dialog.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(reset).toBeFocused();
});

test("reduced motion keeps selection feedback and dialog dismissal without movement", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/chess");
  const preset = page.getByRole("button", { name: "1 + 0", exact: true });
  await preset.click();
  await expect(preset).toHaveAttribute("aria-pressed", "true");
  expect(
    await preset.evaluate((el) => {
      const transform = getComputedStyle(el, "::after").transform;
      return (
        transform === "none" || new DOMMatrixReadOnly(transform).isIdentity
      );
    }),
  ).toBe(true);
  await page.getByRole("button", { name: "Save clock", exact: true }).click();
  const reset = page.getByRole("button", { name: "Reset clock", exact: true });
  await reset.focus();
  await reset.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(
    await dialog.evaluate((el) => {
      const transform = getComputedStyle(el).transform;
      return (
        transform === "none" || new DOMMatrixReadOnly(transform).isIdentity
      );
    }),
  ).toBe(true);
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(reset).toBeFocused();
  await reset.click();
  await expect(dialog).toBeVisible();
  await dialog.press("Escape");
  await expect(dialog).toHaveCount(0);
});
