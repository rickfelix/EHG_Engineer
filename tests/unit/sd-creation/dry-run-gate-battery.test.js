/**
 * QF-20260907-765 (deferred half (b) of QF-20260905-431): dryRunGateBattery composes the REAL
 * LEAD-TO-PLAN gate validators (never a hand-rolled reimplementation that could drift from them)
 * against a not-yet-inserted SD candidate, so createChild() can refuse a mint known to fail
 * those gates instead of inserting a row known to fail.
 */
import { describe, it, expect } from 'vitest';
import { dryRunGateBattery } from '../../../lib/sd-creation/dry-run-gate-battery.js';
import {
  buildDefaultSuccessCriteria, buildDefaultSmokeTestSteps,
  buildDefaultStrategicObjectives, buildDefaultKeyChanges, buildDefaultSuccessMetrics,
} from '../../../lib/sd-creation/pipeline.js';
import { buildChildDescription } from '../../../lib/sd-creation/source-adapters/child.js';

const PARENT = { sd_key: 'SD-TEST-PARENT-001', title: 'Parent SD', description: '' };
const CHILD_TITLE = 'Child of Parent SD';
const CHILD_TYPE = 'feature';
const CHILD_DESCRIPTION = buildChildDescription(PARENT, 'SD-TEST-PARENT-001-A', CHILD_TITLE);

function baseCandidate(overrides = {}) {
  return {
    sd_key: 'SD-TEST-PARENT-001-A',
    title: CHILD_TITLE,
    description: CHILD_DESCRIPTION,
    sd_type: CHILD_TYPE,
    success_criteria: buildDefaultSuccessCriteria(CHILD_TYPE, CHILD_TITLE),
    smoke_test_steps: buildDefaultSmokeTestSteps(CHILD_TYPE, CHILD_TITLE, CHILD_DESCRIPTION),
    strategic_objectives: buildDefaultStrategicObjectives(CHILD_TYPE, CHILD_TITLE),
    key_changes: buildDefaultKeyChanges(CHILD_TYPE, CHILD_TITLE),
    success_metrics: buildDefaultSuccessMetrics(CHILD_TYPE, CHILD_TITLE),
    metadata: { mechanism_verifications: [] },
    ...overrides,
  };
}

describe('dryRunGateBattery — the exact defect this QF fixes (all-boilerplate candidate)', () => {
  it('refuses (pass:false) a candidate built entirely from buildDefault*() generics, naming the failing gates', async () => {
    const result = await dryRunGateBattery(baseCandidate());
    expect(result.pass).toBe(false);
    expect(result.failingGates).toContain('GATE_PLACEHOLDER_CONTENT_DETECTION');
    expect(result.failingGates).toContain('GATE_SMOKE_TEST_SPECIFICATION');
  });

  it('GATE_SD_QUALITY passes even in the all-boilerplate case (buildChildDescription already clears the description-length floor)', async () => {
    const result = await dryRunGateBattery(baseCandidate());
    expect(result.failingGates).not.toContain('GATE_SD_QUALITY');
  });
});

describe('dryRunGateBattery — a caller with real per-child content passes', () => {
  it('passes once success_criteria and smoke_test_steps are real, SD-specific content', async () => {
    const result = await dryRunGateBattery(baseCandidate({
      success_criteria: [{ criterion: 'Ship the widget migration end-to-end', measure: 'All widgets migrated, verified via smoke test' }],
      smoke_test_steps: [{ step_number: 1, instruction: 'Run the widget migration script against staging', expected_outcome: 'All widgets report migrated status in the admin dashboard' }],
    }));
    expect(result.pass).toBe(true);
    expect(result.failingGates).toEqual([]);
  });

  it('GATE_MECHANISM_CLAIM_VERIFIER passes trivially — a fresh child mint asserts no file+function mechanism', async () => {
    const result = await dryRunGateBattery(baseCandidate());
    expect(result.details.GATE_MECHANISM_CLAIM_VERIFIER.pass).toBe(true);
    expect(result.details.GATE_MECHANISM_CLAIM_VERIFIER.details.claims).toEqual([]);
  });
});

describe('dryRunGateBattery — validateSDFields enrichment mirrors createSD()\'s own pre-insert call', () => {
  it('fills the JSONB fields buildDefault*() does not cover (dependencies, implementation_guidelines, key_principles, risks)', async () => {
    const result = await dryRunGateBattery(baseCandidate());
    const sdQuality = result.details.GATE_SD_QUALITY;
    // Field completeness is the FIRST 40 points of GATE_SD_QUALITY's score — full marks here
    // proves validateSDFields' autoPopulateMissingFields ran (dependencies/implementation_
    // guidelines/key_principles/risks are otherwise absent from baseCandidate entirely).
    expect(sdQuality.score).toBeGreaterThanOrEqual(40);
  });
});
