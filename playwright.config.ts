import { defineConfig, devices } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, ".env") });

const port = process.env.E2E_PORT || "5055";
const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${port}`;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is required for E2E. Create a .env with a local Postgres URL (see docker-compose.yml).",
  );
}

export default defineConfig({
  testDir: path.join(__dirname, "e2e/tests"),
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["json", { outputFile: "reports/playwright-results.json" }],
    ["./e2e/reporters/validation-reporter.ts"],
  ],
  use: {
    baseURL,
    headless: true,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: port,
      DATABASE_URL: process.env.DATABASE_URL,
      SESSION_SECRET: process.env.SESSION_SECRET || "cropguard-e2e-secret",
    },
  },
});
