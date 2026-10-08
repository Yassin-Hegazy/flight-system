import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  // Starts both apps unless they are already running (e.g. via `pnpm dev`).
  // The API needs a reachable PostgreSQL database (docker compose up -d).
  webServer: [
    {
      command: isCI ? 'pnpm --filter api run start:prod' : 'pnpm --filter api run dev',
      url: 'http://localhost:3001/health',
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    {
      command: isCI ? 'pnpm --filter web run start' : 'pnpm --filter web run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
  ],
});
