/**
 * Tests: SD-FDBK-FIX-HANDOFF-CLAIM-GATE-001 — handoff claim gate + session attribution.
 * Covers: foreign-claim rejected, unclaimed rejected (incl. orphan auto-release),
 * claim-holder passes, bypass honored, created_by identity + LFA lookup coherence.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { decideExecuteClaimGate, evaluateClaimCheckForHandoff } from '../../scripts/modules/handoff/claim-gate-decision.js';
import { recorderIdentity, recorderIdentities, HANDOFF_SYSTEM_TAG } from '../../scripts/modules/handoff/recording/HandoffRecorder.js';

const ORIGINAL_SID = process.env.CLAUDE_SESSION_ID;
afterEach(() => {
  if (ORIGINAL_SID === undefined) delete process.env.CLAUDE_SESSION_ID;
  else process.env.CLAUDE_SESSION_ID = ORIGINAL_SID;
});

describe('decideExecuteClaimGate (handoff.js pre-delegate seam)', () => {
  it('claim-holder passes unchanged', () => {
    expect(decideExecuteClaimGate({ success: true }, false)).toEqual({ action: 'proceed' });
  });

  it('foreign ACTIVE owner (fallback=true) is rejected — no longer a pass for execute', () => {
    const v = decideExecuteClaimGate(
      { success: false, fallback: true, error: 'claimed_by_active_session', owner: { session_id: 'peer-1' } },
      false
    );
    expect(v.action).toBe('exit');
    expect(v.label).toBe('FOREIGN_CLAIM');
  });

  it('stale-but-alive foreign owner is also FOREIGN_CLAIM', () => {
    const v = decideExecuteClaimGate({ success: false, fallback: true, error: 'claimed_by_stale_but_alive_session' }, false);
    expect(v).toEqual({ action: 'exit', label: 'FOREIGN_CLAIM' });
  });

  it('non-fallback failure keeps the legacy hard-fail label', () => {
    const v = decideExecuteClaimGate({ success: false, error: 'db_error' }, false);
    expect(v).toEqual({ action: 'exit', label: 'CLAIM_CHECK_FAILED' });
  });

  it('documented bypass flag proceeds with the bypass surfaced', () => {
    const v = decideExecuteClaimGate({ success: false, fallback: true }, true);
    expect(v).toEqual({ action: 'proceed_bypassed', label: 'FOREIGN_CLAIM' });
  });

  it('bypass does NOT rescue non-fallback failures', () => {
    const v = decideExecuteClaimGate({ success: false }, true);
    expect(v.action).toBe('exit');
  });
});

describe('evaluateClaimCheckForHandoff (BaseExecutor Step 1.3 seam)', () => {
  it('claim-holder (ownership=mine) passes', () => {
    expect(evaluateClaimCheckForHandoff({ ownership: 'mine' }, 'SD-X')).toEqual({ block: false });
  });

  it('null claimCheck does not block (fail-open parity with prior behavior on missing return)', () => {
    expect(evaluateClaimCheckForHandoff(null, 'SD-X')).toEqual({ block: false });
  });

  it('NULL claim (ownership=unclaimed) is rejected with sd-start direction', () => {
    const v = evaluateClaimCheckForHandoff({ ownership: 'unclaimed' }, 'SD-X');
    expect(v.block).toBe(true);
    expect(v.detail).toContain('no session holds the claim');
    expect(v.detail).toContain('sd-start.js SD-X');
  });

  it('orphan auto-release no longer silently proceeds — explicit re-claim required', () => {
    const v = evaluateClaimCheckForHandoff(
      { ownership: 'unclaimed', reason: 'stale', released_owner_session: 'dead-session-1' },
      'SD-Y'
    );
    expect(v.block).toBe(true);
    expect(v.detail).toContain('dead-session-1');
    expect(v.detail).toContain('explicit re-claim required');
  });
});

describe('recorder session attribution (FR-4)', () => {
  it('created_by carries CLAUDE_SESSION_ID when set', () => {
    process.env.CLAUDE_SESSION_ID = 'session-abc';
    expect(recorderIdentity()).toBe('session-abc');
  });

  it('falls back to the legacy system tag when no session identity exists', () => {
    delete process.env.CLAUDE_SESSION_ID;
    expect(recorderIdentity()).toBe(HANDOFF_SYSTEM_TAG);
  });

  it('LFA pending-upsert lookup matches BOTH the legacy tag and the session identity', () => {
    process.env.CLAUDE_SESSION_ID = 'session-abc';
    expect(recorderIdentities()).toEqual([HANDOFF_SYSTEM_TAG, 'session-abc']);
    delete process.env.CLAUDE_SESSION_ID;
    expect(recorderIdentities()).toEqual([HANDOFF_SYSTEM_TAG]);
  });
});
