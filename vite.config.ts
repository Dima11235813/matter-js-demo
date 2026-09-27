import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

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
  server: {
    port: 3000,
    open: true,
    // Same-origin API in dev, as in production (the Worker's /api/* route): run `yarn dev:server`.
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
  preview: {
    proxy: {
      '/api': 'http://localhost:8787',
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
