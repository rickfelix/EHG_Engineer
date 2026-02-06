import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 60000,
    setupFiles: ['./tests/setup.js'],
    include: [
      '**/__tests__/**/*.test.js',
      '**/*.test.js',
    ],
    exclude: [
      '**/tests/e2e/**',
      '**/tests/a11y.spec.js',
      '**/tests/**/*.spec.js',
      '**/tests/integration.test.js',
      '**/node_modules/**',
      '**/applications/**',
      '**/press-kit/**',
      '**/agents/**',
      '**/archive/**',
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      include: [
        'lib/**/*.js',
        'scripts/**/*.js',
      ],
      exclude: [
        '**/node_modules/**',
        '**/client/**',
      ],
    },
  },
});
