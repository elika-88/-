import { defineConfig, devices } from "@playwright/test";

const e2eDatabasePath = process.env.LUMINA_E2E_DATABASE_PATH ?? `.data/e2e-${process.pid}-${Date.now()}.sqlite`;
process.env.LUMINA_E2E_DATABASE_PATH = e2eDatabasePath;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    channel: process.env.PLAYWRIGHT_CHANNEL,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      LUMINA_E2E: '1',
      ADMIN_DATABASE_PATH: e2eDatabasePath,
      TURSO_DATABASE_URL: '', TURSO_AUTH_TOKEN: '', VERCEL: '', AUTH_TRUST_PROXY: '',
    },
  },
});
