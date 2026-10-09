import { defineConfig, devices } from "@playwright/test";
import { availableParallelism } from "node:os";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: process.env.CI
    ? 2
    : Math.min(4, Math.max(1, Math.floor(availableParallelism() / 2))),
  reporter: [
    ["list"],
    ["json", { outputFile: "playwright-report/results.json" }],
  ],
  timeout: 120_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: process.env.PLAYKIT_LIVE_E2E || "http://127.0.0.1:4173",
    actionTimeout: 15_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    // Schedule the longest browser first so its serial work overlaps the others.
    {
      name: "webkit",
      workers: 1,
      use: {
        ...devices["Desktop Safari"],
        // Match the other desktop projects; Safari's device preset uses 2x DPR,
        // quadrupling raster work without adding functional assertions here.
        deviceScaleFactor: process.env.PLAYKIT_E2E_RETINA === "1" ? 2 : 1,
      },
    },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
  webServer: process.env.PLAYKIT_LIVE_E2E
    ? undefined
    : [
        {
          command:
            "VITE_SIGNALING_URL=http://127.0.0.1:8787 npm run build && npm run preview -- --port 4173 --strictPort",
          url: "http://127.0.0.1:4173",
          reuseExistingServer: false,
          timeout: 120_000,
        },
        {
          command:
            "rm -rf .wrangler/e2e && npm run dev:signaling -- --persist-to .wrangler/e2e --var LOCAL_ROOM_CREATE_LIMIT:100",
          url: "http://127.0.0.1:8787",
          reuseExistingServer: false,
          timeout: 120_000,
        },
      ],
});
