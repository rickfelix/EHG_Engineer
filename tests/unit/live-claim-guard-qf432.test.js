/**
 * QF-20260710-432: live-claim removal guard — the Alpha-2 incident regression
 * (4th recurrence of the reaper-ate-live-worktree class; see also
 * SD-FDBK-FIX-WORKTREE-REAPER-LIVE-001 pins in worktree-reaper-live-claim-guard.test.js).
 *
 * Incident fixture: an SD claimed by a LIVE session with ZERO commits, mid-PLAN.
 * The guard must refuse removal regardless of commit count, and must fail CLOSED
 * on anything it cannot verify.
 */

import { describe, test, expect, vi } from 'vitest';
import {
  keyFromWorktreePath,
  liveClaimBlocksRemoval,
} from '../../lib/worktree-reaper/live-claim-guard.js';

const aliveFn = () => ({ alive: true });
const deadFn = () => ({ alive: false });

function mockSupabase({ claimant = null, session = undefined, pointingSession = null, claimError = null, sessionError = null } = {}) {
  return {
    from: vi.fn((table) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn(function (col) {
        if (table === 'v_active_sessions' && col === 'session_id') {
          return { maybeSingle: vi.fn().mockResolvedValue({ data: session === undefined ? { session_id: claimant } : session, error: sessionError }) };
        }
        if (table === 'v_active_sessions') {
          return { limit: vi.fn().mockResolvedValue({ data: pointingSession ? [pointingSession] : [], error: null }) };
        }
        return { maybeSingle: vi.fn().mockResolvedValue({ data: claimError ? null : { claiming_session_id: claimant }, error: claimError }) };
      }),
    })),
  };
}

describe('keyFromWorktreePath', () => {
  test('derives SD and QF keys from the worktree conventions', () => {
    expect(keyFromWorktreePath('C:/repo/.worktrees/SD-EHG-FOO-001')).toEqual({ kind: 'sd', key: 'SD-EHG-FOO-001' });
    expect(keyFromWorktreePath('C:/repo/.worktrees/qf/QF-20260710-999')).toEqual({ kind: 'qf', key: 'QF-20260710-999' });
    expect(keyFromWorktreePath('C:/repo/.worktrees/qf-20260710-432')).toEqual({ kind: 'qf', key: 'QF-20260710-432' });
    expect(keyFromWorktreePath('C:/repo/.worktrees/_archive')).toBeNull();
  });
});

describe('liveClaimBlocksRemoval — the Alpha-2 regression fixture', () => {
  const WT = 'C:/repo/.worktrees/SD-LEO-INFRA-MIDPLAN-001';

  test('INCIDENT SHAPE: claimed SD + live claimant + zero commits => BLOCKED (commit count is irrelevant)', async () => {
    const supabase = mockSupabase({ claimant: 'sess-alpha2' });
    const r = await liveClaimBlocksRemoval(supabase, WT, { isSessionAliveFn: aliveFn });
    expect(r.blocked).toBe(true);
    expect(r.reason).toBe('live_claimed');
    expect(r.detail.claimant).toBe('sess-alpha2');
  });

  test('claimed but claimant not verifiably alive => STILL blocked (the reaper never destroys a claimed worktree)', async () => {
    const supabase = mockSupabase({ claimant: 'sess-gone' });
    const r = await liveClaimBlocksRemoval(supabase, WT, { isSessionAliveFn: deadFn });
    expect(r.blocked).toBe(true);
    expect(r.reason).toBe('claimed_claimant_not_verifiably_alive');
  });

  test('unclaimed + no live session pointing => not blocked', async () => {
    const supabase = mockSupabase({ claimant: null });
    const r = await liveClaimBlocksRemoval(supabase, WT, { isSessionAliveFn: aliveFn });
    expect(r.blocked).toBe(false);
    expect(r.reason).toBe('no_live_claim');
  });

  test('half-write case: claim column null but a LIVE session points at the key => blocked', async () => {
    const supabase = mockSupabase({ claimant: null, pointingSession: { session_id: 'sess-half' } });
    const r = await liveClaimBlocksRemoval(supabase, WT, { isSessionAliveFn: aliveFn });
    expect(r.blocked).toBe(true);
    expect(r.reason).toBe('live_session_pointing');
  });

  test('FAIL-CLOSED: claim lookup error / missing supabase / guard exception => blocked', async () => {
    const errSupabase = mockSupabase({ claimError: { message: 'connection refused' } });
    expect((await liveClaimBlocksRemoval(errSupabase, WT, { isSessionAliveFn: aliveFn })).blocked).toBe(true);

    expect((await liveClaimBlocksRemoval(null, WT)).blocked).toBe(true);

    const throwing = { from: () => { throw new Error('boom'); } };
    const r = await liveClaimBlocksRemoval(throwing, WT, { isSessionAliveFn: aliveFn });
    expect(r.blocked).toBe(true);
    expect(r.reason).toBe('unverifiable_guard_exception');
  });

  // SD-FDBK-INFRA-ORPHAN-WORKTREE-STRANDING-001 (FR-1) REVERSES this case. The old test
  // was named "non-work directories are not the guard's business" and pinned
  // {blocked:false, reason:'no_work_key_in_path'}. That doctrine deleted two in-use
  // ceremony trees on 2026-07-31. A directory the guard cannot resolve is now precisely
  // the guard's business, because it is the case it cannot verify.
  test('an unresolvable directory name fails CLOSED — cannot verify is not "no claim"', async () => {
    const r = await liveClaimBlocksRemoval(null, 'C:/repo/.worktrees/_archive');
    expect(r.blocked).toBe(true);
    expect(r.reason).toBe('work_key_unresolvable');
    expect(r.detail).toEqual({ worktree_path: 'C:/repo/.worktrees/_archive' });
  });

  // The two REAL basenames from the 2026-07-31 incident, verbatim. Regression pins.
  test.each([
    '.worktrees/scribe-privesc-20260731',
    '.worktrees/changelog-privesc',
  ])('incident basename %s is refused, not reaped', async (rel) => {
    const r = await liveClaimBlocksRemoval(null, `C:/repo/${rel}`);
    expect(r.blocked).toBe(true);
    expect(r.reason).toBe('work_key_unresolvable');
  });

  // OPPOSITE POLARITY — the control. Without this, a change that simply blocked
  // everything would pass every assertion above while breaking the reaper entirely.
  // A resolvable key with no claimant must still clear, via the VERIFIED path.
  test('a resolvable key with no claimant still clears (fail-closed is not block-everything)', async () => {
    const supabase = mockSupabase({ claimant: null, pointingSession: null });
    const r = await liveClaimBlocksRemoval(supabase, 'C:/repo/.worktrees/SD-SOME-THING-001', { isSessionAliveFn: deadFn });
    expect(r.blocked).toBe(false);
    expect(r.reason).toBe('no_live_claim');
  });
});
