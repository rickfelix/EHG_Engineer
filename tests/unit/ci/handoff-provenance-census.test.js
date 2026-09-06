// SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-G FR-1.
import { describe, it, expect } from 'vitest';
import { censusByHandoffType, KNOWN_WRITERS, CONFIRMED_DEAD_WRITERS } from '../../../scripts/ci/handoff-provenance-census.mjs';

describe('censusByHandoffType', () => {
  it('groups by handoff_type, not to_phase -- LEAD-FINAL-APPROVAL rows have from_phase=to_phase=LEAD', () => {
    const rows = [
      { handoff_type: 'LEAD-FINAL-APPROVAL', validation_details: { written_by: 'x' } }, // no score_source
      { handoff_type: 'LEAD-FINAL-APPROVAL', validation_details: null },
      { handoff_type: 'PLAN-TO-LEAD', validation_details: { score_source: 'measured' } },
    ];
    const result = censusByHandoffType(rows);
    expect(result['LEAD-FINAL-APPROVAL']).toEqual({ total: 2, with_score_source: 0, without_score_source: 2 });
    expect(result['PLAN-TO-LEAD']).toEqual({ total: 1, with_score_source: 1, without_score_source: 0 });
  });

  it('treats a falsy/empty score_source as absent', () => {
    const rows = [{ handoff_type: 'X', validation_details: { score_source: '' } }];
    expect(censusByHandoffType(rows)['X'].without_score_source).toBe(1);
  });

  it('handles an empty row set', () => {
    expect(censusByHandoffType([])).toEqual({});
  });

  it('buckets a missing handoff_type as UNKNOWN rather than throwing', () => {
    const result = censusByHandoffType([{ handoff_type: null, validation_details: {} }]);
    expect(result['UNKNOWN'].total).toBe(1);
  });
});

describe('KNOWN_WRITERS / CONFIRMED_DEAD_WRITERS', () => {
  it('lists exactly the 5 confirmed live writers', () => {
    expect(KNOWN_WRITERS).toHaveLength(5);
    expect(KNOWN_WRITERS.map((w) => w.name)).toContain('HandoffRecorder.createArtifact');
    expect(KNOWN_WRITERS.map((w) => w.name)).toContain('lead-final-approval canonical write');
  });

  it('post-fix (FR-2/FR-3): HandoffRecorder.createArtifact and the lead-final-approval canonical write both directly call the shared builder; the reconcile path achieves correctness by copying from a sibling row instead', () => {
    const direct = KNOWN_WRITERS.filter((w) => w.calls_shared_builder === true);
    expect(direct.map((w) => w.name).sort()).toEqual(['HandoffRecorder.createArtifact', 'lead-final-approval canonical write'].sort());
    const reconcile = KNOWN_WRITERS.find((w) => w.name.includes('reconcile'));
    expect(reconcile.calls_shared_builder).toBe('copies-from-sibling');
  });

  it('the 2 remaining writers (orchestrator-completion-guardian, plan-to-lead template satisfaction) are documented as NOT yet applying the shared builder', () => {
    const notFixed = KNOWN_WRITERS.filter((w) => w.calls_shared_builder === false);
    expect(notFixed).toHaveLength(2);
  });

  it('documents the 2 confirmed-dead insert attempts separately from live writers', () => {
    expect(CONFIRMED_DEAD_WRITERS).toHaveLength(2);
  });
});
