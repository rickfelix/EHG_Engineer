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

function makeReleaseSupabase({ noSession = false, heldSdKey = 'SD-OLD', selectError = null, rpcError = null, rpcResult = { success: true } } = {}) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: noSession ? null : { sd_key: heldSdKey },
    error: selectError
  });
  const eqSession = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq: eqSession });
  const from = vi.fn().mockReturnValue({ select });
  const rpc = vi.fn().mockResolvedValue({ data: rpcResult, error: rpcError });
  return { from, rpc, _spies: { from, select, eqSession, maybeSingle, rpc } };
}

describe('releaseClaim — atomic release_sd RPC', () => {
  it('invokes release_sd RPC with session_id + reason after pre-check passes', async () => {
    const supabase = makeReleaseSupabase({ heldSdKey: 'SD-OLD' });
    const result = await releaseClaim(supabase, 'S1', 'SD-OLD');

    expect(result.success).toBe(true);
    expect(supabase._spies.rpc).toHaveBeenCalledTimes(1);
    expect(supabase._spies.rpc).toHaveBeenCalledWith('release_sd', {
      p_session_id: 'S1',
      p_reason: 'release_claim'
    });
  });

  it('does NOT invoke clearWorktreeState directly (RPC handles worktree clear server-side)', async () => {
    const supabase = makeReleaseSupabase({ heldSdKey: 'SD-OLD' });
    await releaseClaim(supabase, 'S1', 'SD-OLD');

    expect(clearWorktreeStateMock).not.toHaveBeenCalled();
  });

  it('returns failure when session row not found, without invoking RPC', async () => {
    const supabase = makeReleaseSupabase({ noSession: true });
    const result = await releaseClaim(supabase, 'S1', 'SD-OLD');

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/not found/);
    expect(supabase._spies.rpc).not.toHaveBeenCalled();
  });

  it('returns failure when session holds a different sdKey, without invoking RPC', async () => {
    const supabase = makeReleaseSupabase({ heldSdKey: 'SD-OTHER' });
    const result = await releaseClaim(supabase, 'S1', 'SD-OLD');

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/does not hold claim/);
    expect(supabase._spies.rpc).not.toHaveBeenCalled();
  });

  it('returns failure when pre-check SELECT errors, without invoking RPC', async () => {
    const supabase = makeReleaseSupabase({ selectError: { message: 'connection lost' } });
    const result = await releaseClaim(supabase, 'S1', 'SD-OLD');

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/connection lost/);
    expect(supabase._spies.rpc).not.toHaveBeenCalled();
  });

  it('returns failure when release_sd RPC returns a DB error', async () => {
    const supabase = makeReleaseSupabase({ heldSdKey: 'SD-OLD', rpcError: { message: 'permission denied' } });
    const result = await releaseClaim(supabase, 'S1', 'SD-OLD');

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/permission denied/);
  });

  it('returns failure when release_sd RPC reports success=false in payload', async () => {
    const supabase = makeReleaseSupabase({ heldSdKey: 'SD-OLD', rpcResult: { success: false, error: 'session_not_found' } });
    const result = await releaseClaim(supabase, 'S1', 'SD-OLD');

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/session_not_found/);
  });
});
