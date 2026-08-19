/**
 * QF-20260817-001: _sweepMetadataObligations() in post-completion-validator.js.
 *
 * SPECIMEN: SD-FDBK-FIX-WORKER-ENGAGEMENT-RATIO-001 completed while carrying
 * metadata.solomon_concurrence_gate.state === 'CONCURRENCE-DEBT' -- no completion-path
 * check ever read it; the debt survived only because a coordinator hand-noticed it. This
 * sweep makes the debt visible (non-blocking) instead of silently dropping it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/governance/emit-feedback.js', () => ({
  emitFeedback: vi.fn().mockResolvedValue({ id: 'fake-feedback-id', deduped: false }),
}));

import { emitFeedback } from '../../../lib/governance/emit-feedback.js';
import {
  _sweepMetadataObligations,
  _flagMetadataObligations,
} from '../../../scripts/hooks/stop-subagent-enforcement/post-completion-validator.js';

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

describe('_flagMetadataObligations', () => {
  const fakeSupabase = {};

  beforeEach(() => {
    emitFeedback.mockClear();
  });

  it('writes a completion-flag feedback row with provenance when findings exist', async () => {
    const findings = ['solomon_concurrence_gate: state="CONCURRENCE-DEBT" (stamped_by=0d37100a, required_before=LEAD-FINAL)'];
    await _flagMetadataObligations(fakeSupabase, 'SD-FDBK-FIX-WORKER-ENGAGEMENT-RATIO-001', 'sd-uuid-123', findings);

    expect(emitFeedback).toHaveBeenCalledTimes(1);
    const call = emitFeedback.mock.calls[0][0];
    expect(call.supabase).toBe(fakeSupabase);
    expect(call.category).toBe('completion_flag');
    expect(call.type).toBe('issue');
    expect(call.status).toBe('new');
    expect(call.sd_id).toBe('sd-uuid-123');
    expect(call.description).toContain('CONCURRENCE-DEBT');
    expect(call.dedup_key).toBe('qf-20260817-001-metadata-obligation::SD-FDBK-FIX-WORKER-ENGAGEMENT-RATIO-001');
    expect(call.metadata.sd_key).toBe('SD-FDBK-FIX-WORKER-ENGAGEMENT-RATIO-001');
    expect(call.metadata.obligations).toEqual(findings);
    // Must NOT reuse the human-reflection witness's origin markers -- that would let an
    // automated finding silently satisfy a check whose purpose is proving a human ran it.
    expect(call.metadata.completion_flag_origin).toBeUndefined();
    expect(call.metadata.source_sd_key).toBeUndefined();
  });

  it('does not write anything when there are no findings', async () => {
    await _flagMetadataObligations(fakeSupabase, 'SD-CLEAN-001', 'sd-uuid-456', []);
    expect(emitFeedback).not.toHaveBeenCalled();
  });

  it('does not throw when emitFeedback rejects (best-effort, non-blocking)', async () => {
    emitFeedback.mockRejectedValueOnce(new Error('db unavailable'));
    await expect(
      _flagMetadataObligations(fakeSupabase, 'SD-X-001', 'sd-uuid-789', ['some_key: state="DEBT"'])
    ).resolves.toBeUndefined();
  });

  it('is a no-op when supabase is falsy', async () => {
    await _flagMetadataObligations(null, 'SD-X-001', 'sd-uuid-789', ['some_key: state="DEBT"']);
    expect(emitFeedback).not.toHaveBeenCalled();
  });
});
