/**
 * SD-LEO-INFRA-REVOKE-DEFAULT-PUBLIC-001 — sentinel wiring for the pg_net exposure check.
 *
 * Two concerns, both from the TESTING sub-agent's prospective PLAN-phase review (findings
 * G3/G9, folded into PRD TR-4/TS-9/TS-10):
 *
 * 1. FR-4/TS-10 — the `findings` sum in audit-security-linter.mjs must retain EXACTLY its
 *    pre-existing 4 terms after the pg_net check is wired in, as a structural guard (not a
 *    today's-coincidentally-clean-output fact-pin, per PAT-TEST-PINS-FACT-NOT-BEHAVIOUR-001).
 *    Anchored on the `const findings =` text, never a line-number slice (line numbers drift).
 *
 * 2. FR-2/TS-9 — a forced pg_net probe failure, reaching the SENTINEL (not just the probe
 *    module in isolation), must render as a distinguishable failure state — never a silent
 *    0/clean collapse. This is the integration-layer half of the 3-outcome contract; the
 *    unit-layer half lives in tests/unit/security/pg-net-exposure.test.js.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runSentinel } from '../../scripts/sentinels/audit-security-linter.mjs';

const SENTINEL_SOURCE = readFileSync(
  fileURLToPath(new URL('../../scripts/sentinels/audit-security-linter.mjs', import.meta.url)),
  'utf8',
);

describe('TS-10: findings-sum structural guard (US-004)', () => {
  it('the findings assignment retains exactly its pre-existing 4 terms', () => {
    const match = SENTINEL_SOURCE.match(/const findings = ([\s\S]*?);/);
    expect(match, 'could not locate `const findings = ...;` in the sentinel source').not.toBeNull();
    const expr = match[1];
    expect(expr).toMatch(/securityDefinerViews\.length/);
    expect(expr).toMatch(/rlsDisabled\.length/);
    expect(expr).toMatch(/sensitiveExposed\.length/);
    expect(expr).toMatch(/securityDefinerMutableFns\.length/);
    // The load-bearing negative: neither report-only key is ever summed in.
    expect(expr).not.toMatch(/definerRlsBypassExposed/);
    expect(expr).not.toMatch(/pgNetExposure/);
    // Exactly 4 `.length` references — a 5th term (accidental or otherwise) fails this.
    expect((expr.match(/\.length/g) || []).length).toBe(4);
  });
});

// Every non-pg_net query returns an empty, well-formed result — isolates the forced
// failure to exactly the two `nspname = 'net'` queries pg_net-exposure.js issues.
//
// end() MUST actually invalidate query(). An inert `end: async () => {}` would make this
// fixture blind to the very hazard TR-6/TS-7 exists to catch: with a no-op teardown, a
// wrongly-OWNING wrapper (one that forwards end() to the shared client) closes nothing
// observable, the later trigger-liveness query still answers, and the contract test passes
// against a broken implementation. Verified by mutation: adding `end: () => client.end()`
// to the sentinel's injected wrapper is caught here only because closing is observable.
function benignExceptPgNet({ pgNetError } = {}) {
  let closed = false;
  return {
    query: async (sql) => {
      if (closed) throw new Error('query() after end(): the shared client was already closed');
      if (String(sql).includes("nspname = 'net'")) {
        if (pgNetError) throw pgNetError;
      }
      if (String(sql).includes('pg_event_trigger')) return { rows: [{ evtenabled: 'O' }] };
      return { rows: [] };
    },
    end: async () => { closed = true; },
    isClosed: () => closed,
  };
}

describe('TS-9: a forced pg_net probe failure renders distinguishably at the sentinel level', () => {
  it('result.pgNetExposure reports probeRan:false with a reason, never a silent 0/clean', async () => {
    const result = await runSentinel({
      connect: async () => benignExceptPgNet({ pgNetError: new Error('permission denied for schema net') }),
    });
    expect(result.pgNetExposure.probeRan).toBe(false);
    expect(result.pgNetExposure.reason).toMatch(/permission denied for schema net/);
    // The failed report-only check must not leak into or corrupt the other 4 gating fields.
    expect(result.securityDefinerViews).toEqual([]);
    expect(result.rlsDisabled).toEqual([]);
    expect(result.sensitiveExposed).toEqual([]);
    expect(result.securityDefinerMutableFns).toEqual([]);
    expect(result.triggerEnabled).toBe(true);
  });

  it('a genuinely clean pg_net catalog (probe ran, zero exposure) is distinguishable from the failure case', async () => {
    const result = await runSentinel({ connect: async () => benignExceptPgNet() });
    expect(result.pgNetExposure.probeRan).toBe(true);
    expect(result.pgNetExposure.functions).toEqual([]);
    expect(result.pgNetExposure.relations).toEqual([]);
  });

  it('TR-6: the sentinel-owned client is not ended by the pg_net probe — the trigger-liveness query after it still succeeds', async () => {
    let ended = false;
    const client = benignExceptPgNet();
    // Preserve the fixture's real closure semantics (spreading would drop the closure's
    // binding if end() were replaced outright) — record the call AND close for real, so a
    // probe that wrongly ends this client makes the trigger-liveness query below throw.
    const wrapped = { ...client, end: async () => { ended = true; await client.end(); } };
    const result = await runSentinel({ connect: async () => wrapped });
    // The trigger-liveness query (after the pg_net check in source order) resolved --
    // if the probe had wrongly closed the shared client, this call would have thrown
    // and runSentinel() would never have reached `return result`.
    expect(result.triggerEnabled).toBe(true);
    // The SENTINEL itself (not the probe) owns teardown, and does so exactly once, after
    // every query -- including the trigger-liveness query -- has completed.
    expect(ended).toBe(true);
  });
});
