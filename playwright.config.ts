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
  // A cold first load (vocabulary, model, dev-server compile) can take 30 s on a busy machine.
  timeout: 60_000,
  // CI: failures also become GitHub annotations, readable through the public API without `gh auth`.
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    navigationTimeout: 45_000,
    // Locally keep a trace of every failure (rare flakes are otherwise unexplainable).
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Locally: the dev server (reused if running). CI (E2E_SERVER=preview): the production-like
  // `--mode e2e` bundle served by `vite preview`, so tests exercise what players get.
  webServer: [
    {
      command: process.env.E2E_SERVER === 'preview' ? 'yarn preview:e2e' : 'yarn start',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: process.env.CI ? 120_000 : 10_000,
    },
    {
      // The API for sync tests: in-memory Postgres, dev sign-in tokens (never used in production).
      command: 'yarn start:server',
      url: 'http://localhost:8787/api/v1/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { PORT: '8787', PGLITE_DATA_DIR: 'memory://', DEV_AUTH_SECRET: 'e2e-dev-auth-secret-0123456789' },
    },
  ],
});
