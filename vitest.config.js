import { defineConfig } from 'vitest/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// SD-LEO-INFRA-VITEST-TIER-REAL-001: the designation predicate no longer gates discovery here —
// it gates at RUNTIME in tests/setup.db.js (imported there, never re-derived; see db-target.js).
// The config-level dotenv load that fed the old discovery gate is gone WITH the gate: it put real
// credentials into the config process env, which `pool: 'forks'` workers inherit — including unit
// workers whose whole tier contract is never seeing them. Each project's setupFiles load exactly
// the env that project is entitled to.

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
  // SD-LEO-INFRA-FLEET-WIDE-VITEST-001 FR-3. This was '**/agents/**', aimed at the product
  // source tree — but that glob also matched tests/unit/agents/**, so 12 ordinary unit tests
  // were members of ZERO collected projects and never ran while the suite reported green.
  // MEASURED: 12 tracked files under tests/unit/agents/, 0 collected.
  //
  // Anchored to the source trees it was actually for. NOT written as an exception list
  // ("exclude agents EXCEPT tests/unit/agents") — an exception list would grow one entry per
  // discovery and quietly become the catch-all the membership guard exists to prevent.
  'lib/agents/**',
  'scripts/agents/**',
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
  // QF-20260727-884: scratch/ holds PRESERVED WORKTREE COPIES and is gitignored
  // (.gitignore '/scratch/'), so `git ls-files scratch` returns ZERO test files and CI never sees
  // them — while a local run collected them as live tests. MEASURED in the shared root at
  // origin/main: 887 scratch/preserved-* directories holding exactly 14 test files, and a local
  // unit run reporting exactly 14 failures. A 14-for-14 match.
  //
  // WHY THIS ONE MATTERED MORE THAN ITS SIZE: CI stayed green and local read red, both correctly,
  // and the contradiction was unresolvable without reading the failing file paths. At least one
  // worker read it as "main is broken" and it cost coordinator time to reconcile. A signal that
  // means different things on two surfaces is worse than a signal that is simply wrong on both.
  // It also blocked ship-preflight, which runs the local suite.
  //
  // Both forms are listed deliberately: the anchored one is the real rule, and the unanchored one
  // also covers a preserved copy that lands outside the top-level scratch/ root.
  'scratch/**',
  '**/scratch/**',
  // SD-LEO-INFRA-VITEST-TIER-REAL-001: .reaper-source/ is a gitignored FULL REPO COPY
  // (.gitignore '.reaper-source'), the same two-surface divergence class as scratch/ above —
  // measured at 3117 phantom collection entries locally (3116 in the unit project) that CI never
  // sees. Excluding it is a hard prerequisite for any local==CI collection assertion.
  '.reaper-source/**',
  '**/.reaper-source/**',
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

// ─── SD-LEO-INFRA-MIGRATION-APPLY-STATE-002 (FR-C): the drift-guard wiring proof ────────────────
//
// tests/integration/migration-apply-state-ledger-wiring.test.js was routed to the gated `db`
// project purely BY DIRECTORY. It imports no db setup and touches no client — its only credential
// consumer is the verifier SUBPROCESS it spawns, which inherits the invoking step's env. Before
// this SD, the CI-disabled db project collected zero files, vitest exited 1 ("No test files
// found"), and the drift gate's proof step was red on every run regardless of the drift verdict
// (measured: 6/6 recent runs). This dedicated project — the SMOKE_INCLUDE precedent — lets the
// proof actually execute in CI. Deliberately NOT gated on VITEST_DB_ALLOW_REF: that flag
// authorizes all db suites against the configured target; this project resolves exactly one
// self-contained file. MERGE NOTE (VITEST-TIER-REAL-001): the db gate now lives at RUNTIME in
// tests/setup.db.js and SKIPS every test on an undesignated target — which is why this project
// carries NO setupFiles (see the project block): loading that setup would silently skip the
// proof and the workflow's exit-0 arm would read green-while-unproven, the exact masking FR-C
// abolishes. The suite needs no setup — it opens no client.
const MIGRATION_GATE_INCLUDE = ['**/tests/integration/migration-apply-state-ledger-wiring.test.js'];

// ─── SD-LEO-INFRA-VITEST-TIER-REAL-001: the db gate moved from DISCOVERY to RUNTIME ─────────────
//
// QF-20260726-459 Part 1b gated the PROJECT here (include: [] when undesignated), which closed
// the live-DB hole but made every db_include member a member of ZERO projects — silent-vanish and
// zero-member states became indistinguishable, and the membership guard could only warn about it.
//
// The gate now lives at runtime in tests/setup.db.js (the doctrine the smoke project above has
// always stated: the gate belongs at runtime, inside the suite, not at file discovery). When the
// target is undesignated, that setup file forces sentinels, refuses ALL network via a
// globalThis.fetch guard (suite hooks execute under every viable skip mechanism, and env-forcing
// alone has a measured dotenv-override bypass), skips every test, and writes one stderr line per
// process. Discovery is therefore UNGATED: every db_include member always resolves, and the
// designation predicate stays where it always was — imported from tests/helpers/db-target.js,
// never re-derived.

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

            // SD-ALTIFYAI-FDBK-FIX-GENERIC-SECURITY-SUB-001 — DIRECT-POSTGRES CREDENTIAL FENCE.
            //
            // tests/setup.unit.js neutralises the four PostgREST vars (SUPABASE_URL,
            // NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY)
            // and the db tier's guard is a globalThis.fetch guard — NEITHER can observe a pg
            // net.Socket connection. Meanwhile lib/sub-agents/security.js calls dotenv.config()
            // at module scope, so importing the module under test repopulates process.env from
            // .env, and scripts/lib/supabase-connection.js falls back through
            // DATABASE_URL → SUPABASE_DB_PASSWORD → EHG_DB_PASSWORD to build a PRODUCTION
            // connection string. A unit test of the new catalog probe would therefore have
            // reached the live catalog. Fencing only SUPABASE_POOLER_URL would close one of
            // four doors.
            //
            // With all four empty, createDatabaseClient throws "Database password not found"
            // and the probe reports probe_ran:false — an observable, asserted outcome
            // (tests/unit/sub-agents/security-definer-posture.test.js, TS-10) rather than a
            // silent success against production.
            SUPABASE_POOLER_URL: '',
            DATABASE_URL: '',
            SUPABASE_DB_PASSWORD: '',
            EHG_DB_PASSWORD: '',
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
          // Loads .env + .env.test (real credentials) — opt-in DB tier only. The setup file IS
          // the runtime gate (SD-LEO-INFRA-VITEST-TIER-REAL-001): undesignated targets skip
          // every test and refuse all network; see tests/setup.db.js.
          setupFiles: ['./tests/setup.db.js'],
          include: DB_INCLUDE,
          // tests/ddl/**/*.db.test.js also matches DB_INCLUDE's '**/*.db.test.js' but is owned
          // by vitest.ddl.config.mjs — excluded here so the same file is never double-collected.
          exclude: [...SHARED_EXCLUDE, 'tests/ddl/**'],
          // A filtered run that matches no files must not fail the run: skipping IS the safe
          // end state for this tier.
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
      {
        extends: true,
        test: {
          name: 'migration-gate',
          // NO setupFiles, deliberately (post-merge with VITEST-TIER-REAL-001): setup.db.js now
          // enforces the runtime db gate and SKIPS every test on an undesignated target — loading
          // it here would silently skip the proof while the workflow's exit-0 arm read green.
          // The suite needs no setup: it opens no client; only its verifier SUBPROCESS uses
          // credentials, inherited from this process env (the workflow step supplies them in CI;
          // the subprocess's own dotenv load never overrides inherited vars).
          //
          // SECURITY SEC-2: the verifier subprocess CAN write (emitBreakageAlert inserts into
          // system_alerts under --strict with gaps) — in CI that write died only because the
          // step omits the URL/service-role vars, an accident of env. These stubs make the
          // accident structural: test.env lands in this process env, the child inherits it, and
          // dotenv-in-the-child never overrides set vars — the alert INSERT is impossible
          // everywhere while the POOLER/DATABASE_URL read path keeps working. Both URL legs
          // stubbed (the service-client factory PREFERS the NEXT_PUBLIC_ sibling).
          env: {
            SUPABASE_URL: 'https://test.invalid.local',
            NEXT_PUBLIC_SUPABASE_URL: 'https://test.invalid.local',
            SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-not-real',
          },
          include: MIGRATION_GATE_INCLUDE,
          exclude: SHARED_EXCLUDE,
        },
      },
    ],
  },
});
