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

/**
 * db/no-db project split — SD-FDBK-INFRA-VITEST-PROJECT-SPLIT-001 (FR-2).
 *
 * `npm test` / `npm run test:unit` target ONLY the no-DB `unit` project
 * (vitest run --project unit) so a run without database credentials is fast
 * and green: DB-dependent suites either live in the `db` project (excluded
 * here) or self-skip via tests/helpers/db-available.js (describeDb). The
 * opt-in `db` project (npm run test:db) runs the inherently-DB suites when
 * real credentials are present.
 *
 * Note: a bare `vitest run` (no --project) runs BOTH projects; the npm scripts
 * pin the default to the unit project on purpose.
 */
const SHARED_EXCLUDE = [
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
  '**/.claude/worktrees/**',
  '**/PATH/**',
];

// Inherently DB-dependent test locations — routed to the opt-in `db` project
// and excluded from the default `unit` project. Unit-directory tests that also
// touch a live DB self-skip via describeDb (tests/helpers/db-available.js).
const DB_INCLUDE = [
  '**/tests/integration/**/*.test.js',
  '**/tests/database/**/*.test.js',
  '**/tests/db-invariants/**/*.test.js',
  '**/tests/migration-readiness/**/*.test.js',
  '**/tests/smoke.test.js',
  '**/*.db.test.js',
];

export default defineConfig({
  plugins: [stripShebangPlugin()],
  test: {
    // Shared defaults inherited by each project via `extends: true`.
    globals: true,
    environment: 'node',
    testTimeout: 60000,
    teardownTimeout: 10000,
    pool: 'forks',
    setupFiles: ['./tests/setup.js'],
    server: {
      deps: {
        // Ensure scripts with shebangs are transformed
        inline: [/scripts\/eva\//],
      },
    },
    // Coverage is defined once at the root and applies to whichever project(s) run.
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
        '**/archive/**',
      ],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: [
            '**/__tests__/**/*.test.js',
            '**/*.test.js',
          ],
          exclude: [...SHARED_EXCLUDE, ...DB_INCLUDE],
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          include: DB_INCLUDE,
          exclude: SHARED_EXCLUDE,
        },
      },
    ],
  },
});
