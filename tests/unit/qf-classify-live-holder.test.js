/**
 * classifyQuickFixes — live-holder exclusion & stale-vs-alive adoptability
 * SD-LEO-INFRA-SESSION-AWARE-AUTO-001 (FR-3, FR-4)
 *
 * TS-3 (HIGHEST RISK — DEFECT 1): the live-QF-holder signal is
 *   quick_fixes.claiming_session_id, NOT claude_sessions.sd_key. A QF whose
 *   claiming_session_id maps to a LIVE active session is excluded from
 *   topStartableQF — and this MUST hold even when no claude_sessions.sd_key
 *   references the QF id at all (claimedSDs has no QF entry).
 *
 * TS-4 (DEFECT 2): a claim only protects while the holder is LIVE. Holder
 *   heartbeat <= QF_HOLDER_LIVE_SECONDS (900s default) ⇒ protected/excluded;
 *   holder heartbeat > 900s OR holder absent from activeSessions ⇒ adoptable
 *   (STALE badge, present in topStartableQF).
 *
 * These tests construct holders that are deliberately NOT same-conversation
 * with the current session (distinct UUID terminal_ids) so the liveness
 * boundary — not terminal-id recovery — is what is under test.
 */
import { describe, test, expect } from 'vitest';
import { classifyQuickFixes } from '../../scripts/modules/sd-next/display/quick-fixes.js';

// Distinct UUID terminal_ids so isSameConversation(...) === false (two different
// UUIDs compare literally → false), keeping us on the heartbeat-liveness path.
const TID_CURRENT = '11111111-1111-1111-1111-111111111111';
const TID_HOLDER = '22222222-2222-2222-2222-222222222222';

const CURRENT_SESSION = { session_id: 'sess-current', terminal_id: TID_CURRENT };
const HOLDER_SESSION_ID = 'sess-holder';

/** A minimal open QF row, claimed by HOLDER_SESSION_ID unless overridden. */
function qfRow(overrides = {}) {
  return {
    id: 'QF-20260101-001',
    title: 'Fix a thing',
    type: 'bug',
    severity: 'medium',
    status: 'open',
    estimated_loc: 10,
    created_at: new Date().toISOString(), // recent → not verify-first
    pr_url: null,
    commit_sha: null,
    claiming_session_id: HOLDER_SESSION_ID,
    ...overrides,
  };
}

/** An activeSessions holder row with a controllable heartbeat age. */
function holderSession(heartbeatAgeSeconds, overrides = {}) {
  return {
    session_id: HOLDER_SESSION_ID,
    terminal_id: TID_HOLDER,
    heartbeat_age_seconds: heartbeatAgeSeconds,
    pid: null, // no PID → analyzeClaimRelationship can't mark it dead via PID
    hostname: 'some-other-host', // different host → no PID liveness shortcut
    status: 'active',
    ...overrides,
  };
}

function classify(quickFixes, sessionContext) {
  return classifyQuickFixes(quickFixes, new Map(), sessionContext);
}

describe('TS-3 (DEFECT 1): live holder detected via claiming_session_id, NOT sd_key', () => {
  test('a QF held by a LIVE session is _isClaimedByOther=true and ABSENT from topStartableQF — with NO sd_key referencing the QF', () => {
    const qf = qfRow(); // claiming_session_id = HOLDER_SESSION_ID
    const sessionContext = {
      currentSession: CURRENT_SESSION,
      // LIVE holder: heartbeat well under the 900s QF liveness boundary.
      activeSessions: [holderSession(60)],
      // CRITICAL: claimedSDs (keyed by SD-key) contains NO entry for the QF id.
      // If detection relied on sd_key, this would be empty and the QF would
      // wrongly appear startable. It must rely on qf.claiming_session_id instead.
      claimedSDs: new Map(),
    };

    const { summary, classified } = classify([qf], sessionContext);
    const row = classified.find(r => r.id === qf.id);

    expect(row._isClaimedByOther).toBe(true);
    // Excluded from the auto-startable pick.
    expect(summary.topStartableQF).toBeNull();
    // Sanity: no claude_sessions.sd_key referenced the QF id at all.
    expect([...sessionContext.claimedSDs.keys()]).not.toContain(qf.id);
  });

  test('current-session holder ⇒ YOURS, not claimed-by-other', () => {
    const qf = qfRow({ claiming_session_id: CURRENT_SESSION.session_id });
    const { classified } = classify([qf], {
      currentSession: CURRENT_SESSION,
      activeSessions: [],
      claimedSDs: new Map(),
    });
    const row = classified.find(r => r.id === qf.id);
    expect(row._isClaimedByOther).toBe(false);
    expect(row._claimBadge).toMatch(/YOURS/);
  });

  test('unclaimed QF (claiming_session_id null) is startable', () => {
    const qf = qfRow({ claiming_session_id: null });
    const { summary } = classify([qf], {
      currentSession: CURRENT_SESSION,
      activeSessions: [],
      claimedSDs: new Map(),
    });
    expect(summary.topStartableQF?.id).toBe(qf.id);
  });
});

describe('TS-4 (DEFECT 2): stale-vs-alive holder governs adoptability', () => {
  test('holder heartbeat <= 900s (LIVE) ⇒ protected: _isClaimedByOther=true, absent from topStartableQF', () => {
    const qf = qfRow();
    const { summary, classified } = classify([qf], {
      currentSession: CURRENT_SESSION,
      activeSessions: [holderSession(120)], // 120s << 900s → live
      claimedSDs: new Map(),
    });
    const row = classified.find(r => r.id === qf.id);
    expect(row._isClaimedByOther).toBe(true);
    expect(summary.topStartableQF).toBeNull();
  });

  test('holder heartbeat > 900s ⇒ adoptable: _isClaimedByOther=false, STALE badge, present in topStartableQF', () => {
    const qf = qfRow();
    const { summary, classified } = classify([qf], {
      currentSession: CURRENT_SESSION,
      activeSessions: [holderSession(1200)], // 1200s > 900s → not live
      claimedSDs: new Map(),
    });
    const row = classified.find(r => r.id === qf.id);
    expect(row._isClaimedByOther).toBe(false);
    expect(row._claimBadge).toMatch(/STALE/);
    expect(summary.topStartableQF?.id).toBe(qf.id);
  });

  test('holder ABSENT from activeSessions (released/gone) ⇒ adoptable, STALE badge', () => {
    const qf = qfRow(); // claiming_session_id set, but holder not in activeSessions
    const { summary, classified } = classify([qf], {
      currentSession: CURRENT_SESSION,
      activeSessions: [], // holder row missing entirely
      claimedSDs: new Map(),
    });
    const row = classified.find(r => r.id === qf.id);
    expect(row._isClaimedByOther).toBe(false);
    expect(row._claimBadge).toMatch(/STALE/);
    expect(summary.topStartableQF?.id).toBe(qf.id);
  });

  test('boundary: heartbeat exactly at 900s is treated as LIVE (<=) ⇒ protected', () => {
    const qf = qfRow();
    // QF_HOLDER_LIVE_SECONDS = getStaleThresholdSeconds() * 3 = 300 * 3 = 900 by default.
    const { summary, classified } = classify([qf], {
      currentSession: CURRENT_SESSION,
      activeSessions: [holderSession(900)],
      claimedSDs: new Map(),
    });
    const row = classified.find(r => r.id === qf.id);
    expect(row._isClaimedByOther).toBe(true);
    expect(summary.topStartableQF).toBeNull();
  });
});

describe('TS-3/TS-4 combined: two QFs, one live-held, one stale-held', () => {
  test('only the stale-held QF is offered as topStartableQF', () => {
    const liveHeld = qfRow({ id: 'QF-LIVE-0001', claiming_session_id: 'sess-live' });
    const staleHeld = qfRow({ id: 'QF-STALE-0001', claiming_session_id: 'sess-stale' });

    const activeSessions = [
      { session_id: 'sess-live', terminal_id: TID_HOLDER, heartbeat_age_seconds: 30, pid: null, hostname: 'h2', status: 'active' },
      { session_id: 'sess-stale', terminal_id: '33333333-3333-3333-3333-333333333333', heartbeat_age_seconds: 5000, pid: null, hostname: 'h3', status: 'active' },
    ];

    const { summary, classified } = classify([liveHeld, staleHeld], {
      currentSession: CURRENT_SESSION,
      activeSessions,
      claimedSDs: new Map(),
    });

    const live = classified.find(r => r.id === 'QF-LIVE-0001');
    const stale = classified.find(r => r.id === 'QF-STALE-0001');
    expect(live._isClaimedByOther).toBe(true);
    expect(stale._isClaimedByOther).toBe(false);
    expect(summary.topStartableQF?.id).toBe('QF-STALE-0001');
  });
});
