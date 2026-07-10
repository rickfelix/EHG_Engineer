/**
 * SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-C FR-3 — graduated-autonomy ladder.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/chairman/record-pending-decision.mjs', () => ({
  recordPendingDecision: vi.fn().mockResolvedValue({ recorded: true, id: 'decision-1' }),
}));

import { recordPendingDecision } from '../../../lib/chairman/record-pending-decision.mjs';
import { evaluateGraduation, recordPublishOutcome, checkPublishAuthorization } from '../../../lib/marketing/autonomy-gate.js';

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

describe('checkPublishAuthorization — dedup + FR-7 chairman_decisions routing', () => {
  function makeAuthSupabase({ autonomyState = null, autonomyError = null, acceptedRow = null, acceptedError = null, existingPending = null, existingPendingError = null, insertData = { id: 'ledger-new' }, insertError = null }) {
    let ledgerMaybeSingleCallCount = 0;
    const autonomyChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(() => Promise.resolve({ data: autonomyState ? { autonomy_state: autonomyState } : null, error: autonomyError })),
    };
    const ledgerChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn(() => Promise.resolve({ data: insertError ? null : insertData, error: insertError })),
      maybeSingle: vi.fn(() => {
        ledgerMaybeSingleCallCount += 1;
        // 1st maybeSingle call = "accepted?" check; 2nd = "already pending?" dedup check.
        if (ledgerMaybeSingleCallCount === 1) return Promise.resolve({ data: acceptedRow, error: acceptedError });
        return Promise.resolve({ data: existingPending, error: existingPendingError });
      }),
    };
    return { from: vi.fn((table) => (table === 'venture_channel_autonomy' ? autonomyChain : ledgerChain)), ledgerChain };
  }

  beforeEach(() => vi.clearAllMocks());

  it('allows immediately when the channel is autonomous, without touching the ledger', async () => {
    const supabase = makeAuthSupabase({ autonomyState: 'autonomous' });
    const result = await checkPublishAuthorization({ supabase, ventureId: 'v-1', channelType: 'x', contentId: 'c-1' });
    expect(result.allowed).toBe(true);
    expect(recordPendingDecision).not.toHaveBeenCalled();
  });

  it('allows when an accepted ledger entry exists for this exact content', async () => {
    const supabase = makeAuthSupabase({ autonomyState: 'propose_and_approve', acceptedRow: { id: 'ledger-1' } });
    const result = await checkPublishAuthorization({ supabase, ventureId: 'v-1', channelType: 'x', contentId: 'c-1' });
    expect(result.allowed).toBe(true);
    expect(recordPendingDecision).not.toHaveBeenCalled();
  });

  it('on first proposal, inserts a pending ledger row AND notifies chairman_decisions (FR-7)', async () => {
    const supabase = makeAuthSupabase({ autonomyState: 'propose_and_approve', acceptedRow: null, existingPending: null });
    const result = await checkPublishAuthorization({ supabase, ventureId: 'v-1', channelType: 'x', contentId: 'c-1', correlationId: 'corr-1' });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('AUTONOMY_APPROVAL_REQUIRED');
    expect(supabase.ledgerChain.insert).toHaveBeenCalledWith(expect.objectContaining({ correlation_id: 'corr-1', decision: 'pending' }));
    expect(recordPendingDecision).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ decisionType: 'outbound_publish_approval', ventureId: 'v-1' })
    );
  });

  it('on a RETRY of the same unapproved attempt, does not insert a duplicate row or re-notify (dedup)', async () => {
    const supabase = makeAuthSupabase({ autonomyState: 'propose_and_approve', acceptedRow: null, existingPending: { id: 'ledger-already-pending' } });
    const result = await checkPublishAuthorization({ supabase, ventureId: 'v-1', channelType: 'x', contentId: 'c-1', correlationId: 'corr-1' });

    expect(result.allowed).toBe(false);
    expect(supabase.ledgerChain.insert).not.toHaveBeenCalled();
    expect(recordPendingDecision).not.toHaveBeenCalled();
  });

  it('fails closed when the autonomy-state lookup errors', async () => {
    const supabase = makeAuthSupabase({ autonomyError: { message: 'connection reset' } });
    const result = await checkPublishAuthorization({ supabase, ventureId: 'v-1', channelType: 'x', contentId: 'c-1' });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('fail-closed');
  });
});
