/**
 * SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-D FR-D1.
 *
 * Measured live before this fix: 500/500 sampled production LEAD-FINAL-APPROVAL accepted rows
 * (15,476/15,476 gate_results entries) persisted `required: false` for EVERY gate, including
 * ones declaring `required: true` in source (e.g. WIRE_CHECK_GATE) -- because
 * `results.gateResults[gate.name]` was the raw validator RETURN VALUE, and no validator (except
 * FR_DELIVERY_VERIFICATION, which does so deliberately) ever puts a `required` key on its own
 * result. The correct static value lived only on the orphaned `results.gateStatuses` map, which
 * nothing downstream ever read.
 *
 * This test exercises the REAL `validateGates` pipeline (not a synthetic result shape that
 * already carries `required`, which is what the pre-existing
 * lead-final-gate-results-persistence.test.js fixtures do and is exactly the blind spot that let
 * this bug ship unnoticed for over a month) -- a validator that returns NO `required` key at all,
 * matching every real gate but one.
 */
import { describe, it, expect, vi } from 'vitest';
import { ValidationOrchestrator } from './ValidationOrchestrator.js';
import { getRequiredGates } from '../executors/lead-final-approval/gates.js';
import * as gateVerdictCache from '../gate-verdict-cache.js';

function makeOrchestrator() {
  return new ValidationOrchestrator({});
}

describe('ValidationOrchestrator.validateGates — FR-D1 required-flag persistence', () => {
  it('merges the gate\'s static required:true onto a validator result that never sets it (the real-world shape)', async () => {
    const orchestrator = makeOrchestrator();
    const gates = [
      {
        name: 'WIRE_CHECK_GATE',
        required: true,
        validator: async () => ({ passed: false, score: 0, maxScore: 100, issues: ['wiring broken'] }),
      },
    ];
    const results = await orchestrator.validateGates(gates, {});
    expect(results.gateResults.WIRE_CHECK_GATE.required).toBe(true);
    // required_effective must NOT be fabricated when the validator never set one
    expect(results.gateResults.WIRE_CHECK_GATE.required_effective).toBeUndefined();
  });

  it('merges required:false for a gate declared required:false in source', async () => {
    const orchestrator = makeOrchestrator();
    const gates = [
      {
        name: 'SMOKE_TEST_GATE',
        required: false,
        validator: async () => ({ passed: true, score: 100, maxScore: 100 }),
      },
    ];
    const results = await orchestrator.validateGates(gates, {});
    expect(results.gateResults.SMOKE_TEST_GATE.required).toBe(false);
  });

  it('a gate with no `required` key on its definition defaults to required:true (matches the live blocking predicate, gate.required !== false)', async () => {
    const orchestrator = makeOrchestrator();
    const gates = [
      { name: 'PR_PRECHECK', validator: async () => ({ passed: true, score: 100, maxScore: 100 }) },
    ];
    const results = await orchestrator.validateGates(gates, {});
    expect(results.gateResults.PR_PRECHECK.required).toBe(true);
  });

  it('preserves a validator-set dynamic required as required_effective without overwriting the static required:true (FR_DELIVERY_VERIFICATION shape)', async () => {
    const orchestrator = makeOrchestrator();
    const gates = [
      {
        name: 'FR_DELIVERY_VERIFICATION',
        required: true, // static declaration, per gates.js:1513-1516's documented "keep the static flag true" comment
        validator: async () => ({ passed: true, score: 0, maxScore: 100, required: false }), // deliberate warn-only override
      },
    ];
    const results = await orchestrator.validateGates(gates, {});
    expect(results.gateResults.FR_DELIVERY_VERIFICATION.required).toBe(true);
    expect(results.gateResults.FR_DELIVERY_VERIFICATION.required_effective).toBe(false);
  });

  it('threads status (PASS/FAIL) and does not fabricate skip_reason for a normal (non-skipped) result', async () => {
    const orchestrator = makeOrchestrator();
    const gates = [
      { name: 'A', required: true, validator: async () => ({ passed: true, score: 100, maxScore: 100 }) },
      { name: 'B', required: true, validator: async () => ({ passed: false, score: 0, maxScore: 100 }) },
    ];
    const results = await orchestrator.validateGates(gates, {});
    expect(results.gateResults.A.status).toBe('PASS');
    expect(results.gateResults.A.skip_reason).toBeUndefined();
    expect(results.gateResults.B.status).toBe('FAIL');
  });

  it('threads status:SKIPPED and skip_reason for a type-skipped gate, distinguishing it from a real pass', async () => {
    const orchestrator = makeOrchestrator();
    const gates = [
      {
        name: 'ARCHITECTURE_PHASE_COVERAGE',
        required: true,
        validator: async () => ({ passed: true, score: 0, maxScore: 0, skipped: true, skipReason: 'NON_APPLICABLE_SD_TYPE' }),
      },
    ];
    const results = await orchestrator.validateGates(gates, {});
    expect(results.gateResults.ARCHITECTURE_PHASE_COVERAGE.status).toBe('SKIPPED');
    expect(results.gateResults.ARCHITECTURE_PHASE_COVERAGE.skip_reason).toBe('NON_APPLICABLE_SD_TYPE');
  });

  it('does not change the live blocking verdict for a failing required gate (results.passed stays false)', async () => {
    const orchestrator = makeOrchestrator();
    const gates = [
      { name: 'WIRE_CHECK_GATE', required: true, validator: async () => ({ passed: false, score: 0, maxScore: 100 }) },
    ];
    const results = await orchestrator.validateGates(gates, {});
    expect(results.passed).toBe(false);
    expect(results.failedGate).toBe('WIRE_CHECK_GATE');
  });

  it('the FULL live LEAD-FINAL-APPROVAL roster (getRequiredGates(), not a hardcoded list of 9) persists its real static required value for every gate', async () => {
    // Real gate names + real `required` declarations, pulled from the actual registration
    // function -- proves the fix holds for the whole roster, not just the SD's originally-cited
    // 9 files. Validators are swapped for dummies (passed:true, no `required` key) so this stays
    // a pure unit test with no DB/network dependency -- only .name and .required are read from
    // the real definitions.
    const realGateDefs = getRequiredGates({}, {}, { sd_key: 'SD-FIXTURE-001', sd_type: 'bugfix' });
    expect(realGateDefs.length).toBeGreaterThan(15); // sanity: this is the real, wide roster, not a stub
    const requiredCount = realGateDefs.filter((g) => g.required !== false).length;
    expect(requiredCount).toBeGreaterThan(10); // sanity: most of the roster is required

    const orchestrator = makeOrchestrator();
    const dummyGates = realGateDefs.map((g) => ({
      name: g.name,
      required: g.required,
      validator: async () => ({ passed: true, score: 100, maxScore: 100 }),
    }));
    const results = await orchestrator.validateGates(dummyGates, {});

    for (const g of realGateDefs) {
      const expected = g.required !== false;
      expect(results.gateResults[g.name].required).toBe(expected);
    }
  });

  it('SECURITY finding L5: a replayed cache-hit verdict does NOT fabricate required_effective from the prior run\'s injected static `required`', async () => {
    // Prior run's already-merged result (what a real cached PASS verdict looks like post-fix):
    // `required: true` here is the ORCHESTRATOR'S OWN static injection from a previous pass, not
    // a validator's dynamic override. Replaying it must not be misread as "the validator set
    // required_effective".
    const priorMergedResult = { passed: true, score: 100, maxScore: 100, required: true };
    const spy = vi.spyOn(gateVerdictCache, 'probeVerdictCache').mockReturnValue({
      hit: true, mode: 'cache_hit', inputHash: 'hash-1', priorResult: priorMergedResult,
    });
    try {
      const orchestrator = makeOrchestrator();
      const gates = [{ name: 'CACHED_GATE', required: true, validator: async () => ({ passed: true, score: 100, maxScore: 100 }) }];
      const results = await orchestrator.validateGates(gates, {});
      expect(results.gateResults.CACHED_GATE.cache_hit).toBe(true);
      expect(results.gateResults.CACHED_GATE.required).toBe(true);
      expect(results.gateResults.CACHED_GATE.required_effective).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });

  it('a replayed cache-hit verdict DOES preserve a genuinely-cached required_effective from a real prior validator override', async () => {
    // Unlike the case above, this prior result's required_effective was a REAL validator decision
    // (e.g. FR_DELIVERY_VERIFICATION's warn-only override), already correctly merged on a previous
    // pass -- replaying it must carry that forward, not strip it.
    const priorMergedResult = { passed: true, score: 0, maxScore: 100, required: true, required_effective: false };
    const spy = vi.spyOn(gateVerdictCache, 'probeVerdictCache').mockReturnValue({
      hit: true, mode: 'cache_hit', inputHash: 'hash-2', priorResult: priorMergedResult,
    });
    try {
      const orchestrator = makeOrchestrator();
      const gates = [{ name: 'FR_DELIVERY_VERIFICATION', required: true, validator: async () => ({ passed: true, score: 0, maxScore: 100, required: false }) }];
      const results = await orchestrator.validateGates(gates, {});
      expect(results.gateResults.FR_DELIVERY_VERIFICATION.required_effective).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});
