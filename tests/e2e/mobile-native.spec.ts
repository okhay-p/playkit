import { test, expect } from "@playwright/test";

test("cards and the home mark lift only during mouse hover, never after touch", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  const card = page.locator("section").filter({
    has: page.getByRole("heading", { name: "A seat for everyone." }),
  });
  const home = page.getByRole("link", { name: "PlayKit home" });
  const mark = home.locator("img");
  const lift = () => card.evaluate((e) => getComputedStyle(e).translate);
  const rotation = () => mark.evaluate((e) => getComputedStyle(e).rotate);

  await expect.poll(lift).toBe("none");
  await expect.poll(rotation).toBe("none");
  if (isMobile) {
    await card.getByRole("heading").tap();
    await expect.poll(lift).toBe("none");
    await home.tap();
    await expect.poll(rotation).toBe("none");
  } else {
    await card.hover();
    await expect.poll(lift).not.toBe("none");
    await home.hover();
    await expect.poll(rotation).not.toBe("none");
    await page.mouse.move(0, 0);
    await expect.poll(lift).toBe("none");
    await expect.poll(rotation).toBe("none");
  }
});
