import { defineConfig } from 'vitest/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Quarantine manifest — SD-LEO-FIX-GREEN-MAIN-TRIAGE-001.
 * tests/quarantine-manifest.json tracks every red unit-tier file with a
 * reason_class + linked_ref (the debt register). Quarantined files are
 * excluded from the `unit` project here; un-quarantine = delete the entry.
 * Fail-soft: a missing/corrupt manifest quarantines nothing.
 */
function loadQuarantineExclude() {
  try {
    const manifestPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tests', 'quarantine-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return (manifest.quarantined || []).map(e => `**/${e.file}`);
  } catch {
    return [];
  }
}
const QUARANTINE_EXCLUDE = loadQuarantineExclude();

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
  // SD-LEO-INFRA-TEST-ESTATE-HYGIENE-001: the unanchored '**/*.test.js' include
  // swept the orphaned legacy test/ root (CI separately --excludes it, so local
  // npm test diverged from CI) and tests/archived/ ('archive' above does NOT
  // match 'archived'), whose .test.js files import @playwright/test and crash
  // the unit run with "Playwright Test did not expect test.describe()".
  '**/test/**',
  '**/tests/archived/**',
  '**/docs/archived/**',
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
    // setupFiles are strictly per-project (SD-LEO-INFRA-ENFORCE-UNIT-TIER-001
    // FR-3): the unit project must NOT load `.env` (no live DB creds in the
    // unit tier); the db project keeps the historical .env + sentinel behavior.
    // Do NOT add a root-level setupFiles here -- with `extends: true` vitest
    // MERGES root + project setupFiles (it does not override), so a root entry
    // would run in BOTH projects (verified live: a root setup.unit.js ran
    // before setup.db.js and its ||= sentinels blocked the .env load, because
    // dotenv never overrides existing process.env values).
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
          // NO dotenv .env load — unit tests must not reach the live DB.
          setupFiles: ['./tests/setup.unit.js'],
          // SD-LEO-INFRA-SPAWN-ROOT-CURRENCY-INVARIANT-001 (post-CI RCA).
          // Pin the fleet repo root to a path that does NOT exist, so the unit tier can
          // never shell out to real git against the developer's actual checkout.
          //
          // The bug this closes: lib/fleet/build-session-launch.cjs resolves the spawn cwd
          // from the MODULE's location, so the tier behaved differently depending on where
          // the checkout physically lived. Running from .worktrees/ took the tree-currency
          // guard's worktree exemption and skipped it entirely; running from a normal
          // checkout ran it for real. 21 tests were green locally and red in CI for that
          // reason alone, and nobody could have noticed locally.
          //
          // A nonexistent cwd makes execFileSync fail ENOENT immediately, with no network
          // and no dependence on branch/dirty state — so a live spawn that forgets to
          // inject opts.currencyRunner now fails FAST and IDENTICALLY on every machine.
          // This is deliberately not a bypass: it makes nothing pass that would otherwise
          // fail. It converts a hidden environmental accident into a loud, uniform one.
          env: { FLEET_REPO_ROOT: './tests/fixtures/__no_such_tree__' },
          include: [
            '**/__tests__/**/*.test.js',
            '**/*.test.js',
            // SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-B: the lib/org spine tests are
            // vitest-based but use the .test.mjs extension (matching the sibling org
            // suites), which the .test.js globs above miss — leaving them CI-unreachable
            // and only runnable via the dev-only vitest.worktree.config.mjs. Anchor a
            // narrow .mjs include to tests/unit/org so exactly those vitest suites run in
            // CI, without pulling the repo's many node:test-based .test.mjs files (which
            // are not vitest-compatible) into this project.
            '**/tests/unit/org/**/*.test.mjs',
            // SD-LEO-FEAT-PROVISION-VENTURE-EMAIL-001: same pattern as org above —
            // vitest-based .test.mjs suites, narrowly anchored so node:test .mjs
            // files stay out. Registered in tests/test-estate-mjs-allowlist.json.
            '**/tests/unit/venture-email/**/*.test.mjs',
          ],
          // QUARANTINE_EXCLUDE: tracked red files (tests/quarantine-manifest.json)
          // — SD-LEO-FIX-GREEN-MAIN-TRIAGE-001. The manifest is the debt register.
          exclude: [...SHARED_EXCLUDE, ...DB_INCLUDE, ...QUARANTINE_EXCLUDE],
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          // Loads .env + .env.test (real credentials) — opt-in DB tier only.
          setupFiles: ['./tests/setup.db.js'],
          include: DB_INCLUDE,
          exclude: SHARED_EXCLUDE,
        },
      },
    ],
  },
});
