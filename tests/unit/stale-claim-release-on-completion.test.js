/**
 * SD-FDBK-FIX-STALE-CLAIM-AFTER-001 — releaseSessionClaim actually releases on completion.
 *
 * LEAD-FINAL's releaseSessionClaim() was triply broken, so the claim was NEVER released
 * after an SD completed → /checkin then returned action='resume' for the just-completed SD
 * and a worker would loop on completed work:
 *   (1) it selected a non-existent column sd_id (claude_sessions's claim column is sd_key),
 *       so the resolve query errored and the session resolved null;
 *   (2) it guarded on `session.sd_id === claimId` which was always false (no sd_id field);
 *   (3) it called release_sd with `p_release_reason`, but the live RPC signature is
 *       release_sd(p_session_id, p_reason) — p_release_reason returns PGRST202.
 * These tests pin the corrected behavior.
 *
 * SD-LEO-INFRA-CLAIM-SURFACE-SYNC-002 (FR-1) — releaseSessionClaim now routes through
 * bestEffortReleaseSd(expectedSdKey) instead of an inline `session.sd_key===claimId` guard
 * + raw rpc('release_sd', ...) call. That inline guard read resolveOwnSession's (possibly
 * stale) session object; bestEffortReleaseSd re-reads claude_sessions LIVE via `.from(...)`
 * immediately before the RPC, so every supabase double below needs a `.from` chain, not just
 * `.rpc` — a double with only `.rpc` now hits the fail-closed 'scope_unverifiable' branch
 * instead of exercising the RPC at all.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';

const { resolveOwnSession } = vi.hoisted(() => ({ resolveOwnSession: vi.fn() }));
const { isHeartbeatActive, stopHeartbeat } = vi.hoisted(() => ({
  isHeartbeatActive: vi.fn(() => ({ active: false, sessionId: null })),
  stopHeartbeat: vi.fn(),
}));
vi.mock('../../lib/resolve-own-session.js', () => ({ resolveOwnSession }));
vi.mock('../../lib/heartbeat-manager.mjs', () => ({ isHeartbeatActive, stopHeartbeat }));
vi.mock('../../lib/session-manager.mjs', () => ({ getOrCreateSession: vi.fn().mockResolvedValue(null) }));

import { releaseSessionClaim } from '../../scripts/modules/handoff/executors/lead-final-approval/helpers.js';

/** Minimal supabase double: a claude_sessions row (for bestEffortReleaseSd's live re-read) + a spyable release_sd rpc. */
function makeSupabase(heldSdKey, { rpcError = null } = {}) {
  const rpc = vi.fn(async () => (rpcError ? { data: null, error: { message: rpcError } } : { data: { success: true }, error: null }));
  return {
    rpc,
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: heldSdKey === null ? null : { sd_key: heldSdKey }, error: null })
        })
      })
    })
  };
}

beforeEach(() => {
  resolveOwnSession.mockReset();
  isHeartbeatActive.mockReset();
  isHeartbeatActive.mockReturnValue({ active: false, sessionId: null });
  stopHeartbeat.mockReset();
});

describe('releaseSessionClaim (SD-FDBK-FIX-STALE-CLAIM-AFTER-001, hardened by SD-LEO-INFRA-CLAIM-SURFACE-SYNC-002 FR-1)', () => {
  test('releases via release_sd with p_reason when the session genuinely holds the completed SD (by sd_key)', async () => {
    resolveOwnSession.mockResolvedValue({ data: { session_id: 'sess-1', sd_key: 'SD-X-001', status: 'active' }, source: 'terminal_id' });
    const sb = makeSupabase('SD-X-001');
    await releaseSessionClaim({ sd_key: 'SD-X-001' }, sb);
    expect(sb.rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = sb.rpc.mock.calls[0];
    expect(fn).toBe('release_sd');
    expect(args).toEqual({ p_session_id: 'sess-1', p_reason: 'completed' });
    expect(args.p_release_reason).toBeUndefined(); // the old, broken arg name must be gone
  });

  test('QF-20260726-593 guard: does NOT release when claude_sessions live-holds a DIFFERENT SD than the one completing', async () => {
    // resolveOwnSession's returned object agrees with claimId (as it would on a stale read),
    // but the LIVE re-read inside bestEffortReleaseSd disagrees — this is exactly the incident
    // shape (RCA a7d374f4b77ae2a1b): a stale local `session` object defeats an inline guard.
    resolveOwnSession.mockResolvedValue({ data: { session_id: 'sess-2', sd_key: 'SD-X-001', status: 'active' }, source: 'terminal_id' });
    const sb = makeSupabase('SD-OTHER-001');
    await releaseSessionClaim({ sd_key: 'SD-X-001' }, sb);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  test('resolves the session selecting sd_key, never the non-existent sd_id', async () => {
    resolveOwnSession.mockResolvedValue({ data: { session_id: 's', sd_key: 'SD-X-001', status: 'active' }, source: 'terminal_id' });
    await releaseSessionClaim({ sd_key: 'SD-X-001' }, makeSupabase('SD-X-001'));
    const opts = resolveOwnSession.mock.calls[0][1];
    expect(opts.select).toContain('sd_key');
    expect(opts.select).not.toContain('sd_id');
  });

  test('falls back to sd.id as the claim id when sd_key is absent', async () => {
    resolveOwnSession.mockResolvedValue({ data: { session_id: 's3', sd_key: 'UUID-123', status: 'active' }, source: 'terminal_id' });
    const sb = makeSupabase('UUID-123');
    await releaseSessionClaim({ id: 'UUID-123' }, sb); // no sd_key on the SD record
    expect(sb.rpc).toHaveBeenCalledTimes(1);
    expect(sb.rpc.mock.calls[0][1]).toEqual({ p_session_id: 's3', p_reason: 'completed' });
  });

  test('fail-open: a release error never throws (completion must not be blocked)', async () => {
    resolveOwnSession.mockResolvedValue({ data: { session_id: 's', sd_key: 'SD-X-001', status: 'active' }, source: 'terminal_id' });
    const sb = makeSupabase('SD-X-001', { rpcError: 'boom' });
    await expect(releaseSessionClaim({ sd_key: 'SD-X-001' }, sb)).resolves.toBeUndefined();
    expect(sb.rpc).toHaveBeenCalledTimes(1); // the error path was genuinely exercised, not skipped
  });

  test('FR-1 AC-3: heartbeat-stop is unconditional — fires even when the release is skipped (sd_mismatch)', async () => {
    resolveOwnSession.mockResolvedValue({ data: { session_id: 'sess-2', sd_key: 'SD-X-001', status: 'active' }, source: 'terminal_id' });
    isHeartbeatActive.mockReturnValue({ active: true, sessionId: 'sess-2' });
    const sb = makeSupabase('SD-OTHER-001'); // live mismatch -> release skipped
    await releaseSessionClaim({ sd_key: 'SD-X-001' }, sb);
    expect(sb.rpc).not.toHaveBeenCalled();
    expect(stopHeartbeat).toHaveBeenCalledTimes(1);
  });

  test('FR-1 AC-4: a scope_unverifiable outcome (transient read error) is logged loudly, not silently swallowed', async () => {
    resolveOwnSession.mockResolvedValue({ data: { session_id: 's', sd_key: 'SD-X-001', status: 'active' }, source: 'terminal_id' });
    const sb = {
      rpc: vi.fn(async () => ({ data: { success: true }, error: null })),
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: { message: 'connection reset' } })
          })
        })
      })
    };
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await releaseSessionClaim({ sd_key: 'SD-X-001' }, sb);
      expect(sb.rpc).not.toHaveBeenCalled();
      expect(logSpy.mock.calls.some((call) => String(call[0]).includes('connection reset'))).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });

  test('FR-1 AC-3: heartbeat-stop is unconditional — fires even when the release RPC errors', async () => {
    resolveOwnSession.mockResolvedValue({ data: { session_id: 's', sd_key: 'SD-X-001', status: 'active' }, source: 'terminal_id' });
    isHeartbeatActive.mockReturnValue({ active: true, sessionId: 's' });
    const sb = makeSupabase('SD-X-001', { rpcError: 'boom' });
    await releaseSessionClaim({ sd_key: 'SD-X-001' }, sb);
    expect(stopHeartbeat).toHaveBeenCalledTimes(1);
  });
});
