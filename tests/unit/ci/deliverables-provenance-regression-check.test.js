/**
 * SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-G (FR-5): both census classifiers are pure functions,
 * importable and unit-testable without touching Supabase or process.env.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyHandoffProvenance,
  classifyDeliverableProvenance,
} from '../../../scripts/ci/deliverables-provenance-regression-check.mjs';

describe('classifyHandoffProvenance', () => {
  it('a row with validation_details.score_source set is compliant', () => {
    const rows = [{ id: 'h1', handoff_type: 'PLAN-TO-EXEC', validation_details: { score_source: 'measured' } }];
    const buckets = classifyHandoffProvenance(rows);
    expect(buckets.compliant).toHaveLength(1);
    expect(buckets.missing_score_source).toHaveLength(0);
  });

  it('a row with no score_source is missing_score_source -- reproduces the pre-fix LEAD-FINAL-APPROVAL shape', () => {
    const rows = [{ id: 'h2', handoff_type: 'LEAD-FINAL-APPROVAL', validation_details: { written_by: 'x' } }];
    const buckets = classifyHandoffProvenance(rows);
    expect(buckets.missing_score_source).toHaveLength(1);
    expect(buckets.compliant).toHaveLength(0);
  });

  it('a null validation_details is missing_score_source, not a throw', () => {
    const rows = [{ id: 'h3', handoff_type: 'X', validation_details: null }];
    const buckets = classifyHandoffProvenance(rows);
    expect(buckets.missing_score_source.map((r) => r.id)).toEqual(['h3']);
  });

  it('a falsy/empty score_source is treated as absent', () => {
    const rows = [{ id: 'h4', handoff_type: 'X', validation_details: { score_source: '' } }];
    expect(classifyHandoffProvenance(rows).missing_score_source).toHaveLength(1);
  });

  it('classifies a mixed batch independently', () => {
    const rows = [
      { id: 'ok-1', handoff_type: 'A', validation_details: { score_source: 'measured' } },
      { id: 'bad-1', handoff_type: 'B', validation_details: null },
    ];
    const buckets = classifyHandoffProvenance(rows);
    expect(buckets.compliant.map((r) => r.id)).toEqual(['ok-1']);
    expect(buckets.missing_score_source.map((r) => r.id)).toEqual(['bad-1']);
  });
});

const CUTOVER = '2026-09-05T00:00:00.000Z';
const AFTER = '2026-09-06T00:00:00.000Z';
const BEFORE = '2026-01-01T00:00:00.000Z';

describe('classifyDeliverableProvenance', () => {
  it('a completed row post-cutover with no metadata.producer is missing_producer', () => {
    const rows = [{ id: 'd1', completion_status: 'completed', completed_at: AFTER, metadata: {} }];
    const buckets = classifyDeliverableProvenance(rows, CUTOVER);
    expect(buckets.missing_producer.map((r) => r.id)).toEqual(['d1']);
    expect(buckets.compliant).toHaveLength(0);
  });

  it('a completed row post-cutover WITH metadata.producer is compliant', () => {
    const rows = [{ id: 'd2', completion_status: 'completed', completed_at: AFTER, metadata: { producer: 'hand_completed' } }];
    const buckets = classifyDeliverableProvenance(rows, CUTOVER);
    expect(buckets.compliant.map((r) => r.id)).toEqual(['d2']);
  });

  it('a row predating the cutover (or with no completed_at) is compliant regardless of producer', () => {
    const rows = [
      { id: 'd3', completion_status: 'completed', completed_at: BEFORE, metadata: {} },
      { id: 'd4', completion_status: 'completed', completed_at: null, metadata: {} },
    ];
    const buckets = classifyDeliverableProvenance(rows, CUTOVER);
    expect(buckets.compliant.map((r) => r.id).sort()).toEqual(['d3', 'd4']);
    expect(buckets.missing_producer).toHaveLength(0);
  });

  it('a non-completed row is compliant regardless of producer', () => {
    const rows = [{ id: 'd5', completion_status: 'in_progress', completed_at: AFTER, metadata: {} }];
    const buckets = classifyDeliverableProvenance(rows, CUTOVER);
    expect(buckets.compliant.map((r) => r.id)).toEqual(['d5']);
  });
});
