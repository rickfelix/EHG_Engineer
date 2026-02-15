import { defineConfig } from 'vitest/config';

/**
 * Vitest config for regression tests (tests/e2e/*.test.js)
 * The main vitest.config.ts excludes tests/e2e/**, so this config
 * is used specifically for backend regression tests that live in tests/e2e/.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 60000,
    include: [
      'tests/e2e/**/*.test.js',
    ],
    exclude: [
      '**/node_modules/**',
    ],
  },
});
