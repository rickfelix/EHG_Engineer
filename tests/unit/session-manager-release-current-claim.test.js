/**
 * QF-20260903-073 (Umbrella C: correct helper exists, consumer doesn't call it) —
 * instance #3 from Solomon's census: releaseClaimBothSurfaces (lib/claim/release-claim-both-surfaces.mjs)
 * is the shared dual-surface release primitive with 8+ correct callers, but the
 * OPERATOR-FACING releaseCurrentClaim (lib/session-manager.mjs) bypassed it entirely,
 * calling the bare release_sd RPC directly -- dead by construction relative to the
 * dual-surface invariant every other release path upholds.
 *
 * Fix: releaseCurrentClaim now routes through releaseClaimBothSurfaces with
 * sessionStatus:'idle' (a manual unclaim keeps the session alive -- never 'released',
 * which would retire it).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  sessionFile: null,       // { data } for the one matching session file, or null
  releaseCalls: [],
  releaseResult: { ok: true, method: 'direct', holder: null, clearedSd: true, clearedSession: true, oldHolderGone: true, error: null },
}));

vi.mock('fs', () => ({
  default: {
    existsSync: () => true, // SESSION_DIR "exists"
    mkdirSync: () => {},
    readdirSync: () => (h.sessionFile ? ['session.json'] : []),
    readFileSync: () => JSON.stringify(h.sessionFile.data),
    statSync: () => ({ mtimeMs: Date.now() }),
    writeFileSync: vi.fn(),
  },
}));

vi.mock('../../lib/terminal-identity.js', () => ({
  getTerminalId: () => 'fixed-test-terminal-id',
}));

vi.mock('../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => ({ rpc: vi.fn(), from: vi.fn() }),
}));

vi.mock('../../lib/claim/release-claim-both-surfaces.mjs', () => ({
  releaseClaimBothSurfaces: vi.fn((sb, opts) => {
    h.releaseCalls.push(opts);
    return Promise.resolve({ ...h.releaseResult, holder: opts.holderSessionId });
  }),
}));

const { releaseCurrentClaim } = await import('../../lib/session-manager.mjs');

describe('QF-20260903-073: releaseCurrentClaim routes through releaseClaimBothSurfaces', () => {
  beforeEach(() => {
    h.releaseCalls.length = 0;
    h.sessionFile = {
      data: {
        terminal_id: 'fixed-test-terminal-id',
        session_id: '11111111-1111-4111-8111-111111111111', // birth-cert UUID -> skips PID check
        sd_key: 'SD-TEST-001',
      },
    };
  });

  it('calls releaseClaimBothSurfaces with sessionStatus:idle (never released), not the bare release_sd RPC', async () => {
    const result = await releaseCurrentClaim('manual');

    expect(h.releaseCalls).toHaveLength(1);
    expect(h.releaseCalls[0]).toMatchObject({
      sdKey: 'SD-TEST-001',
      holderSessionId: '11111111-1111-4111-8111-111111111111',
      reason: 'manual',
      sessionStatus: 'idle',
    });
    expect(result.success).toBe(true);
  });

  it('propagates a failed release as success:false without crashing', async () => {
    h.releaseResult = { ok: false, error: 'sd_mismatch' };
    const result = await releaseCurrentClaim('manual');

    expect(result.success).toBe(false);
    expect(result.error).toBe('sd_mismatch');
  });

  it('returns no_session when there is no matching session file, without calling the release helper', async () => {
    h.sessionFile = null;
    const result = await releaseCurrentClaim('manual');

    expect(result).toEqual({ success: false, error: 'no_session', message: 'No active session found' });
    expect(h.releaseCalls).toHaveLength(0);
  });

  it('returns no_claim when the session has no sd_key, without calling the release helper', async () => {
    h.sessionFile.data.sd_key = null;
    const result = await releaseCurrentClaim('manual');

    expect(result).toEqual({ success: false, error: 'no_claim', message: 'Session has no active SD claim' });
    expect(h.releaseCalls).toHaveLength(0);
  });
});
