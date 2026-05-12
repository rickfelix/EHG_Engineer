/**
 * Tests for scripts/validate-boundary-config-coherence.mjs
 * SD-LEO-INFRA-REALITY-GATE-ARTIFACT-001 FR-6 + FR-7.
 *
 * Validates the coherence-checker pure functions used by the CI guard.
 */
import { describe, it, expect } from 'vitest';
import {
  findOrphanArtifactTypes,
  evaluateCoherence,
} from '../../../scripts/validate-boundary-config-coherence.mjs';

const STAGES_V2 = [
  { stage_number: 1, required_artifacts: ['truth_idea_brief'] },
  { stage_number: 2, required_artifacts: ['truth_ai_critique'] },
  { stage_number: 3, required_artifacts: ['truth_validation_decision'] },
  { stage_number: 5, required_artifacts: ['truth_financial_model'] },
  { stage_number: 6, required_artifacts: ['engine_risk_matrix'] },
  { stage_number: 7, required_artifacts: ['engine_pricing_model'] },
  { stage_number: 8, required_artifacts: ['engine_business_model_canvas'] },
  { stage_number: 9, required_artifacts: ['engine_exit_strategy'] },
];

describe('findOrphanArtifactTypes', () => {
  it('returns empty when every required artifact_type appears upstream', () => {
    const boundaries = [
      { from_stage: 9, to_stage: 10, required_artifacts: ['engine_risk_matrix', 'engine_business_model_canvas'] },
    ];
    expect(findOrphanArtifactTypes(boundaries, STAGES_V2)).toEqual([]);
  });

  it('flags artifact_types no upstream stage emits', () => {
    const boundaries = [
      { from_stage: 9, to_stage: 10, required_artifacts: ['engine_risk_assessment', 'engine_revenue_model'] }, // the NameSignal bug names
    ];
    const orphans = findOrphanArtifactTypes(boundaries, STAGES_V2);
    expect(orphans).toEqual([
      { from_stage: 9, to_stage: 10, artifact_type: 'engine_risk_assessment' },
      { from_stage: 9, to_stage: 10, artifact_type: 'engine_revenue_model' },
    ]);
  });

  it('only counts stages with stage_number <= from_stage as upstream', () => {
    const boundaries = [
      { from_stage: 5, to_stage: 6, required_artifacts: ['engine_risk_matrix'] }, // emitted by S6 — too late for the 5->6 boundary
    ];
    const orphans = findOrphanArtifactTypes(boundaries, STAGES_V2);
    expect(orphans).toEqual([
      { from_stage: 5, to_stage: 6, artifact_type: 'engine_risk_matrix' },
    ]);
  });

  it('handles empty required_artifacts arrays', () => {
    const boundaries = [{ from_stage: 1, to_stage: 2, required_artifacts: [] }];
    expect(findOrphanArtifactTypes(boundaries, STAGES_V2)).toEqual([]);
  });

  it('handles empty stages list — every requirement becomes an orphan', () => {
    const boundaries = [{ from_stage: 1, to_stage: 2, required_artifacts: ['truth_idea_brief'] }];
    expect(findOrphanArtifactTypes(boundaries, [])).toEqual([
      { from_stage: 1, to_stage: 2, artifact_type: 'truth_idea_brief' },
    ]);
  });
});

describe('evaluateCoherence', () => {
  it('returns ok=true with no orphans when all upstream matches', () => {
    const boundaries = [
      { from_stage: 9, to_stage: 10, required_artifacts: ['engine_risk_matrix', 'engine_business_model_canvas'] },
    ];
    const result = evaluateCoherence(boundaries, STAGES_V2);
    expect(result.ok).toBe(true);
    expect(result.orphans).toEqual([]);
    expect(result.summary).toMatch(/^OK:/);
  });

  it('returns ok=false and orphan list when drift is present', () => {
    const boundaries = [
      { from_stage: 9, to_stage: 10, required_artifacts: ['engine_risk_assessment'] },
      { from_stage: 5, to_stage: 6, required_artifacts: ['truth_financial_model'] }, // OK
    ];
    const result = evaluateCoherence(boundaries, STAGES_V2);
    expect(result.ok).toBe(false);
    expect(result.orphans.length).toBe(1);
    expect(result.orphans[0]).toMatchObject({ from_stage: 9, artifact_type: 'engine_risk_assessment' });
    expect(result.summary).toMatch(/^DRIFT:/);
  });

  it('preserves the NameSignal-class bug signature in orphan output', () => {
    // The exact bug scenario the SD was created to fix
    const boundaries = [
      { from_stage: 9, to_stage: 10, required_artifacts: ['engine_risk_assessment', 'engine_revenue_model', 'engine_business_model_canvas'] },
    ];
    const result = evaluateCoherence(boundaries, STAGES_V2);
    expect(result.ok).toBe(false);
    // 2 of 3 should be orphans; engine_business_model_canvas is real
    expect(result.orphans.map(o => o.artifact_type).sort()).toEqual(['engine_revenue_model', 'engine_risk_assessment']);
  });
});
