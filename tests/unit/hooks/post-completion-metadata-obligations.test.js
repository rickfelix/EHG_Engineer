/**
 * QF-20260817-001: _sweepMetadataObligations() in post-completion-validator.js.
 *
 * SPECIMEN: SD-FDBK-FIX-WORKER-ENGAGEMENT-RATIO-001 completed while carrying
 * metadata.solomon_concurrence_gate.state === 'CONCURRENCE-DEBT' -- no completion-path
 * check ever read it; the debt survived only because a coordinator hand-noticed it. This
 * sweep makes the debt visible (non-blocking) instead of silently dropping it.
 */
import { describe, it, expect } from 'vitest';
import { _sweepMetadataObligations } from '../../../scripts/hooks/stop-subagent-enforcement/post-completion-validator.js';

describe('_sweepMetadataObligations', () => {
  it('flags an unresolved solomon_concurrence_gate debt (the real specimen shape, pre-resolution)', () => {
    const metadata = {
      solomon_concurrence_gate: {
        state: 'CONCURRENCE-DEBT',
        required_before: 'PLAN_VERIFICATION sign-off / LEAD-FINAL',
        stamped_by: '0d37100a',
      },
    };
    const findings = _sweepMetadataObligations(metadata);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('solomon_concurrence_gate');
    expect(findings[0]).toContain('CONCURRENCE-DEBT');
    expect(findings[0]).toContain('PLAN_VERIFICATION');
  });

  it('does not flag a resolved solomon_concurrence_gate (resolved_at present)', () => {
    const metadata = {
      solomon_concurrence_gate: {
        state: 'CONCURRENCE-DEBT',
        resolved_at: '2026-08-17T21:53:41.540Z',
        resolved_by: 'Golf-7',
      },
    };
    expect(_sweepMetadataObligations(metadata)).toHaveLength(0);
  });

  it('does not flag a metadata object with no debt-shaped keys', () => {
    const metadata = { source: 'feedback', created_via: 'leo-create-sd', vision_key: 'VISION-EHG-L1-001' };
    expect(_sweepMetadataObligations(metadata)).toHaveLength(0);
  });

  it('surfaces an unrecognized debt-shaped key not in the allow-list (fail-loud on unknown convention)', () => {
    const metadata = { needs_chairman_review: { flagged_by: 'coordinator', at: '2026-08-19T00:00:00Z' } };
    const findings = _sweepMetadataObligations(metadata);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('needs_chairman_review');
    expect(findings[0]).toContain('unrecognized');
  });

  it('does not flag an unrecognized debt-shaped key that already carries a non-debt state', () => {
    const metadata = { amendment_history: { state: 'APPROVED' } };
    expect(_sweepMetadataObligations(metadata)).toHaveLength(0);
  });

  it('ignores debt-shaped keys whose value is not an object (string, array, number)', () => {
    const metadata = { concurrence_note: 'plain text, not a stamp object', debt_count: 3, debt_list: ['a', 'b'] };
    expect(_sweepMetadataObligations(metadata)).toHaveLength(0);
  });

  it('is total on null/undefined/non-object metadata', () => {
    expect(_sweepMetadataObligations(null)).toEqual([]);
    expect(_sweepMetadataObligations(undefined)).toEqual([]);
    expect(_sweepMetadataObligations('not an object')).toEqual([]);
  });

  it('reports multiple unresolved obligations in one sweep', () => {
    const metadata = {
      solomon_concurrence_gate: { state: 'CONCURRENCE-DEBT' },
      needs_chairman_review: { flagged_by: 'coordinator' },
    };
    expect(_sweepMetadataObligations(metadata)).toHaveLength(2);
  });
});
