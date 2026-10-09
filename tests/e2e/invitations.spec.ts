import { expect, test } from "@playwright/test";
import jsQR from "jsqr";

for (const game of ["poker", "scorekeeper"] as const) {
  test(`${game} invitation QR is scannable and matches the copied link`, async ({
    page,
  }) => {
    await page.goto(game === "poker" ? "/poker/new" : "/scorekeeper");
    await page
      .getByRole("button", {
        name: game === "poker" ? "Create table" : "Start Scorekeeper",
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "Invite", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "Invite players", exact: true }),
    ).toBeVisible();
    const qr = page.getByRole("img", { name: "Scan to join this session" });
    await expect(qr).toHaveCount(0);
    await page
      .getByRole("button", { name: "Enable joining", exact: true })
      .click();
    await expect(qr).toBeVisible();
    const link = await page
      .getByLabel(game === "poker" ? "Invitation link" : "Game invitation")
      .inputValue();
    const pixels = await qr.evaluate(async (svg) => {
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 448;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      return Array.from(
        ctx.getImageData(0, 0, canvas.width, canvas.height).data,
      );
    });
    expect(jsQR(new Uint8ClampedArray(pixels), 448, 448)?.data).toBe(link);
    const bounds = await qr.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(200);
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );

    // Exercise clipboard success and denial without depending on browser permissions.
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            document.documentElement.dataset.copiedLink = value;
          },
        },
      });
    });
    await page.getByRole("button", { name: "Copy link", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Link copied" }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.dataset.copiedLink),
    ).toBe(link);
    await page.evaluate(() => {
      navigator.clipboard.writeText = async () => {
        throw new DOMException("Clipboard denied", "NotAllowedError");
      };
    });
    await page.getByRole("button", { name: "Copy link", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText(
      "Could not copy the link. Select it below and copy it manually.",
    );
    await expect(page.getByText("Link copied", { exact: true })).toHaveCount(0);
    await expect(qr).toBeVisible();
    await page
      .getByRole("button", { name: "Close joining", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm close joining", exact: true })
      .click();
    await expect(qr).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Copy link", exact: true }),
    ).toHaveCount(0);
  });
}
