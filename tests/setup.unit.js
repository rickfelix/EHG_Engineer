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

// ─── Unit-tier network fence (SD-LEO-INFRA-CHECKER-READBACK-WRITE-001, RCA a726dd91) ───────────
//
// The credential sentinels above neutralise WHICH database a client points at, but do nothing to
// bound HOW LONG a request to that neutralised-but-still-resolvable host takes. Unit-tier code
// that constructs its own Supabase client (bypassing the per-file vi.mock convention other tests
// rely on) reaches the real network: @supabase/postgrest-js retries a failed GET 4x with
// exponential backoff (~7s floor), and the sentinel host is SLOW to fail DNS resolution on Windows
// (measured 1.8s-11s per attempt) — compounding into a 40s+ stall, well past this project's 60s
// default test timeout. This exact class was already on record as an avoided-not-fixed hazard
// (scripts/hooks/capture-baseline-test-state.cjs explicitly skips the full suite "which hung
// against the test.invalid.local sentinel").
//
// This guard makes "no live network" STRUCTURAL for the unit tier rather than assumed from
// credential sentinelling alone — inspired by, but deliberately NOT copying, the db tier's fetch
// guard (tests/helpers/db-tier-gate.js):
//   1. WRITABLE + CONFIGURABLE (not frozen): 24 unit-tier files vi.stubGlobal('fetch') or assign
//      globalThis.fetch directly; a non-reconfigurable descriptor (correct for the db tier's
//      stricter security posture) would break every one of them here. This is a latency/safety
//      control, not a security fence — the credential sentinels above remain the actual fence.
//   2. ABORT-SHAPED throw (name='AbortError'): postgrest-js's executeWithRetry has an explicit
//      escape hatch for abort-shaped errors that skips its retry loop entirely — a plain
//      TypeError/Error still costs the full 4-attempt/~7s-backoff sequence even though every
//      attempt fails instantly. Measured: abort-shaped throw = 1 attempt, ~0ms; plain throw =
//      4 attempts, ~7s.
// Loopback (127.0.0.1 / localhost / ::1) is allowed through, matching the db tier's loopback
// allowance, so a test that legitimately spins up a local server is not caught by this guard.
function isLoopbackFetchTarget(input) {
  try {
    const raw = typeof input === 'string' ? input : (input && input.url) || String(input);
    const { hostname } = new URL(raw, 'http://unit-tier-fence-base.invalid');
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1' || hostname === '[::1]';
  } catch {
    return false;
  }
}
const __unitTierRealFetch = globalThis.fetch;
function unitTierNetworkFence(input, init) {
  if (isLoopbackFetchTarget(input)) {
    return __unitTierRealFetch
      ? __unitTierRealFetch(input, init)
      : Promise.reject(new Error('unit tier network fence: no underlying fetch available for a loopback request'));
  }
  const url = typeof input === 'string' ? input : (input && input.url) || String(input);
  const err = new Error(
    `UNIT_TIER_NETWORK_REFUSED: refused fetch to ${url} — the unit vitest project must never reach a ` +
    'live network. If this is unexpected, the code under test likely needs its Supabase client ' +
    'factory mocked (vi.mock), the same convention this repo\'s other unit tests already follow.'
  );
  err.name = 'AbortError'; // abort-shaped on purpose — see the executeWithRetry note above
  err.code = 'ABORT_ERR';
  return Promise.reject(err);
}
Object.defineProperty(globalThis, 'fetch', { value: unitTierNetworkFence, writable: true, configurable: true });

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
