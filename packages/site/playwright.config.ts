import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: 'http://localhost:4322',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: process.env.CI
      ? 'npm run preview -- --port 4322'
      : 'npm run dev -- --port 4322',
    url: 'http://localhost:4322/brain',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
