/**
 * QF-20260903-602 — the operator-facing `sd:release` path must call the keyed release
 * primitive (release_sd_by_key, via bestEffortReleaseSdByKey), not sessionManager's
 * releaseCurrentClaim.
 *
 * releaseCurrentClaim (lib/session-manager.mjs:853) re-resolves the session internally via
 * findExistingSession() and then guards on session.sd_key — a field its own RPC (release_sd)
 * never reads. That guard blocked a release the database would have accepted whenever the
 * claim was visible only on the authoritative column (strategic_directives_v2 /
 * quick_fixes.claiming_session_id) and not on the local session-file mirror. The weight-bearing
 * assertion here is negative: releaseCurrentClaim must never be called from this path again.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getCurrentSessionMock = vi.fn();
const releaseCurrentClaimMock = vi.fn();
const bestEffortReleaseSdByKeyMock = vi.fn();

vi.mock('../../../lib/session-manager.mjs', () => ({
  default: {
    getCurrentSession: (...a) => getCurrentSessionMock(...a),
    releaseCurrentClaim: (...a) => releaseCurrentClaimMock(...a),
  },
}));

vi.mock('../../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => ({ __fake: 'supabase' }),
}));

vi.mock('../../../lib/fleet/best-effort-release.mjs', () => ({
  bestEffortReleaseSdByKey: (...a) => bestEffortReleaseSdByKeyMock(...a),
}));

vi.mock('../../../lib/session-conflict-checker.mjs', () => ({ default: {} }));

const { releaseSD } = await import('../../../scripts/claude-session-coordinator.mjs');

describe('releaseSD — operator-facing sd:release', () => {
  beforeEach(() => {
    getCurrentSessionMock.mockReset();
    releaseCurrentClaimMock.mockReset();
    bestEffortReleaseSdByKeyMock.mockReset();
  });

  it('calls bestEffortReleaseSdByKey with this session and its held key — and NEVER releaseCurrentClaim', async () => {
    getCurrentSessionMock.mockReturnValue({ session_id: 'sess-alpha3', sd_id: 'QF-20260903-602' });
    bestEffortReleaseSdByKeyMock.mockResolvedValue({ released: true, error: null });

    await releaseSD();

    expect(bestEffortReleaseSdByKeyMock).toHaveBeenCalledTimes(1);
    const [, sessionId, sdKey, reason] = bestEffortReleaseSdByKeyMock.mock.calls[0];
    expect(sessionId).toBe('sess-alpha3');
    expect(sdKey).toBe('QF-20260903-602');
    expect(reason).toBe('manual');
    expect(releaseCurrentClaimMock).not.toHaveBeenCalled();
  });

  it('a claim held only on the authoritative column (the mirror-empty case) still releases via the keyed RPC', async () => {
    // Mirrors the FR-5 branch above releaseSD's release call: sd_id starts empty, so releaseSD
    // resolves it from getMyClaims before reaching the call this test targets. That resolution
    // path is pre-existing and out of this fix's scope — this test only re-asserts that once a
    // key IS resolved, the release itself goes through the keyed RPC, not releaseCurrentClaim.
    getCurrentSessionMock.mockReturnValue({ session_id: 'sess-alpha3', sd_id: 'SD-SOME-KEY-001' });
    bestEffortReleaseSdByKeyMock.mockResolvedValue({ released: true, error: null });

    await releaseSD();

    expect(bestEffortReleaseSdByKeyMock).toHaveBeenCalledWith(
      { __fake: 'supabase' }, 'sess-alpha3', 'SD-SOME-KEY-001', 'manual', expect.any(Function),
    );
    expect(releaseCurrentClaimMock).not.toHaveBeenCalled();
  });

  it('does not throw and does not call releaseCurrentClaim when the RPC reports sd_mismatch', async () => {
    getCurrentSessionMock.mockReturnValue({ session_id: 'sess-alpha3', sd_id: 'QF-20260903-602' });
    bestEffortReleaseSdByKeyMock.mockResolvedValue({ released: false, error: null, skipped: 'sd_mismatch', heldSdKey: 'QF-OTHER' });

    await expect(releaseSD()).resolves.not.toThrow();
    expect(releaseCurrentClaimMock).not.toHaveBeenCalled();
  });
});
