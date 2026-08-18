// SD-FDBK-ENH-AUTO-APPLY-MIGRATION-001 FR-2/FR-3 — new-gap detection files exactly one feedback
// row per newly-detected RECENT gap, deduplicated across repeated detections of the same still-open
// gap. All DB/verifier calls are injected so this suite never touches pg or shells out.
import { describe, it, expect, vi } from 'vitest';
import { notifyNewGaps } from '../../scripts/migration-gap-notify.mjs';

function mockSupabase({ baselineRow = null } = {}) {
  return {
    from(table) {
      if (table === 'audit_log') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve({ data: baselineRow, error: null }),
                }),
              }),
            }),
          }),
          insert: () => Promise.resolve({ error: null }),
        };
      }
      return null;
    },
  };
}

const STATE_ONE_GAP = {
  recentGaps: [
    { file: 'database/migrations/20260817_set_venture_pbn_verdict_stage_zero.sql', status: 'NOT_APPLIED', missing: [{ cls: 'function', name: 'set_venture_pbn_verdict_stage_zero' }] },
  ],
};

const STATE_TWO_GAPS = {
  recentGaps: [
    { file: 'database/migrations/20260817_set_venture_pbn_verdict_stage_zero.sql', status: 'NOT_APPLIED', missing: [{ cls: 'function', name: 'set_venture_pbn_verdict_stage_zero' }] },
    { file: 'database/migrations/20260818_new_gap_example.sql', status: 'NOT_APPLIED', missing: [{ cls: 'table', name: 'example_table' }] },
  ],
};

describe('notifyNewGaps (FR-2/FR-3)', () => {
  it('a first-ever RECENT gap (no prior baseline) files exactly one feedback row', async () => {
    const supabase = mockSupabase({ baselineRow: null });
    const emitFeedback = vi.fn(async () => ({ id: 'fb-1', deduped: false }));
    const result = await notifyNewGaps({ supabase, runVerifier: () => STATE_ONE_GAP, emitFeedback });

    expect(result.newGaps).toEqual(['20260817_set_venture_pbn_verdict_stage_zero.sql']);
    expect(emitFeedback).toHaveBeenCalledTimes(1);
    expect(emitFeedback.mock.calls[0][0].dedup_key).toBe('20260817_set_venture_pbn_verdict_stage_zero.sql');
  });

  it('a gap already present in the prior baseline (still open) does NOT file a second row', async () => {
    const supabase = mockSupabase({
      baselineRow: { metadata: { recent_files: ['20260817_set_venture_pbn_verdict_stage_zero.sql'] }, created_at: '2026-08-18T00:00:00Z' },
    });
    const emitFeedback = vi.fn(async () => ({ id: 'fb-1', deduped: false }));
    const result = await notifyNewGaps({ supabase, runVerifier: () => STATE_ONE_GAP, emitFeedback });

    expect(result.newGaps).toEqual([]);
    expect(emitFeedback).not.toHaveBeenCalled();
  });

  it('one new gap alongside one already-known gap files exactly one row, for the new one only', async () => {
    const supabase = mockSupabase({
      baselineRow: { metadata: { recent_files: ['20260817_set_venture_pbn_verdict_stage_zero.sql'] }, created_at: '2026-08-18T00:00:00Z' },
    });
    const emitFeedback = vi.fn(async () => ({ id: 'fb-2', deduped: false }));
    const result = await notifyNewGaps({ supabase, runVerifier: () => STATE_TWO_GAPS, emitFeedback });

    expect(result.newGaps).toEqual(['20260818_new_gap_example.sql']);
    expect(emitFeedback).toHaveBeenCalledTimes(1);
    expect(emitFeedback.mock.calls[0][0].dedup_key).toBe('20260818_new_gap_example.sql');
  });

  it('the feedback description names the specific missing declared object, not only the filename', async () => {
    const supabase = mockSupabase({ baselineRow: null });
    const emitFeedback = vi.fn(async () => ({ id: 'fb-1', deduped: false }));
    await notifyNewGaps({ supabase, runVerifier: () => STATE_ONE_GAP, emitFeedback });

    expect(emitFeedback.mock.calls[0][0].description).toMatch(/set_venture_pbn_verdict_stage_zero/);
  });

  it('zero RECENT gaps → no feedback filed, baseline still updated to empty', async () => {
    const supabase = mockSupabase({ baselineRow: { metadata: { recent_files: ['stale.sql'] }, created_at: '2026-08-17T00:00:00Z' } });
    const emitFeedback = vi.fn();
    const result = await notifyNewGaps({ supabase, runVerifier: () => ({ recentGaps: [] }), emitFeedback });

    expect(result.newGaps).toEqual([]);
    expect(emitFeedback).not.toHaveBeenCalled();
    expect(result.currentRecentFiles).toEqual([]);
  });
});
