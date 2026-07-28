/**
 * SD-LEO-INFRA-SWALLOWED-POSTGREST-ERROR-001 FR-3 / TS-A1 — the headline scenario.
 *
 * BEFORE: the PRD lookup bound only `data`, so a rejected query (bad column, missing relation)
 * yielded null, `prd` stayed null, `smokeTestCmd` stayed null, and control reached the
 * "No smoke_test_cmd configured — advisory pass" branch. A BROKEN QUERY MADE THE GATE PASS,
 * reporting a reason that sounds like normal operation.
 *
 * WHY THE OBVIOUS FIX WOULD NOT HAVE WORKED, and why this suite exists in this shape:
 * routing the query through a throwing wrapper alone changes NOTHING OBSERVABLE here, because
 * the surrounding try/catch swallowed any throw and fell through to the same advisory pass.
 * The load-bearing change is the CATCH BLOCK recording the fault so the advisory-pass branch
 * becomes unreachable after one. `advisory-passes on a GENUINE absence` below is the control
 * that proves this discriminates rather than simply failing more often.
 */
import { describe, it, expect } from 'vitest';
import { createSmokeTestGate } from '../../../scripts/modules/handoff/executors/lead-final-approval/gates/smoke-test-gate.js';

const SD_ID = '11111111-2222-3333-4444-555555555555';

/** Minimal supabase double whose terminal .single() resolves to whatever shape we hand it. */
function fakeSupabase(result) {
  const chain = {
    from() { return chain; },
    select() { return chain; },
    eq() { return chain; },
    limit() { return chain; },
    single() { return Promise.resolve(result); },
  };
  return chain;
}

const run = supabase => createSmokeTestGate(supabase, null).validator({ sd: { id: SD_ID } });

describe('TS-A1: smoke-test-gate cannot advisory-pass on an unanswerable PRD lookup', () => {
  it('FAILS when the PRD query is rejected (bad column)', async () => {
    const res = await run(fakeSupabase({
      data: null,
      error: { code: '42703', message: 'column product_requirements_v2.smoke_test_cmd does not exist' },
    }));
    // The whole defect in one assertion: pre-fix this returned passed:true.
    expect(res.passed).toBe(false);
    expect(res.issues.join(' ')).toMatch(/could not read the PRD/i);
    expect(res.issues.join(' ')).toMatch(/query fault, not an absent smoke test/i);
  });

  it('does NOT report the benign "no smoke test configured" warning on a query fault', async () => {
    const res = await run(fakeSupabase({ data: null, error: { code: '42P01', message: 'relation does not exist' } }));
    // The specific misreport this SD is about — a plausible reason for having done nothing.
    expect(res.warnings.join(' ')).not.toMatch(/No smoke test configured/i);
  });

  // THE CONTROL. Without it, the assertions above are satisfied by failing on everything.
  it('still advisory-passes on a GENUINE absence (PGRST116 — .single() matched no rows)', async () => {
    const res = await run(fakeSupabase({ data: null, error: { code: 'PGRST116', message: 'No rows found' } }));
    expect(res.passed).toBe(true);
    expect(res.warnings.join(' ')).toMatch(/No smoke test configured/i);
  });

  it('still advisory-passes when the PRD exists but configures no command', async () => {
    const res = await run(fakeSupabase({ data: { smoke_test_cmd: null }, error: null }));
    expect(res.passed).toBe(true);
  });
});

describe('TS-A4: the gate ADOPTS the FR-1 wrapper rather than re-implementing it', () => {
  it('propagates a wrapper-raised fault into a gate failure', async () => {
    // Behavioural adoption proof: the QUERY_FAILED shape safeQuery raises is what reaches the
    // gate's issues. A hand-rolled inline check would not carry this signature. Guards the
    // failure mode where tests exercise a copy of the logic while the shipped path is untouched.
    const res = await run(fakeSupabase({ data: null, error: { code: '42703', message: 'boom-sentinel' } }));
    expect(res.passed).toBe(false);
    expect(res.issues.join(' ')).toMatch(/QUERY_FAILED at smoke-test-gate:prd-lookup/);
    expect(res.issues.join(' ')).toMatch(/boom-sentinel/);
  });
});
