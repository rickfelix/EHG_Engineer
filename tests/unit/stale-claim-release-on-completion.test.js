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
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';

const { resolveOwnSession } = vi.hoisted(() => ({ resolveOwnSession: vi.fn() }));
vi.mock('../../lib/resolve-own-session.js', () => ({ resolveOwnSession }));
vi.mock('../../lib/heartbeat-manager.mjs', () => ({
  isHeartbeatActive: () => ({ active: false, sessionId: null }),
  stopHeartbeat: vi.fn(),
}));
vi.mock('../../lib/session-manager.mjs', () => ({ getOrCreateSession: vi.fn().mockResolvedValue(null) }));

import { releaseSessionClaim } from '../../scripts/modules/handoff/executors/lead-final-approval/helpers.js';

const okRpc = () => vi.fn().mockResolvedValue({ error: null });

beforeEach(() => { resolveOwnSession.mockReset(); });

describe('releaseSessionClaim (SD-FDBK-FIX-STALE-CLAIM-AFTER-001)', () => {
  test('releases via release_sd with p_reason when the session holds the completed SD (by sd_key)', async () => {
    resolveOwnSession.mockResolvedValue({ data: { session_id: 'sess-1', sd_key: 'SD-X-001', status: 'active' }, source: 'terminal_id' });
    const sb = { rpc: okRpc() };
    await releaseSessionClaim({ sd_key: 'SD-X-001' }, sb);
    expect(sb.rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = sb.rpc.mock.calls[0];
    expect(fn).toBe('release_sd');
    expect(args).toEqual({ p_session_id: 'sess-1', p_reason: 'completed' });
    expect(args.p_release_reason).toBeUndefined(); // the old, broken arg name must be gone
  });

  test('guard scopes by sd_key: does NOT release when the session holds a different SD', async () => {
    resolveOwnSession.mockResolvedValue({ data: { session_id: 'sess-2', sd_key: 'SD-OTHER-001', status: 'active' }, source: 'terminal_id' });
    const sb = { rpc: okRpc() };
    await releaseSessionClaim({ sd_key: 'SD-X-001' }, sb);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  test('resolves the session selecting sd_key, never the non-existent sd_id', async () => {
    resolveOwnSession.mockResolvedValue({ data: { session_id: 's', sd_key: 'SD-X-001', status: 'active' }, source: 'terminal_id' });
    await releaseSessionClaim({ sd_key: 'SD-X-001' }, { rpc: okRpc() });
    const opts = resolveOwnSession.mock.calls[0][1];
    expect(opts.select).toContain('sd_key');
    expect(opts.select).not.toContain('sd_id');
  });

  test('falls back to sd.id as the claim id when sd_key is absent', async () => {
    resolveOwnSession.mockResolvedValue({ data: { session_id: 's3', sd_key: 'UUID-123', status: 'active' }, source: 'terminal_id' });
    const sb = { rpc: okRpc() };
    await releaseSessionClaim({ id: 'UUID-123' }, sb); // no sd_key on the SD record
    expect(sb.rpc).toHaveBeenCalledTimes(1);
    expect(sb.rpc.mock.calls[0][1]).toEqual({ p_session_id: 's3', p_reason: 'completed' });
  });

  test('fail-open: a release error never throws (completion must not be blocked)', async () => {
    resolveOwnSession.mockResolvedValue({ data: { session_id: 's', sd_key: 'SD-X-001', status: 'active' }, source: 'terminal_id' });
    const sb = { rpc: vi.fn().mockResolvedValue({ error: { message: 'boom' } }) };
    await expect(releaseSessionClaim({ sd_key: 'SD-X-001' }, sb)).resolves.toBeUndefined();
  });
});
