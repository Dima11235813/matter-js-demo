import { defineConfig } from 'vitest/config';

/**
 * Research experiments: reproducible, but kept out of `yarn test:unit`.
 * Run with `yarn research:cross-dim`.
 */
export default defineConfig({
  test: {
    root: process.cwd(),
    include: ['docs/research/experiments/**/*.{check,experiment}.ts'],
    testTimeout: 600_000,
  },
});
