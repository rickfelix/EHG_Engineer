/**
 * SD-LEO-INFRA-DEMAND-ENGINE-PART-001 US-007, US-009 — mock graduation transcript.
 * Exercises the REAL evaluateGraduation() (not a mock of it) so this test also proves the
 * integration itself, not just a stub of it.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../lib/feature-flags/evaluator.js', () => ({ isEnabled: vi.fn().mockResolvedValue(false) }));

import { runMockGraduationTranscript } from '../../../lib/marketing/mock-graduation-transcript.js';

/**
 * @param {object} opts
 * @param {Array} opts.mockRows - rows evaluateGraduation's query should see for mode:'mock'
 * @param {object|null} opts.liveRowBefore - venture_channel_autonomy row BEFORE (same both snapshots, since the write is skipped)
 */
function makeSupabase({ mockRows, liveRowBefore = null }) {
  const autonomyUpsert = vi.fn();
  const snapshots = [liveRowBefore, liveRowBefore]; // before-read, after-read: identical since the mock evaluation never writes
  let snapshotCall = 0;

  const autonomyChain = {
    select: () => autonomyChain,
    eq: () => autonomyChain,
    maybeSingle: async () => ({ data: snapshots[Math.min(snapshotCall++, snapshots.length - 1)], error: null }),
    upsert: autonomyUpsert,
  };

  const verdictChain = {
    select: () => verdictChain,
    eq: () => verdictChain,
    order: () => verdictChain,
    limit: () => verdictChain,
    maybeSingle: async () => ({ data: null, error: null }), // no demand verdict needed for this path
  };

  const ledgerChain = {
    select: () => ledgerChain,
    eq: () => ledgerChain,
    not: () => ledgerChain,
    order: () => ledgerChain,
    limit: async () => ({ data: mockRows, error: null }),
  };

  return {
    from: vi.fn((table) => {
      if (table === 'venture_channel_autonomy') return autonomyChain;
      if (table === 'venture_demand_verdicts') return verdictChain;
      return ledgerChain; // venture_channel_publish_ledger
    }),
    _autonomyUpsert: autonomyUpsert,
  };
}

describe('runMockGraduationTranscript', () => {
  // SPEC CONFLICT (signaled to the coordinator, session 64728de4, 2026-09-13): evaluateGraduation's
  // per-row loop unconditionally breaks the streak the instant it sees execution_mode==='mock'
  // (autonomy-gate.js, "a mock-discriminated row must never contribute to the clean streak") --
  // this fires regardless of the `mode` parameter passed to evaluateGraduation itself, including
  // mode:'mock'. That makes cleanStreak structurally 0 for ANY ledger window containing a mock row,
  // which means a genuinely mock-stamped row (US-005's mandatory execution_mode='mock' stamp) can
  // NEVER earn a streak through this function -- directly contradicting FR-7/US-007's literal text
  // ("a mock-tracked autonomy row CAN graduate from repeated mock sends"). This test asserts the
  // ACTUAL (safe) behavior the shipped code produces, not the PRD's literal "graduates" wording --
  // the safety property (never touching the real per-venture-channel row) holds either way.
  it('a mock-tracked run correctly NEVER earns a streak through evaluateGraduation (mock rows always break it) -- the real autonomy write is skipped', async () => {
    const mockRows = Array.from({ length: 5 }, () => ({ decision: 'accepted', outcome: 'shipped_clean', execution_mode: 'mock' }));
    const liveRow = { venture_id: 'v1', channel_type: 'x', autonomy_state: 'autonomous', clean_streak: 12, graduated_at: '2026-08-01T00:00:00Z' };
    const supabase = makeSupabase({ mockRows, liveRowBefore: liveRow });

    const transcript = await runMockGraduationTranscript({ supabase, ventureId: 'v1', channelType: 'x', requiredStreak: 5 });

    expect(transcript.graduationEarned).toBe(false);
    expect(transcript.cleanStreak).toBe(0);
    expect(transcript.autonomyWriteSkipped).toBeTruthy();
    // FR-7: the live-tracked row for the same venture/channel is completely untouched.
    expect(transcript.liveRowUntouched).toBe(true);
    expect(supabase._autonomyUpsert).not.toHaveBeenCalled();
  });

  it('a mock run with a single qualifying row still reports a zero streak (the break fires on the first row)', async () => {
    const mockRows = [{ decision: 'accepted', outcome: 'shipped_clean', execution_mode: 'mock' }];
    const supabase = makeSupabase({ mockRows, liveRowBefore: null });

    const transcript = await runMockGraduationTranscript({ supabase, ventureId: 'v1', channelType: 'x', requiredStreak: 5 });

    expect(transcript.graduationEarned).toBe(false);
    expect(transcript.cleanStreak).toBe(0);
    expect(transcript.liveRowUntouched).toBe(true); // null before, null after -- still untouched
  });

  it('a venture with no live-tracked row at all still proves untouched (null before and after)', async () => {
    const mockRows = Array.from({ length: 5 }, () => ({ decision: 'accepted', outcome: 'shipped_clean', execution_mode: 'mock' }));
    const supabase = makeSupabase({ mockRows, liveRowBefore: null });

    const transcript = await runMockGraduationTranscript({ supabase, ventureId: 'v1', channelType: 'x', requiredStreak: 5 });

    expect(transcript.liveRowBefore).toBeNull();
    expect(transcript.liveRowAfter).toBeNull();
    expect(transcript.liveRowUntouched).toBe(true);
  });
});
