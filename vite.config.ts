import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { LOCAL_HOST, PORTS } from './ports.config';

const api = `http://${LOCAL_HOST}:${PORTS.api}`;

export default defineConfig({
  plugins: [
    react({
      babel: {
        parserOpts: {
          plugins: ['decorators-legacy', 'classProperties'],
        },
      },
    }),
  ],
  optimizeDeps: {
    // Lazily imported dependencies, pre-bundled so the dev server doesn't reload the page the first time
    // one is needed (three.js on the first 3D toggle; zod/mini and Firebase on first sign-in/sync). Such a
    // reload mid-test made the sync e2e test slow and flaky.
    include: ['three', 'three/examples/jsm/controls/OrbitControls.js', 'zod/mini', 'firebase/app', 'firebase/auth'],
  },
  // Ports from the workspace block 41940–41959 (ports.config.ts); never fall back to another port, and
  // stay on loopback unless `--host 0.0.0.0` is passed for a phone play-test.
  server: {
    port: PORTS.dev,
    strictPort: true,
    host: LOCAL_HOST,
    open: true,
    // Same-origin API in dev, as in production (the Worker's /api/* route): run `yarn dev:server`.
    proxy: {
      '/api': api,
    },
  },
  preview: {
    port: PORTS.preview,
    strictPort: true,
    host: LOCAL_HOST,
    proxy: {
      '/api': api,
    },
  },
  test: {
    // Playwright specs (*.spec.ts) and the legacy CRA test are not Vitest tests. Kept here rather than as
    // CLI globs: an unquoted --exclude glob is expanded by sh on Linux CI (and a spec ran as a unit test).
    exclude: [...configDefaults.exclude, '**/*.spec.ts', 'src/App.test.tsx'],
  },
  resolve: {
    alias: {
      // If we decide to use absolute paths later, we can map them here
    },
  },
});
