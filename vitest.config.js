import { defineConfig } from 'vitest/config';

/**
 * Vite plugin to strip shebang lines from .mjs/.js files.
 * Many scripts in this repo have #!/usr/bin/env node shebangs,
 * which Node.js strips automatically but Vite's transform does not.
 */
function stripShebangPlugin() {
  return {
    name: 'strip-shebang',
    enforce: 'pre',
    transform(code, id) {
      if (code.startsWith('#!')) {
        return {
          code: code.replace(/^#![^\n]*\n/, '\n'),
          map: null,
        };
      }
    },
  };
}

export default defineConfig({
  plugins: [stripShebangPlugin()],
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
      '**/.worktrees/**',
      '**/.cursor/worktrees/**',
    ],
    server: {
      deps: {
        // Ensure scripts with shebangs are transformed
        inline: [/scripts\/eva\//],
      },
    },
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'json-summary', 'html'],
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
