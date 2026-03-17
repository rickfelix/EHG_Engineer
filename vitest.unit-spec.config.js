/**
 * Vitest config override for running .spec.ts unit tests.
 *
 * Usage:
 *   npx vitest run --config vitest.unit-spec.config.js tests/unit/handoff-orchestrator.spec.ts
 *
 * The default vitest.config.js only includes *.test.js; this config adds *.spec.ts support.
 */
import { defineConfig } from 'vitest/config';

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
    include: [
      '**/*.spec.ts',
      '**/*.test.js',
    ],
    exclude: [
      '**/tests/e2e/**',
      '**/node_modules/**',
      '**/applications/**',
      '**/archive/**',
    ],
    server: {
      deps: {
        inline: [/scripts\/eva\//],
      },
    },
  },
});
