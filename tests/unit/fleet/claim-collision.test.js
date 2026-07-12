import { describe, it, expect } from 'vitest';
import {
  indexReleaseEvents,
  releasedBefore,
  classifyClaimTransition,
} from '../../../lib/fleet/claim-collision.mjs';

// QF-20260712-008 (RCA on QF-20260712-254): a benign release-then-reclaim must NOT
// read as a live dual-session collision. The prior session can stay status=active
// while having released the SD (claim_cleared SESSION_STATUS_TRANSITION), so the
// verdict must consult session_lifecycle_events, not claude_sessions.status alone.

const LIVE = { status: 'active' };
const prevOf = (id) => ({ session_id: id });
const curAt = (iso, id) => ({ session_id: id, claimed_at: iso });

describe('indexReleaseEvents', () => {
  it('captures SD-scoped claim-clears and session-level releases; ignores non-release rows', () => {
    const idx = indexReleaseEvents([
      { session_id: 'A', event_type: 'SESSION_STATUS_TRANSITION', created_at: '2026-07-12T10:00:00Z', metadata: { claim_cleared: true, old_sd_key: 'QF-1' } },
      { session_id: 'A', event_type: 'SESSION_STATUS_TRANSITION', created_at: '2026-07-12T09:00:00Z', metadata: { claim_cleared: false, old_sd_key: 'QF-1' } }, // a SET, not a release
      { session_id: 'B', event_type: 'SESSION_AUTO_RELEASED', created_at: '2026-07-12T11:00:00Z', metadata: {} },
      { session_id: 'C', event_type: 'SESSION_CREATED', created_at: '2026-07-12T08:00:00Z', metadata: {} }, // not a release type
    ]);
    expect(idx.get('A')).toEqual([{ at: Date.parse('2026-07-12T10:00:00Z'), sdKey: 'QF-1' }]);
    expect(idx.get('B')).toEqual([{ at: Date.parse('2026-07-12T11:00:00Z'), sdKey: null }]);
    expect(idx.has('C')).toBe(false);
  });
});

describe('releasedBefore', () => {
  const idx = indexReleaseEvents([
    { session_id: 'A', event_type: 'SESSION_STATUS_TRANSITION', created_at: '2026-07-12T10:00:00Z', metadata: { claim_cleared: true, old_sd_key: 'QF-1' } },
    { session_id: 'B', event_type: 'SESSION_AUTO_RELEASED', created_at: '2026-07-12T10:00:00Z', metadata: {} },
  ]);
  it('SD-scoped release only counts for the matching SD', () => {
    expect(releasedBefore(idx, 'A', 'QF-1', '2026-07-12T10:30:00Z')).toBe(true);
    expect(releasedBefore(idx, 'A', 'QF-OTHER', '2026-07-12T10:30:00Z')).toBe(false);
  });
  it('session-level release (sdKey null) counts for any SD', () => {
    expect(releasedBefore(idx, 'B', 'QF-ANYTHING', '2026-07-12T10:30:00Z')).toBe(true);
  });
  it('a release AFTER the reclaim does not count', () => {
    expect(releasedBefore(idx, 'A', 'QF-1', '2026-07-12T09:30:00Z')).toBe(false);
  });
  it('no markers for the session → false', () => {
    expect(releasedBefore(idx, 'Z', 'QF-1', '2026-07-12T23:00:00Z')).toBe(false);
  });
});

describe('classifyClaimTransition', () => {
  it('prior session gone (no row / released status) → plausible_reroute', () => {
    const v = classifyClaimTransition({ prev: prevOf('A'), cur: curAt('2026-07-12T12:00:00Z', 'B'), prevSession: undefined, releaseBySession: new Map(), sdKey: 'QF-1' });
    expect(v).toBe('plausible_reroute');
    const v2 = classifyClaimTransition({ prev: prevOf('A'), cur: curAt('2026-07-12T12:00:00Z', 'B'), prevSession: { status: 'released' }, releaseBySession: new Map(), sdKey: 'QF-1' });
    expect(v2).toBe('plausible_reroute');
  });

  it('THE FIX: prior session still status=active but RELEASED this SD before reclaim → plausible_reroute, not anomaly', () => {
    const idx = indexReleaseEvents([
      { session_id: 'A', event_type: 'SESSION_STATUS_TRANSITION', created_at: '2026-07-12T11:00:00Z', metadata: { claim_cleared: true, old_sd_key: 'QF-1' } },
    ]);
    const v = classifyClaimTransition({ prev: prevOf('A'), cur: curAt('2026-07-12T11:30:00Z', 'B'), prevSession: LIVE, releaseBySession: idx, sdKey: 'QF-1' });
    expect(v).toBe('plausible_reroute');
  });

  it('prior session live AND never released this SD → ANOMALY_live_interleave (genuine collision preserved)', () => {
    const v = classifyClaimTransition({ prev: prevOf('A'), cur: curAt('2026-07-12T11:30:00Z', 'B'), prevSession: LIVE, releaseBySession: new Map(), sdKey: 'QF-1' });
    expect(v).toBe('ANOMALY_live_interleave');
  });

  it('prior session live and released a DIFFERENT SD (not this one) → still ANOMALY', () => {
    const idx = indexReleaseEvents([
      { session_id: 'A', event_type: 'SESSION_STATUS_TRANSITION', created_at: '2026-07-12T11:00:00Z', metadata: { claim_cleared: true, old_sd_key: 'QF-OTHER' } },
    ]);
    const v = classifyClaimTransition({ prev: prevOf('A'), cur: curAt('2026-07-12T11:30:00Z', 'B'), prevSession: LIVE, releaseBySession: idx, sdKey: 'QF-1' });
    expect(v).toBe('ANOMALY_live_interleave');
  });
});
