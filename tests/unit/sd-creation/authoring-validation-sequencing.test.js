/**
 * SD-LEO-INFRA-SHIFT-LEFT-PRD-001 (FR-1/TR-2, TS-8/TS-9/TS-10).
 *
 * TS-8 is CRITICAL / release-blocking (PLAN-phase TESTING review, evidence
 * 28adeafe-e976-422a-82ec-30962c59ef1b, finding F2): the new authoring-time check
 * (validateArtifact('sd', sdData, {mode:'authoring'})) MUST run strictly AFTER
 * validateSDFields(sdData, {enrich:true}) inside createSD() -- buildDefaultKeyChanges()
 * and buildDefaultSuccessCriteria() emit plain-STRING arrays, which violate
 * validateArtifact's arrayOfObjects shape check. Measured: 6 shape violations on the raw
 * default-generated payload BEFORE enrichment, 0 AFTER. A source-line-position pin (asserting
 * the two calls are in the right textual order in pipeline.js) proves WHERE the call is, not
 * that it actually receives post-enrichment data -- this file proves the latter, behaviorally,
 * by running the real functions in the real order and inspecting the real result.
 */
import { describe, it, expect } from 'vitest';
import { validateSDFields } from '../../../scripts/modules/validate-sd-fields.js';
import { validateArtifact } from '../../../lib/artifact-contracts/index.js';
import { buildDefaultKeyChanges, buildDefaultSuccessCriteria } from '../../../lib/sd-creation/pipeline.js';

function rawDefaultInfraPayload(overrides = {}) {
  return {
    title: 'Shift-left sequencing fixture',
    description: 'Fixture description long enough to pass the description length check for GATE_SD_QUALITY scoring purposes.',
    scope: 'Fixture scope',
    sd_type: 'infrastructure',
    priority: 'medium',
    // The exact pre-enrichment shape buildDefault* produces: plain string arrays.
    key_changes: buildDefaultKeyChanges('infrastructure', 'Shift-left sequencing fixture'),
    success_criteria: buildDefaultSuccessCriteria('infrastructure', 'Shift-left sequencing fixture'),
    success_metrics: [
      { metric: 'Implementation completeness', target: '100% of scope items implemented' },
      { metric: 'Test coverage', target: '≥80% code coverage for new code' },
      { metric: 'Zero regressions', target: '0 existing tests broken' },
    ],
    smoke_test_steps: [
      { step_number: 1, instruction: 'Run the modified script for: X', expected_outcome: 'Script executes without errors' },
      { step_number: 2, instruction: 'Run the modified script for: Y', expected_outcome: 'Output is correct and complete' },
      { step_number: 3, instruction: 'Verify config applied correctly', expected_outcome: 'Config value observed in logs' },
    ],
    ...overrides,
  };
}

describe('TS-8 (CRITICAL): authoring-time check sees POST-enrichment shape, not raw defaults', () => {
  it('the raw default-generated payload violates arrayOfObjects shape BEFORE enrichment', () => {
    const raw = rawDefaultInfraPayload();
    const preEnrichment = validateArtifact('sd', raw, { mode: 'authoring' });
    const shapeFields = preEnrichment.violations.map((v) => v.field);
    expect(shapeFields.some((f) => f.startsWith('key_changes['))).toBe(true);
    expect(shapeFields.some((f) => f.startsWith('success_criteria['))).toBe(true);
  });

  it('the SAME payload, run through validateSDFields(enrich:true) first (the actual createSD() sequencing), has ZERO shape violations on key_changes/success_criteria', () => {
    const sdData = rawDefaultInfraPayload();
    validateSDFields(sdData, { enrich: true, quiet: true });

    // Enrichment must have actually converted the strings -- otherwise this test would pass
    // vacuously because nothing needed fixing.
    expect(sdData.key_changes.every((e) => typeof e === 'object' && e !== null)).toBe(true);
    expect(sdData.success_criteria.every((e) => typeof e === 'object' && e !== null)).toBe(true);

    const postEnrichment = validateArtifact('sd', sdData, { mode: 'authoring' });
    const shapeFields = postEnrichment.violations.map((v) => v.field);
    expect(shapeFields.some((f) => f.startsWith('key_changes['))).toBe(false);
    expect(shapeFields.some((f) => f.startsWith('success_criteria['))).toBe(false);
  });
});

describe('TS-9: partial-boilerplate smoke steps still warn after FR-5 descope (sd-contract.js\'s own detector, unmodified)', () => {
  it('1 real step + 2 default-generated steps still produces a boilerplate warning', () => {
    const sdData = rawDefaultInfraPayload({
      smoke_test_steps: [
        { step_number: 1, instruction: 'Create an SD with 1 success_metrics entry via createSD()', expected_outcome: 'createSD() logs an AUTHORING_VALIDATION_FAILED-style warning naming the insufficiency' },
        { step_number: 2, instruction: 'Run the modified script for: X', expected_outcome: 'Script executes without errors' },
        { step_number: 3, instruction: 'Run the modified script for: Y', expected_outcome: 'Output is correct and complete' },
      ],
    });
    validateSDFields(sdData, { enrich: true, quiet: true });
    const r = validateArtifact('sd', sdData, { mode: 'authoring' });
    const smokeWarnings = r.warnings.filter((w) => w.field.startsWith('smoke_test_steps'));
    expect(smokeWarnings.length).toBeGreaterThanOrEqual(2); // steps 2 and 3 both match existing patterns
  });
});

describe('TS-10: the success_criteria alternate-source fallback is UNREACHABLE post-enrichment (finding, not a passing behavior)', () => {
  // CORRECTED TWICE during EXEC (this test caught its own wrong assumptions on both runs):
  // (1) validateMetricsSufficiency only falls back to success_criteria when success_metrics is
  //     COMPLETELY absent/empty -- a THIN-but-present array (e.g. 1 entry) is measured on its
  //     own and fails at <3, it does NOT trigger the fallback.
  // (2) Deleting success_metrics entirely does NOT reach the fallback either: validateSDFields's
  //     own autoPopulateMissingFields (scripts/modules/validate-sd-fields.js:142-146) re-adds a
  //     1-ITEM default ([{metric:'Implementation completeness', target:'100%', actual:null}])
  //     whenever success_metrics is missing -- BEFORE the new authoring-time check ever runs
  //     (TR-2's sequencing guarantee). So within createSD()'s real flow, success_metrics can
  //     never actually be absent at the point this SD's check evaluates it; the alternate-source
  //     fallback validateMetricsSufficiency documents is effectively dead code for any SD created
  //     through createSD(). Documented here as a genuine PLAN-phase finding, not silently assumed.
  it('deleting success_metrics is refilled by enrichment with a 1-item boilerplate default, still <3 -- violates AND warns, exactly like the plain insufficient-count case', () => {
    const sdData = rawDefaultInfraPayload();
    delete sdData.success_metrics;
    sdData.success_criteria = [
      { criterion: 'A concrete, verifiable outcome one', measure: 'A concrete measurement one' },
      { criterion: 'A concrete, verifiable outcome two', measure: 'A concrete measurement two' },
      { criterion: 'A concrete, verifiable outcome three', measure: 'A concrete measurement three' },
    ];
    validateSDFields(sdData, { enrich: true, quiet: true });
    expect(sdData.success_metrics).toHaveLength(1); // enrichment refilled it -- never stayed absent
    const r = validateArtifact('sd', sdData, { mode: 'authoring' });
    expect(r.violations.some((v) => v.field === 'success_metrics')).toBe(true);
    expect(r.warnings.some((w) => w.field.startsWith('success_metrics['))).toBe(true); // matches BOILERPLATE_METRIC_PATTERNS too
  });

  it('a THIN (present but <3) success_metrics array is measured on its own, NOT rescued by a rich success_criteria', () => {
    const sdData = rawDefaultInfraPayload({
      success_metrics: [{ metric: 'Only one metric', target: '>=1', actual: '0' }],
      success_criteria: [
        { criterion: 'A concrete, verifiable outcome one', measure: 'A concrete measurement one' },
        { criterion: 'A concrete, verifiable outcome two', measure: 'A concrete measurement two' },
        { criterion: 'A concrete, verifiable outcome three', measure: 'A concrete measurement three' },
      ],
    });
    validateSDFields(sdData, { enrich: true, quiet: true });
    const r = validateArtifact('sd', sdData, { mode: 'authoring' });
    expect(r.violations.some((v) => v.field === 'success_metrics')).toBe(true);
  });
});
