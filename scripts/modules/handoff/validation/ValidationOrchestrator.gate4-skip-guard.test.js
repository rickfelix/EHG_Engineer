/**
 * SD-LEO-INFRA-LEAD-FINAL-APPROVAL-001-A — buildGatesFromRules' per-gate validator wrapper
 * blanket-skips EVERY DB-rule validator for a NON_CODE sd_type via shouldSkipCodeValidation(),
 * including gate '4' (the strategic-value composite: valueDelivered/patternEffectiveness/
 * executiveValidation/processAdherence, combined weight 1.00). That composite checks whether
 * value was delivered and a retrospective pattern captured -- meaningful for every sd_type,
 * not "code validation". Live specimen: SD-LEO-INFRA-STAGE23-WALKER-ELEVEN-OVERRIDES-001
 * (sd_type=infrastructure) completed LEAD-FINAL-APPROVAL at score 97 with these 4 gates silently
 * full-scored via createSkippedResult (100/100, arithmetically identical to a genuine pass).
 *
 * Fix: gate '4' is exempted from the skip ONLY when SD_TYPE_SKIP_GUARD_BINDING=true (observe-only
 * rollout, mirrors the LFA-002 *_BINDING=true precedent given a 73.7% fleet blast radius). Unbound
 * (default), behavior is byte-identical to before -- gate 4 is still skipped, with only an added
 * console.warn naming what would change once bound.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ValidationOrchestrator } from './ValidationOrchestrator.js';

const ORIGINAL_ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

/**
 * Builds an orchestrator wired with:
 * - loadValidationRules stubbed to return the given fixture rules
 * - a fake validatorRegistry whose validator always returns a real, non-skipped PASS
 * - a fake supabase client whose strategic_directives_v2 lookup returns sdTypeRow
 */
function makeOrchestrator(rules, sdTypeRow) {
  const realValidatorSpy = vi.fn().mockResolvedValue({ passed: true, score: 100, maxScore: 100 });
  const fakeValidatorRegistry = {
    getOrCreateFallback: () => realValidatorSpy,
    normalizeResult: (r) => r,
  };
  const fakeSupabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: sdTypeRow }),
        }),
      }),
    }),
  };
  const orchestrator = new ValidationOrchestrator(fakeSupabase, { validatorRegistry: fakeValidatorRegistry });
  vi.spyOn(orchestrator, 'loadValidationRules').mockResolvedValue(rules);
  return { orchestrator, realValidatorSpy };
}

const GATE4_RULE = { gate: '4', rule_name: 'valueDelivered', weight: 0.35, required: true };
const NON_GATE4_RULE = { gate: '2', rule_name: 'someCodeCheck', weight: 0.5, required: true };
const INFRA_SD = { id: 'sd-under-test', sd_type: 'infrastructure', title: 'test' };

describe('buildGatesFromRules — gate 4 (strategic-value) skip guard', () => {
  it('unbound (default): gate 4 is still SKIPPED for an infrastructure SD, byte-identical to before the fix', async () => {
    const { orchestrator, realValidatorSpy } = makeOrchestrator([GATE4_RULE], INFRA_SD);
    const gates = await orchestrator.buildGatesFromRules([], 'LEAD-FINAL-APPROVAL', {
      sd_id: INFRA_SD.id,
    });
    const gate4 = gates.find((g) => g.meta?.gate === '4');
    const result = await gate4.validator({});
    expect(result.status).toBe('SKIPPED');
    expect(result.skipReason).toBe('NON_APPLICABLE_SD_TYPE');
    expect(realValidatorSpy).not.toHaveBeenCalled();
  });

  it('bound (SD_TYPE_SKIP_GUARD_BINDING=true): gate 4 is exempted and falls through to the real validator', async () => {
    process.env.SD_TYPE_SKIP_GUARD_BINDING = 'true';
    const { orchestrator, realValidatorSpy } = makeOrchestrator([GATE4_RULE], INFRA_SD);
    const gates = await orchestrator.buildGatesFromRules([], 'LEAD-FINAL-APPROVAL', {
      sd_id: INFRA_SD.id,
    });
    const gate4 = gates.find((g) => g.meta?.gate === '4');
    const result = await gate4.validator({});
    expect(realValidatorSpy).toHaveBeenCalledTimes(1);
    expect(result.passed).toBe(true);
    expect(result.status).not.toBe('SKIPPED');
  });

  it('a genuinely code-specific gate (not gate 4) is still correctly skipped for a non-code sd_type, UNBOUND', async () => {
    const { orchestrator, realValidatorSpy } = makeOrchestrator([NON_GATE4_RULE], INFRA_SD);
    const gates = await orchestrator.buildGatesFromRules([], 'LEAD-FINAL-APPROVAL', {
      sd_id: INFRA_SD.id,
    });
    const gate = gates.find((g) => g.meta?.gate === '2');
    const result = await gate.validator({});
    expect(result.status).toBe('SKIPPED');
    expect(realValidatorSpy).not.toHaveBeenCalled();
  });

  it('a genuinely code-specific gate (not gate 4) is still correctly skipped for a non-code sd_type, BOUND -- the fix narrows only gate 4, nothing else', async () => {
    process.env.SD_TYPE_SKIP_GUARD_BINDING = 'true';
    const { orchestrator, realValidatorSpy } = makeOrchestrator([NON_GATE4_RULE], INFRA_SD);
    const gates = await orchestrator.buildGatesFromRules([], 'LEAD-FINAL-APPROVAL', {
      sd_id: INFRA_SD.id,
    });
    const gate = gates.find((g) => g.meta?.gate === '2');
    const result = await gate.validator({});
    expect(result.status).toBe('SKIPPED');
    expect(realValidatorSpy).not.toHaveBeenCalled();
  });

  it('a code-type SD (e.g. feature) never hits shouldSkipCodeValidation at all -- gate 4 runs normally regardless of binding', async () => {
    const featureSd = { id: 'sd-feature', sd_type: 'feature', title: 'test' };
    const { orchestrator, realValidatorSpy } = makeOrchestrator([GATE4_RULE], featureSd);
    const gates = await orchestrator.buildGatesFromRules([], 'LEAD-FINAL-APPROVAL', {
      sd_id: featureSd.id,
    });
    const gate4 = gates.find((g) => g.meta?.gate === '4');
    const result = await gate4.validator({});
    expect(realValidatorSpy).toHaveBeenCalledTimes(1);
    expect(result.passed).toBe(true);
  });
});
