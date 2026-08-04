// Unit-project test setup — SD-LEO-INFRA-ENFORCE-UNIT-TIER-001 (FR-3).
//
// The no-DB `unit` vitest project must NOT see real database credentials, so
// unlike tests/setup.db.js this file does NOT load `.env`. Unit tests that
// touch a Supabase client hit the synthetic test.invalid.local sentinel and
// fail/skip loudly instead of silently mutating production data.
//
// Host-shell env vars USED TO take precedence via ||=. They no longer do — see below.
import { vi, beforeEach, afterEach } from 'vitest';
import {
  SENTINEL_URL,
  SENTINEL_SERVICE_ROLE_KEY,
  SENTINEL_ANON_KEY,
  evaluateSentinelPostCondition,
  formatCredentialFenceError,
} from './helpers/credential-fence.js';

// ─── SD-LEO-FIX-CREDENTIAL-GUARD-INVERSION-001 ────────────────────────────────────────────────
//
// THE INVERSION THIS REPLACES. These four lines used `||=`, so the synthetic sentinel applied
// EXACTLY when nothing was set and was skipped EXACTLY when a real URL was exported. The comment
// above justified that as letting protected-unit-suites.yml keep working. Measured: with the
// sentinel forced and no real credentials, that workflow's suite runs 1736 tests green in 13.01s
// with zero hangs. The `||=` protected a workflow that did not need protecting — while
// fr-c-generator.test.js gated INSERT/UPDATE/DELETE against four production tables on
// `skipIf(!HAS_REAL_DB)`, i.e. on this guard having FAILED. 11 production rows were written that
// way between 2026-05-04 and 2026-07-07.
//
// It was never only an exported-vars problem: vitest.config.js loads `.env` in the PARENT process
// for DB-target gating and `pool:'forks'` means every worker inherits that process.env before this
// file runs. So on ANY machine with a .env the sentinel silently did not apply.
//
// FR-1: unconditional. A unit tier must never inherit ambient credentials, full stop.
process.env.SUPABASE_URL = SENTINEL_URL;
process.env.NEXT_PUBLIC_SUPABASE_URL = SENTINEL_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = SENTINEL_SERVICE_ROLE_KEY;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = SENTINEL_ANON_KEY;

// FR-2: the second fence, and it is a POST-CONDITION on the four lines above — not a check on
// whether ambient credentials were present.
//
// That distinction was measured, not reasoned. The first implementation followed the SD literally
// and aborted when it found a real SUPABASE_URL in the ambient environment; it failed an ordinary
// local run immediately, because vitest.config.js loads `.env` in the PARENT process and every
// fork inherits it. Ambient credentials are the NORMAL state here, so that fence would have fired
// on every developer machine and every fleet seat, and would have been deleted by the first person
// it stopped — leaving no fence at all.
//
// FR-1 already neutralises ambient credentials. What can still go wrong is FR-1 SILENTLY CEASING
// TO WORK: a reintroduced `||=`, a reordering, a fifth credential variable added above and not
// sentinelled. Asserting the post-condition catches exactly that, and is silent the rest of the
// time — which is what makes it survivable, and therefore what makes it a fence.
//
// ORDER IS LOAD-BEARING: this must run AFTER the assignment. Moved above it, the check reads the
// ambient environment, reports a breach on every machine with a `.env`, and reproduces the
// always-firing alarm described above. tests/unit/setup/credential-fence-ordering.spawn.test.js
// makes that regression go red from outside the process.
//
// Written to process.stderr rather than console.error because `console` is replaced with vi.fn()
// further down this file — a guard that reports through a mock is a guard that can be silenced.
const __fence = evaluateSentinelPostCondition(process.env);
if (__fence.abort) {
  process.stderr.write(`\n${formatCredentialFenceError(__fence)}\n\n`);
  process.exit(1);
}

// Mock console methods to reduce noise during tests
global.console = {
  ...console,
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
};

// SD-LEO-INFRA-UNIT-TEST-ISOLATION-POLLUTION-001 FR-1: per-test process.env snapshot/restore.
// pool:'forks' runs MULTIPLE test files in one process; vitest's module isolation gives each file a
// fresh module registry but does NOT reset process.env (process-global). So a test that mutates
// process.env (directly or via vi.stubEnv) bleeds into sibling files sharing the fork, and the
// non-deterministic fork DISTRIBUTION (worker-count-dependent: CI vs local) makes the unit-tier
// failing SET vary run-to-run. Snapshotting + restoring process.env per test is a non-aggressive,
// catch-all fix for env leakage regardless of HOW the test mutated it. The synthetic test.invalid
// defaults set above (module load) are captured in the first snapshot and therefore preserved.
let __envSnapshot;
beforeEach(() => { __envSnapshot = { ...process.env }; });
afterEach(() => {
  vi.unstubAllEnvs();
  for (const k of Object.keys(process.env)) {
    if (!(k in __envSnapshot)) delete process.env[k];          // drop keys the test ADDED
  }
  for (const k of Object.keys(__envSnapshot)) {
    if (process.env[k] !== __envSnapshot[k]) process.env[k] = __envSnapshot[k]; // restore CHANGED/DELETED
  }
});
