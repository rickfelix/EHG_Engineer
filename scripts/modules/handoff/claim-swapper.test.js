/**
 * Tests for claim-swapper Phase 2 wiring (SD-LEO-INFRA-LEO-INFRA-SESSION-001 FR-2).
 *
 * Verifies that releaseClaim and swapClaim now invoke clearWorktreeState
 * after their sd_key UPDATE succeeds, and that the worktree columns are
 * NEVER touched directly in the sd_key UPDATE itself.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mock so we can assert calls into clearWorktreeState
const clearWorktreeStateMock = vi.fn().mockResolvedValue({ success: true, reason: 'mock' });

vi.mock('../../../lib/lifecycle/worktree-state-writer.mjs', () => ({
  clearWorktreeState: clearWorktreeStateMock,
  writeWorktreeState: vi.fn().mockResolvedValue({ success: true })
}));

const { swapClaim, releaseClaim } = await import('./claim-swapper.js');

function makeSupabase(returnData = [{ session_id: 'S1', sd_key: 'SD-NEW' }], error = null) {
  const select = vi.fn().mockResolvedValue({ data: returnData, error });
  // Build a chain that supports both .eq().select() (release) and .eq().eq().select() (swap with oldSdKey)
  const eqSecond = vi.fn().mockReturnValue({ select, eq: vi.fn() });
  const eqFirst = vi.fn().mockReturnValue({ select, eq: eqSecond });
  const update = vi.fn().mockReturnValue({ eq: eqFirst });
  const from = vi.fn().mockReturnValue({ update });
  return { from, _spies: { from, update, eqFirst, eqSecond, select } };
}

beforeEach(() => {
  clearWorktreeStateMock.mockClear();
});

describe('swapClaim — FR-2 wiring', () => {
  it('UPDATE payload does NOT contain worktree_path or worktree_branch', async () => {
    const supabase = makeSupabase([{ session_id: 'S1', sd_key: 'SD-NEW' }]);
    await swapClaim(supabase, { sessionId: 'S1', oldSdKey: 'SD-OLD', newSdKey: 'SD-NEW' });

    const updateArg = supabase._spies.update.mock.calls[0][0];
    expect(updateArg).not.toHaveProperty('worktree_path');
    expect(updateArg).not.toHaveProperty('worktree_branch');
  });

  it('invokes clearWorktreeState when oldSdKey is provided (claim-switch path)', async () => {
    const supabase = makeSupabase([{ session_id: 'S1', sd_key: 'SD-NEW' }]);
    await swapClaim(supabase, { sessionId: 'S1', oldSdKey: 'SD-OLD', newSdKey: 'SD-NEW' });

    expect(clearWorktreeStateMock).toHaveBeenCalledTimes(1);
    expect(clearWorktreeStateMock).toHaveBeenCalledWith('S1', expect.objectContaining({
      supabase,
      reason: 'claim_swap'
    }));
  });

  it('does NOT invoke clearWorktreeState on a fresh claim (oldSdKey null)', async () => {
    const supabase = makeSupabase([{ session_id: 'S1', sd_key: 'SD-NEW' }]);
    await swapClaim(supabase, { sessionId: 'S1', oldSdKey: null, newSdKey: 'SD-NEW' });

    expect(clearWorktreeStateMock).not.toHaveBeenCalled();
  });

  it('does NOT invoke clearWorktreeState when the swap UPDATE returned 0 rows', async () => {
    const supabase = makeSupabase([]);
    const result = await swapClaim(supabase, { sessionId: 'S1', oldSdKey: 'SD-OLD', newSdKey: 'SD-NEW' });

    expect(result.success).toBe(false);
    expect(clearWorktreeStateMock).not.toHaveBeenCalled();
  });

  it('does NOT invoke clearWorktreeState when the swap UPDATE returned a DB error', async () => {
    const supabase = makeSupabase(null, { message: 'permission denied' });
    const result = await swapClaim(supabase, { sessionId: 'S1', oldSdKey: 'SD-OLD', newSdKey: 'SD-NEW' });

    expect(result.success).toBe(false);
    expect(clearWorktreeStateMock).not.toHaveBeenCalled();
  });
});

describe('releaseClaim — FR-2 wiring', () => {
  it('UPDATE payload does NOT contain worktree_path or worktree_branch', async () => {
    const supabase = makeSupabase([{ session_id: 'S1' }]);
    await releaseClaim(supabase, 'S1', 'SD-OLD');

    const updateArg = supabase._spies.update.mock.calls[0][0];
    expect(updateArg).not.toHaveProperty('worktree_path');
    expect(updateArg).not.toHaveProperty('worktree_branch');
  });

  it('invokes clearWorktreeState after a successful release', async () => {
    const supabase = makeSupabase([{ session_id: 'S1' }]);
    await releaseClaim(supabase, 'S1', 'SD-OLD');

    expect(clearWorktreeStateMock).toHaveBeenCalledTimes(1);
    expect(clearWorktreeStateMock).toHaveBeenCalledWith('S1', expect.objectContaining({
      supabase,
      reason: 'release_claim'
    }));
  });

  it('does NOT invoke clearWorktreeState when no row matched (session does not hold claim)', async () => {
    const supabase = makeSupabase([]);
    const result = await releaseClaim(supabase, 'S1', 'SD-OLD');

    expect(result.success).toBe(false);
    expect(clearWorktreeStateMock).not.toHaveBeenCalled();
  });

  it('does NOT invoke clearWorktreeState when the release UPDATE returned a DB error', async () => {
    const supabase = makeSupabase(null, { message: 'connection lost' });
    const result = await releaseClaim(supabase, 'S1', 'SD-OLD');

    expect(result.success).toBe(false);
    expect(clearWorktreeStateMock).not.toHaveBeenCalled();
  });
});
