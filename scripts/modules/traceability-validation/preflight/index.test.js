/**
 * Preflight absent-vs-failed gate2 tests — SD-LEO-INFRA-ABSENT-GATE-SCORE-001.
 *
 * The module had ZERO coverage. These pin the fix two-sided: an ABSENT gate2_validation reads
 * INAPPLICABLE (positive control, does not cascade Gate-3 to FAILED); a PRESENT-and-failed score
 * — including the writer's {passed:false,score:0} placeholder and a malformed {} — still hard-blocks
 * (negative controls). Mutations are asserted, not just the return value (a return-only check would
 * stay green if the code forgot to record the warning / failed_gate).
 */
import { describe, it, expect } from 'vitest';
import { runPreflightChecks } from './index.js';

/** The one supabase chain runPreflightChecks calls: .from().select().eq().eq().order().limit()->{data}. */
function makeSupabaseStub(data) {
  const chain = {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({ data, error: null }),
  };
  return chain;
}

/** Fresh validation object, mirroring the production caller (traceability-validation/index.js:53-62). */
function freshValidation() {
  return { passed: true, score: 0, max_score: 100, issues: [], warnings: [], details: {}, failed_gates: [], gate_scores: {} };
}

const handoff = (gate2_validation) => [{ metadata: gate2_validation === undefined ? {} : { gate2_validation } }];

describe('runPreflightChecks — absent gate2 reads INAPPLICABLE, not FAILED', () => {
  it('TS-1a: ABSENT (key missing / undefined) → INAPPLICABLE, proceeds, no GATE2_FAILED', async () => {
    const v = freshValidation();
    const r = await runPreflightChecks('sd-uuid', v, makeSupabaseStub(handoff(undefined)));
    expect(r).toEqual({ passed: true, gate2Data: null });
    expect(v.warnings.some((w) => w.includes('INAPPLICABLE'))).toBe(true);
    expect(v.failed_gates).not.toContain('GATE2_FAILED');
    expect(v.passed).toBe(true);
  });

  it('TS-1b: ABSENT (explicit null) → INAPPLICABLE (== null makes it equivalent to undefined)', async () => {
    const v = freshValidation();
    const r = await runPreflightChecks('sd-uuid', v, makeSupabaseStub(handoff(null)));
    expect(r).toEqual({ passed: true, gate2Data: null });
    expect(v.failed_gates).not.toContain('GATE2_FAILED');
    expect(v.passed).toBe(true);
  });

  it('TS-2: PRESENT and failed {passed:false,score:60} → GATE2_FAILED hard block', async () => {
    const v = freshValidation();
    const gate2 = { passed: false, score: 60, max_score: 100 };
    const r = await runPreflightChecks('sd-uuid', v, makeSupabaseStub(handoff(gate2)));
    expect(r.passed).toBe(false);
    expect(r.gate2Data).toEqual(gate2);
    expect(v.failed_gates).toContain('GATE2_FAILED');
    expect(v.passed).toBe(false);
  });

  it('TS-3: the writer placeholder {passed:false,score:0} still hard-blocks (NOT soft-passed as absent)', async () => {
    const v = freshValidation();
    const r = await runPreflightChecks('sd-uuid', v, makeSupabaseStub(handoff({ passed: false, score: 0, warning: 'Fidelity data not populated' })));
    expect(r.passed).toBe(false);
    expect(v.failed_gates).toContain('GATE2_FAILED');
  });

  it('TS-4: PRESENT and passed {passed:true} → proceeds', async () => {
    const v = freshValidation();
    const gate2 = { passed: true, score: 85, max_score: 100 };
    const r = await runPreflightChecks('sd-uuid', v, makeSupabaseStub(handoff(gate2)));
    expect(r).toEqual({ passed: true, gate2Data: gate2 });
    expect(v.failed_gates).toHaveLength(0);
    expect(v.warnings.some((w) => w.includes('INAPPLICABLE'))).toBe(false);
  });

  it('TS-5: NO EXEC-TO-PLAN handoff → GATE2_HANDOFF (line-29 guard, unchanged)', async () => {
    const v = freshValidation();
    const r = await runPreflightChecks('sd-uuid', v, makeSupabaseStub([]));
    expect(r).toEqual({ passed: false, gate2Data: null });
    expect(v.failed_gates).toContain('GATE2_HANDOFF');
    expect(v.failed_gates).not.toContain('GATE2_INAPPLICABLE');
  });

  it('TS-6: PRESENT-but-empty {} (passed===undefined) still blocks — boundary is key-present, not passed-truthy', async () => {
    for (const malformed of [{}, { score: 50 }]) {
      const v = freshValidation();
      const r = await runPreflightChecks('sd-uuid', v, makeSupabaseStub(handoff(malformed)));
      expect(r.passed, `malformed ${JSON.stringify(malformed)} must block, not read INAPPLICABLE`).toBe(false);
      expect(v.failed_gates).toContain('GATE2_FAILED');
      expect(v.warnings.some((w) => w.includes('INAPPLICABLE'))).toBe(false);
    }
  });
});
