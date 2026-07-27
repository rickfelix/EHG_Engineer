import { defineConfig } from 'vitest/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
// QF-20260726-459 Part 1b. The predicate is imported, never re-derived — see db-target.js.
import { assessDbTarget } from './tests/helpers/db-target.js';

// The db gate is evaluated HERE, at config load, but `.env` is normally loaded by the db project's
// setupFiles INSIDE the worker — so without this, process.env has no SUPABASE_URL at gate time and
// the project would be disabled unconditionally. An always-off gate is safe but wrong: it is
// indistinguishable from a working one while silently deleting all DB coverage, and it would make
// a legitimate VITEST_DB_ALLOW_REF opt-in impossible. Mirror setup.db.js so the gate assesses the
// SAME environment the tests would actually run against. Shell env still wins (dotenv never
// overrides an existing value).
loadEnv({ path: '.env' });
loadEnv({ path: '.env.test' });

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
  '**/*.db.test.js',
];

/**
 * The pre-commit smoke gate, in its OWN project — deliberately NOT part of DB_INCLUDE.
 *
 * WHY IT IS SEPARATE: QF-20260726-459 Part 1b (d031c798f86) gated the whole db PROJECT behind
 * DB_TARGET.allowed, which was correct for the 225 DB suites. But tests/smoke.test.js was a member
 * of DB_INCLUDE, so gating the project made it a member of ZERO projects — and `.husky/pre-commit`
 * runs `vitest run tests/smoke.test.js` unconditionally. A filter that matches no file exits 1, so
 * EVERY commit in the repo failed from 2026-07-26 10:56 onward. The outage was invisible in CI
 * because it only manifests through the commit hook.
 *
 * This project is UNGATED on purpose: the gate belongs at runtime, inside the suite, not at file
 * discovery. The file must always be FOUND (so the hook can run it and exit 0); whether it executes
 * live queries is decided by the shared production-ref-aware predicate it imports.
 *
 * It stays out of the `unit` tier — see the unit project's exclude, which lists this constant. The
 * suite calls dotenv.config() at module top level regardless of setupFiles, so admitting it to
 * `unit` would leak real credentials into the unit tier.
 */
const SMOKE_INCLUDE = ['**/tests/smoke.test.js'];

// ─── QF-20260726-459 Part 1b: gate the PROJECT, not the individual files ────────────────────────
//
// Part 1 made tests/helpers/db-available.js fail closed. That was necessary and insufficient:
// measured statically, the db project resolves 225 files and only 100 reference the guard in any
// form. THE OTHER 125 NEVER IMPORT IT, so no change to that helper can gate them — and the db
// project's setupFiles load the REAL .env. The QF's own title claim stayed true for those files.
//
// A per-file fix does not scale to 125 files and, worse, silently un-fixes itself the moment
// someone adds file 226. The only place that covers every file regardless of what it imports is
// the project definition, so the gate goes here: when the configured target is not an explicitly
// designated non-production database, the db project resolves to ZERO test files.
//
// This is the same predicate the helper uses, imported — NOT re-derived. Re-implementing it here
// is precisely how the original defect survived its own test suite.
const DB_TARGET = assessDbTarget(process.env);

if (!DB_TARGET.allowed) {
  // Loud, because "there was no DB coverage" and "DB coverage silently vanished" look identical in
  // a green run. Anyone who expected these tests to execute must be told why they did not.
  console.warn(
    `[vitest] db project DISABLED — no designated non-production target (reason: ${DB_TARGET.reason}` +
      `${DB_TARGET.ref ? `, target ref: ${DB_TARGET.ref}` : ''}). 0 of ${''}db tests will run.\n` +
      '[vitest] These suites write to whatever they point at, and 125 of 225 do not self-guard.\n' +
      '[vitest] To run them, set VITEST_DB_ALLOW_REF=<project-ref> naming the ref your SUPABASE_URL\n' +
      '[vitest] actually points at — an authorisation, not a rubber stamp. Never name production.',
  );
}

// Empty include => vitest resolves no files for this project. Skipping is the intended end state
// (per the QF: "fail-closed-with-nothing-to-allow is a safe end state; every DB test skips, which
// is strictly better than running against production"), so this must not turn every run red.
const DB_INCLUDE_GATED = DB_TARGET.allowed ? DB_INCLUDE : [];

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
          //
          // SD-LEO-INFRA-THREE-REFUSAL-TESTS-001 FR-2 — same class, same remedy, three more
          // vars. The unit tier still inherits the operator's real .env DESPITE line 201's
          // intent: vitest.config.js:16-17 loads .env in the PARENT process (for DB-target
          // gating), and `pool: 'forks'` means every worker inherits that process.env before
          // setup.unit.js can do anything about it. Not loading .env in the project is not
          // the same as the project not HAVING it.
          //
          // What that cost: three REFUSAL tests in tests/unit/fleet/ took their verdict from
          // whether an operator happened to export a variable. They assert "no profiles dir
          // configured" / "spawn-control live flag off" by passing a nullish option, but
          // lib/fleet/spawn-control.js resolves `opts.X ?? process.env.Y` — and `??` treats an
          // explicit null as ABSENT, so the caller's "none" is discarded in favour of the env
          // var. Measured on one commit, unmodified tests and source: ambient env gave
          // 3 failed / 66 passed; `FLEET_SPAWN_CONTROL_LIVE= FLEET_ACCOUNT_PROFILES_DIR=` gave
          // 69 passed. The guards were never broken — they were never EXERCISED.
          //
          // Empty string, not delete: '' is falsy but NOT nullish, so it survives `??` and
          // still trips the `if (!baseDir)` / `=== 'true'` guards. Deleting the key would let
          // `??` fall through to the next candidate again, which is the whole defect.
          //
          // FLEET_CANARY_KILL_ENABLED is deliberately NOT listed: every call site passes it
          // explicitly via opts.env, so it has no ambient-fallback path to close.
          env: {
            FLEET_REPO_ROOT: './tests/fixtures/__no_such_tree__',
            FLEET_ACCOUNT_PROFILES_DIR: '',
            FLEET_SPAWN_CONTROL_LIVE: '',
            // Unset on this host today, so neutralising it is a no-op here — which is exactly
            // why it belongs: tests/unit/fleet/browser-control.test.js currently passes by
            // accident and would go red for any operator who exports it.
            FLEET_BROWSER_PROFILES_DIR: '',
          },
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
          // SMOKE_INCLUDE is listed explicitly: it used to be covered by DB_INCLUDE, and removing
          // it from there must not silently admit the smoke suite (and its real credentials) into
          // the unit tier.
          exclude: [...SHARED_EXCLUDE, ...DB_INCLUDE, ...SMOKE_INCLUDE, ...QUARANTINE_EXCLUDE],
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          // Loads .env + .env.test (real credentials) — opt-in DB tier only.
          setupFiles: ['./tests/setup.db.js'],
          // QF-20260726-459 Part 1b: gated — empty unless the target is an explicitly designated
          // non-production database. See DB_INCLUDE_GATED above.
          include: DB_INCLUDE_GATED,
          exclude: SHARED_EXCLUDE,
          // A gated-empty project must not fail the run: skipping IS the safe end state here.
          passWithNoTests: true,
        },
      },
      {
        extends: true,
        test: {
          name: 'smoke',
          // Same real-credential setup as the db tier — the suite is read-only and gates itself at
          // runtime on the shared designated-target predicate, so pointing at an undesignated
          // target makes it SKIP, not run.
          setupFiles: ['./tests/setup.db.js'],
          // UNGATED by design. See SMOKE_INCLUDE: the pre-commit hook filters to this exact file,
          // and a filter that resolves to zero files exits 1 and blocks every commit in the repo.
          include: SMOKE_INCLUDE,
          exclude: SHARED_EXCLUDE,
        },
      },
    ],
  },
});
