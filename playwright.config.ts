import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  // One page at a time: each page loads three.js, an 8 MB vocabulary, and runs physics every frame;
  // parallel pages against the dev server time out on navigation.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Locally: the dev server (reused if running). CI (E2E_SERVER=preview): the production-like
  // `--mode e2e` bundle served by `vite preview`, so tests exercise what players get.
  webServer: {
    command: process.env.E2E_SERVER === 'preview' ? 'yarn preview:e2e' : 'yarn start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: process.env.CI ? 120_000 : 10_000,
  },
});
