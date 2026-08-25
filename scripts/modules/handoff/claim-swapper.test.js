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

// SD-LEO-INFRA-CLAIM-SURFACE-SYNC-001 (FR-3): swapClaim() now delegates to the
// switch_sd_claim RPC (FR-1) instead of a raw claude_sessions UPDATE, so its
// mock mirrors makeReleaseSupabase()'s rpc-mock shape below rather than the old
// .update().eq().eq().select() chain.
function makeSwapSupabase({ rpcResult = { success: true }, rpcError = null } = {}) {
  const rpc = vi.fn().mockResolvedValue({ data: rpcResult, error: rpcError });
  return { rpc, _spies: { rpc } };
}

beforeEach(() => {
  clearWorktreeStateMock.mockClear();
});

describe('swapClaim — FR-1/FR-2 wiring (SD-LEO-INFRA-CLAIM-SURFACE-SYNC-001)', () => {
  it('delegates to the switch_sd_claim RPC with the correct params', async () => {
    const supabase = makeSwapSupabase();
    await swapClaim(supabase, { sessionId: 'S1', oldSdKey: 'SD-OLD', newSdKey: 'SD-NEW' });

    expect(supabase._spies.rpc).toHaveBeenCalledTimes(1);
    expect(supabase._spies.rpc).toHaveBeenCalledWith('switch_sd_claim', {
      p_session_id: 'S1',
      p_old_sd_id: 'SD-OLD',
      p_new_sd_id: 'SD-NEW',
      p_new_track: null
    });
  });

  it('passes p_old_sd_id: null for a fresh claim (no prior SD) -- QF-20260824-154 second facet, unit half', async () => {
    const supabase = makeSwapSupabase();
    await swapClaim(supabase, { sessionId: 'S1', oldSdKey: null, newSdKey: 'SD-NEW' });

    expect(supabase._spies.rpc).toHaveBeenCalledWith('switch_sd_claim', expect.objectContaining({
      p_old_sd_id: null,
      p_new_sd_id: 'SD-NEW'
    }));
  });

  it('invokes clearWorktreeState when oldSdKey is provided (claim-switch path)', async () => {
    const supabase = makeSwapSupabase();
    await swapClaim(supabase, { sessionId: 'S1', oldSdKey: 'SD-OLD', newSdKey: 'SD-NEW' });

    expect(clearWorktreeStateMock).toHaveBeenCalledTimes(1);
    expect(clearWorktreeStateMock).toHaveBeenCalledWith('S1', expect.objectContaining({
      supabase,
      reason: 'claim_swap'
    }));
  });

  it('does NOT invoke clearWorktreeState on a fresh claim (oldSdKey null)', async () => {
    const supabase = makeSwapSupabase();
    await swapClaim(supabase, { sessionId: 'S1', oldSdKey: null, newSdKey: 'SD-NEW' });

    expect(clearWorktreeStateMock).not.toHaveBeenCalled();
  });

  it('does NOT invoke clearWorktreeState when the RPC reports success:false', async () => {
    const supabase = makeSwapSupabase({ rpcResult: { success: false, error: 'claim_conflict' } });
    const result = await swapClaim(supabase, { sessionId: 'S1', oldSdKey: 'SD-OLD', newSdKey: 'SD-NEW' });

    expect(result.success).toBe(false);
    expect(clearWorktreeStateMock).not.toHaveBeenCalled();
  });

  it('does NOT invoke clearWorktreeState when the RPC returns a DB error', async () => {
    const supabase = makeSwapSupabase({ rpcError: { message: 'permission denied' } });
    const result = await swapClaim(supabase, { sessionId: 'S1', oldSdKey: 'SD-OLD', newSdKey: 'SD-NEW' });

    expect(result.success).toBe(false);
    expect(clearWorktreeStateMock).not.toHaveBeenCalled();
  });

  it('surfaces the RPC failure message (not the terse error code) as reason', async () => {
    const supabase = makeSwapSupabase({
      rpcResult: { success: false, error: 'sd_not_found', message: '[SWITCH_SD_NOT_FOUND] SD SD-NEW does not exist.' }
    });
    const result = await swapClaim(supabase, { sessionId: 'S1', oldSdKey: 'SD-OLD', newSdKey: 'SD-NEW' });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('[SWITCH_SD_NOT_FOUND] SD SD-NEW does not exist.');
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
