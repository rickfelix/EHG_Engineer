// Unit-project test setup — SD-LEO-INFRA-ENFORCE-UNIT-TIER-001 (FR-3).
//
// The no-DB `unit` vitest project must NOT see real database credentials, so
// unlike tests/setup.db.js this file does NOT load `.env`. Unit tests that
// touch a Supabase client hit the synthetic test.invalid.local sentinel and
// fail/skip loudly instead of silently mutating production data.
//
// Host-shell env vars still take precedence via ||= (CI workflows that
// deliberately pass secrets — e.g. protected-unit-suites.yml — keep working).
import { vi, beforeEach, afterEach } from 'vitest';

// Synthetic env defaults so module-load createSupabaseServiceClient() factories
// don't throw during vitest collection in environments without real credentials
// (e.g. CI test-coverage runs without secrets, fork PRs).
process.env.SUPABASE_URL ||= 'https://test.invalid.local';
process.env.NEXT_PUBLIC_SUPABASE_URL ||= process.env.SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key-not-real';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon-key-not-real';

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
