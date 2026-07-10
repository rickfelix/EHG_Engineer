/**
 * SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-C FR-3 — graduated-autonomy ladder.
 */
import { describe, it, expect, vi } from 'vitest';
import { evaluateGraduation, recordPublishOutcome } from '../../../lib/marketing/autonomy-gate.js';

function makeSupabase({ recentRows = [], selectError = null, updateError = null, upsertError = null }) {
  const ledgerChain = {
    select: vi.fn(() => ledgerChain),
    eq: vi.fn(() => ledgerChain),
    neq: vi.fn(() => ledgerChain),
    order: vi.fn(() => ledgerChain),
    limit: vi.fn(() => Promise.resolve({ data: recentRows, error: selectError })),
    update: vi.fn(() => ledgerChain),
    maybeSingle: vi.fn(() => Promise.resolve({
      data: updateError ? null : { venture_id: 'v-1', channel_type: 'x' },
      error: updateError
    }))
  };

  const autonomyChain = {
    upsert: vi.fn(() => Promise.resolve({ error: upsertError }))
  };

  return {
    from: vi.fn((table) => (table === 'venture_channel_autonomy' ? autonomyChain : ledgerChain)),
    _autonomyChain: autonomyChain
  };
}

describe('evaluateGraduation', () => {
  it('graduates to autonomous after N consecutive shipped_clean+accepted outcomes', async () => {
    const rows = Array.from({ length: 5 }, () => ({ decision: 'accepted', outcome: 'shipped_clean' }));
    const supabase = makeSupabase({ recentRows: rows });

    const result = await evaluateGraduation({ supabase, ventureId: 'v-1', channelType: 'x', requiredStreak: 5 });

    expect(result.success).toBe(true);
    expect(result.autonomyState).toBe('autonomous');
    expect(supabase._autonomyChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ venture_id: 'v-1', channel_type: 'x', autonomy_state: 'autonomous' }),
      expect.anything()
    );
  });

  it('stays propose_and_approve when the streak is broken by a reverted outcome', async () => {
    const rows = [
      { decision: 'accepted', outcome: 'shipped_clean' },
      { decision: 'accepted', outcome: 'shipped_clean' },
      { decision: 'accepted', outcome: 'reverted' }, // breaks the streak walking newest-first
      { decision: 'accepted', outcome: 'shipped_clean' },
      { decision: 'accepted', outcome: 'shipped_clean' }
    ];
    const supabase = makeSupabase({ recentRows: rows });

    const result = await evaluateGraduation({ supabase, ventureId: 'v-1', channelType: 'x', requiredStreak: 5 });

    expect(result.success).toBe(true);
    expect(result.autonomyState).toBe('propose_and_approve');
    expect(result.cleanStreak).toBe(2);
  });

  it('demotes immediately (clean_streak reset) when the most recent outcome is caused_rework', async () => {
    const rows = [{ decision: 'accepted', outcome: 'caused_rework' }];
    const supabase = makeSupabase({ recentRows: rows });

    const result = await evaluateGraduation({ supabase, ventureId: 'v-1', channelType: 'x', requiredStreak: 5 });

    expect(result.autonomyState).toBe('propose_and_approve');
    expect(result.cleanStreak).toBe(0);
  });

  it('propagates a query error rather than silently graduating', async () => {
    const supabase = makeSupabase({ selectError: { message: 'db down' } });

    const result = await evaluateGraduation({ supabase, ventureId: 'v-1', channelType: 'x' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('db down');
  });
});

describe('recordPublishOutcome', () => {
  it('rejects an invalid outcome value without touching the database', async () => {
    const supabase = makeSupabase({});
    await expect(
      recordPublishOutcome({ supabase, correlationId: 'corr-1', outcome: 'made_up_value' })
    ).rejects.toThrow(/invalid outcome/);
  });

  it('re-evaluates graduation after recording a real outcome', async () => {
    const supabase = makeSupabase({ recentRows: [{ decision: 'accepted', outcome: 'shipped_clean' }] });

    const result = await recordPublishOutcome({ supabase, correlationId: 'corr-1', outcome: 'shipped_clean', outcomeRef: 'https://x.com/i/status/1' });

    expect(result.success).toBe(true);
  });

  it('fails when no ledger entry matches the correlation_id', async () => {
    const supabase = makeSupabase({ updateError: null });
    supabase.from = vi.fn((table) => {
      if (table === 'venture_channel_publish_ledger') {
        return {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null }))
        };
      }
      return { upsert: vi.fn() };
    });

    const result = await recordPublishOutcome({ supabase, correlationId: 'unknown-corr', outcome: 'shipped_clean' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No ledger entry found');
  });
});
