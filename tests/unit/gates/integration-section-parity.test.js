/**
 * SD-LEARN-FIX-ADDRESS-PAT-LES-012 (TS-4): gate-verdict parity between
 * integration_operationalization = NULL and = the write-path default placeholder.
 *
 * Drives the REAL createIntegrationSectionValidationGate().validator() (not a
 * re-implementation of its logic -- see TESTING finding F9: a re-implemented predicate is
 * exactly the drift class that let a prior fabricated placeholder pass its own hand-rolled
 * test). No DB needed: ctx._prd supplies the PRD row directly.
 *
 * Restated exit predicate (LEAD-phase VALIDATION correction, FINAL per TESTING F1 --
 * the original "same missing/empty subsection LIST pre/post" framing is mathematically
 * unsatisfiable: NULL yields missingSubsections=[all 5]/emptySubsections=[], while any
 * populated 5-key object yields the reverse by construction of the gate's own walk logic):
 *   (a) .passed and .score are byte-identical pre/post per sd_type
 *   (b) presentSubsections.length === 0 post-backfill (anti-fabrication invariant)
 *   (c) missingSubsections.length + emptySubsections.length === 5 both pre and post
 * List identity between missingSubsections/emptySubsections is deliberately NOT asserted.
 */
import { describe, it, expect } from 'vitest';
import { createIntegrationSectionValidationGate } from '../../../scripts/modules/handoff/executors/plan-to-exec/gates/integration-section-validation.js';
import { buildDefaultIntegrationOperationalization } from '../../../scripts/prd/prd-creator.js';

const gate = createIntegrationSectionValidationGate(null, null);
const DEFAULT_PLACEHOLDER = buildDefaultIntegrationOperationalization();

async function runGate(sdType, integrationData) {
  return gate.validator({
    sd: { sd_type: sdType },
    _prd: { id: 'test-prd', integration_operationalization: integrationData },
  });
}

// Matches the live sd_type vocabulary measured by the VALIDATION/TESTING sub-agent passes
// on this SD (BLOCKING_SD_TYPES=[feature,bugfix]; WARNING for everything else except
// SKIP_SD_TYPES=[documentation]).
const SD_TYPES = ['feature', 'bugfix', 'infrastructure', 'orchestrator', 'refactor', 'enhancement', 'database', 'security', 'implementation', 'docs'];

describe('SD-LEARN-FIX-ADDRESS-PAT-LES-012 (TS-4): gate-verdict parity, NULL vs. default placeholder', () => {
  for (const sdType of SD_TYPES) {
    it(`sd_type=${sdType}: .passed and .score are byte-identical`, async () => {
      const nullResult = await runGate(sdType, null);
      const defaultResult = await runGate(sdType, DEFAULT_PLACEHOLDER);

      expect(defaultResult.passed).toBe(nullResult.passed);
      expect(defaultResult.score).toBe(nullResult.score);
    });

    it(`sd_type=${sdType}: presentSubsections.length === 0 after the default (anti-fabrication)`, async () => {
      const defaultResult = await runGate(sdType, DEFAULT_PLACEHOLDER);
      const validation = defaultResult.details?.validation;
      if (validation) {
        expect(validation.presentSubsections.length).toBe(0);
      }
    });

    it(`sd_type=${sdType}: missingSubsections.length + emptySubsections.length === 5, both pre and post`, async () => {
      const nullResult = await runGate(sdType, null);
      const defaultResult = await runGate(sdType, DEFAULT_PLACEHOLDER);
      const nullValidation = nullResult.details?.validation;
      const defaultValidation = defaultResult.details?.validation;
      if (nullValidation) {
        expect(nullValidation.missingSubsections.length + nullValidation.emptySubsections.length).toBe(5);
      }
      if (defaultValidation) {
        expect(defaultValidation.missingSubsections.length + defaultValidation.emptySubsections.length).toBe(5);
      }
    });
  }

  it('documentation stays SKIP (score 100, no validation object) -- backfill does not drag it into validation', async () => {
    const nullResult = await runGate('documentation', null);
    const defaultResult = await runGate('documentation', DEFAULT_PLACEHOLDER);
    expect(nullResult.passed).toBe(true);
    expect(nullResult.score).toBe(100);
    expect(defaultResult.passed).toBe(true);
    expect(defaultResult.score).toBe(100);
    expect(defaultResult.details?.skipped).toBe(true);
  });

  it('BLOCKING TYPES SPECIFICALLY: feature/bugfix stay passed=false, score=0 after the default -- a test going green by the gate PASSING would BE the corruption signature', async () => {
    for (const sdType of ['feature', 'bugfix']) {
      const result = await runGate(sdType, DEFAULT_PLACEHOLDER);
      expect(result.passed, `sd_type=${sdType} must still FAIL the gate`).toBe(false);
      expect(result.score, `sd_type=${sdType} score must still be 0`).toBe(0);
    }
  });

  it('real, non-empty authored content still passes fully (this fix does not loosen genuine validation)', async () => {
    const realContent = {
      consumers: [{ name: 'x', interaction: 'x', frequency: 'x' }],
      dependencies: [{ name: 'x', type: 'upstream', contract: 'x', failure_handling: 'x' }],
      data_contracts: [{ contract_name: 'x', schema: 'x', validation: 'x', versioning: 'x' }],
      runtime_config: { environment_variables: ['X'], feature_flags: [], deployment_considerations: 'x' },
      observability_rollout: { monitoring: ['x'], alerts: ['x'], rollout_strategy: 'x', rollback_trigger: 'x', rollback_procedure: 'x' },
    };
    const result = await runGate('feature', realContent);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });
});
