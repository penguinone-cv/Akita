import { defineConfig, devices } from "@playwright/test";

const port = 3101;
const configuredBasePath = process.env.APP_BASE_PATH ?? "/dogs/akita";
const normalizedBasePath = configuredBasePath.replace(/^\/+|\/+$/g, "");
const basePath = normalizedBasePath ? `/${normalizedBasePath}` : "";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: "pnpm dev",
    url: `http://127.0.0.1:${port}${basePath}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
