/**
 * SD-LEO-INFRA-LEAD-FINAL-APPROVAL-001-A — buildGatesFromRules' per-gate validator wrapper
 * blanket-skips EVERY DB-rule validator for a NON_CODE sd_type via shouldSkipCodeValidation(),
 * including all EIGHT rules registered under gate '4': valueDelivered/patternEffectiveness/
 * executiveValidation/processAdherence (gate-4-strategic-value.js) PLUS
 * planToLeadHandoffExists/userStoriesComplete/retrospectiveExists/prMergeVerification
 * (additional-validators.js, seeded weight:0 but effectively weight 1.0 via the separate,
 * out-of-scope `gate.weight || 1.0` defect at ValidationOrchestrator.js:401/1336 -- TESTING
 * sub-agent, EXEC-TO-PLAN review). All eight check whether value/process was delivered --
 * meaningful for every sd_type, not "code validation". Live specimen:
 * SD-LEO-INFRA-STAGE23-WALKER-ELEVEN-OVERRIDES-001 (sd_type=infrastructure) completed
 * LEAD-FINAL-APPROVAL at score 97 with gate 4 silently full-scored via createSkippedResult
 * (100/100, arithmetically identical to a genuine pass).
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

// TESTING sub-agent (EXEC-TO-PLAN review): gate '4' has 4 MORE registered rules beyond the
// strategic-value composite -- all seeded weight:0 in additional-validators.js, all subject to
// the same blanket skip, so the exemption (keyed on gate==='4' only) covers them too.
const ZERO_WEIGHT_GATE4_RULES = [
  { gate: '4', rule_name: 'planToLeadHandoffExists', weight: 0, required: true },
  { gate: '4', rule_name: 'userStoriesComplete', weight: 0, required: true },
  { gate: '4', rule_name: 'retrospectiveExists', weight: 0, required: true },
  { gate: '4', rule_name: 'prMergeVerification', weight: 0, required: true },
];

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

  it.each(ZERO_WEIGHT_GATE4_RULES)(
    'the zero-weight gate-4 rule $rule_name is also exempted when bound (the fix is keyed on gate===4, not on any specific rule_name)',
    async (rule) => {
      process.env.SD_TYPE_SKIP_GUARD_BINDING = 'true';
      const { orchestrator, realValidatorSpy } = makeOrchestrator([rule], INFRA_SD);
      const gates = await orchestrator.buildGatesFromRules([], 'LEAD-FINAL-APPROVAL', {
        sd_id: INFRA_SD.id,
      });
      const gate = gates.find((g) => g.meta?.ruleName === rule.rule_name);
      const result = await gate.validator({});
      expect(realValidatorSpy).toHaveBeenCalledTimes(1);
      expect(result.status).not.toBe('SKIPPED');
    },
  );

  it.each(ZERO_WEIGHT_GATE4_RULES)(
    'the zero-weight gate-4 rule $rule_name is still SKIPPED unbound (default, no behavior change)',
    async (rule) => {
      const { orchestrator, realValidatorSpy } = makeOrchestrator([rule], INFRA_SD);
      const gates = await orchestrator.buildGatesFromRules([], 'LEAD-FINAL-APPROVAL', {
        sd_id: INFRA_SD.id,
      });
      const gate = gates.find((g) => g.meta?.ruleName === rule.rule_name);
      const result = await gate.validator({});
      expect(result.status).toBe('SKIPPED');
      expect(realValidatorSpy).not.toHaveBeenCalled();
    },
  );
});
