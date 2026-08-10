// DB-project test setup (ES module compatible) — formerly tests/setup.js.
// SD-LEO-INFRA-ENFORCE-UNIT-TIER-001 (FR-3): only the opt-in `db` vitest
// project loads real credentials; the `unit` project uses tests/setup.unit.js.
//
// SD-LEO-INFRA-VITEST-TIER-REAL-001: this file is now the db tier's RUNTIME
// skip-when-undesignated gate — the runtime-inside-the-suite doctrine the
// smoke project documents (vitest.config.js), applied to the tier that
// previously gated at file discovery. The gate itself lives in
// tests/helpers/db-tier-gate.js so it has an in-process test seam (nested
// vitest does not run under CI); this file only wires the real dependencies.
//
// SHARED WITH THE SMOKE PROJECT (vitest.config.js smoke setupFiles): smoke
// already self-gates on the same predicate, so under an undesignated target it
// was skipping before this gate existed and still does — now via ctx.skip()
// with the fetch guard behind it. Designated targets see no change at all.
// The pre-commit invariant (the smoke file always RESOLVES and exits 0) is
// regression-asserted in tests/unit/testing/db-tier-gate.test.js.
import { config } from 'dotenv';
import { vi, beforeEach } from 'vitest';
import { installDbTierGate } from './helpers/db-tier-gate.js';

// Load real local credentials first (`.env`) so designated local runs hit the
// actual database. CI without secrets has no `.env`, so this is a no-op there.
// `.env.test` adds test-only fixtures (TEST_USER_EMAIL/PASSWORD) on top.
config({ path: '.env' });
config({ path: '.env.test' });

const gate = installDbTierGate({
  registerSkip: () => beforeEach((ctx) => ctx.skip()),
});

/** The fetch-guard refusal log — the hook-level canary's evidence channel.
 *  Empty on a designated run; every entry names a URL a suite attempted while
 *  the tier was undesignated. */
export const refusedRequests = gate.refusedRequests;

// Mock console methods to reduce noise during tests
global.console = {
  ...console,
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
};
