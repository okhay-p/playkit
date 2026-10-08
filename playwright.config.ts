import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: 2,
  timeout: 120_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: process.env.PLAYKIT_LIVE_E2E || "http://127.0.0.1:4173",
    actionTimeout: 15_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    // Avoid contention between headless WebKit software renderers.
    { name: "webkit", workers: 1, use: { ...devices["Desktop Safari"] } },
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
            "rm -rf .wrangler/e2e && npm run dev:signaling -- --persist-to .wrangler/e2e",
          url: "http://127.0.0.1:8787",
          reuseExistingServer: false,
          timeout: 120_000,
        },
      ],
});
