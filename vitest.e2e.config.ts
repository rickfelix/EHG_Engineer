import { defineConfig } from 'vitest/config';

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
