import { defineConfig, devices } from "@playwright/test";

const requestedPort = process.env.E2E_PORT ?? "4321";
const port = Number(requestedPort);

if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("E2E_PORT must be an integer from 1024 through 65535.");
}

const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  outputDir: "test-results",
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "off",
  },
  webServer: {
    command: `node scripts/assert-e2e-port-available.mjs ${port} && npm run build && npm run preview -- --host 127.0.0.1 --port ${port}`,
    url: `${baseURL}/auth/signin`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: { ASTRO_PREVIEW_BACKGROUND: "0" },
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: [
    {
      name: "auth setup",
      testMatch: "auth.setup.ts",
      teardown: "auth teardown",
    },
    {
      name: "auth teardown",
      testMatch: "auth.teardown.ts",
    },
    {
      name: "chromium",
      testMatch: "*.spec.ts",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["auth setup"],
    },
  ],
});
