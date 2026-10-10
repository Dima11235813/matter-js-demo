import { defineConfig, devices } from '@playwright/test';
import { LOCAL_HOST, PORTS } from './ports.config';

// Locally the dev server (reused if running); CI (E2E_SERVER=preview) the e2e bundle on the preview port.
const preview = process.env.E2E_SERVER === 'preview';
const webUrl = `http://${LOCAL_HOST}:${preview ? PORTS.preview : PORTS.dev}`;

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
    baseURL: webUrl,
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
      command: preview ? 'yarn preview:e2e' : 'yarn dev --open false',
      url: webUrl,
      reuseExistingServer: !process.env.CI,
      timeout: process.env.CI ? 120_000 : 10_000,
    },
    {
      // The API for sync tests: in-memory Postgres, dev sign-in tokens (never used in production).
      command: 'yarn start:server',
      url: `http://${LOCAL_HOST}:${PORTS.api}/api/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { PORT: String(PORTS.api), PGLITE_DATA_DIR: 'memory://', DEV_AUTH_SECRET: 'e2e-dev-auth-secret-0123456789' },
    },
  ],
});
