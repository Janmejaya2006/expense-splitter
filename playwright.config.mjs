import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT || 3101);
const host = "localhost";
const baseURL = `http://${host}:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: {
    timeout: 12_000,
  },
  reporter: process.env.CI ? [["dot"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run start -- --hostname ${host} --port ${port}`,
    url: `${baseURL}/login`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      ...process.env,
      APP_DB_BACKEND: "json",
      APP_DATA_DIR: path.join(process.cwd(), ".tmp", "playwright-data"),
      AUTH_REQUIRE_EMAIL_VERIFICATION: "0",
      AUTH_2FA_ENABLED: "0",
    },
  },
});
