/**
 * Liveness oracle for the dead-letter drain — SD-LEO-INFRA-COORDINATION-LANE-DRAIN-001 / FR-1c.
 *
 * THE DEFECT THIS PINS. The drain decided liveness with `status IN ('active','idle')`. Measured
 * against the live fleet, claude_sessions.status and is_alive are wrong in BOTH directions:
 * sessions reporting is_alive=true with multi-hour-stale heartbeats, and sessions reporting
 * is_alive=false with sub-second-fresh ones. The consequence was not marginal — the single
 * dominant dead target held 2,423 of 2,644 dead-lettered rows (91.6% of the backlog) while
 * reading status='active', is_alive=true, with a 45-hour-stale heartbeat. A drain built on that
 * field classified nine-tenths of its own problem as "live backlog" and skipped it.
 *
 * WHY A HEARTBEAT ORACLE IS THE FIX. status and is_alive are ASSERTIONS a session writes about
 * itself and may never revise — four of the dead targets stopped within eight minutes of each
 * other in one mass reap that updated none of their statuses. A heartbeat is a LIVENESS PROOF
 * that decays on its own: it cannot be left stale-but-true, because staleness is the signal.
 *
 * TWO-SIDED BY CONSTRUCTION. Both directions are tested deliberately. An oracle that only refuses
 * to call dead things live would pass while wrongly declaring live sessions dead — and THAT error
 * is the dangerous one here, because it would retarget a live session's mail away from it.
 */

import { describe, it, expect } from 'vitest';
import { isSessionLive, LIVENESS_STALE_AFTER_MS } from '../../../lib/coordination/dead-letter-drain.js';

const NOW = Date.parse('2026-08-07T12:00:00.000Z');
const ago = (ms) => new Date(NOW - ms).toISOString();
const MIN = 60 * 1000;
const HOUR = 60 * MIN;

describe('isSessionLive — heartbeat recency, never status/is_alive', () => {
  it('THE REGRESSION: a session claiming active/is_alive with a stale heartbeat is NOT live', () => {
    // Shape of the real dominant dead target: status='active', is_alive=true, heartbeat 45h stale,
    // holding 91.6% of the backlog. The old status-based oracle called this live and skipped it.
    const dominantDeadTarget = {
      session_id: '0ab6a99c',
      status: 'active',
      is_alive: true,
      heartbeat_at: ago(45 * HOUR),
      last_tool_at: ago(45 * HOUR)
    };
    expect(isSessionLive(dominantDeadTarget, { nowMs: NOW })).toBe(false);
  });

  it('THE OTHER DIRECTION: a session claiming released/is_alive=false with a fresh heartbeat IS live', () => {
    // Measured: 4 sessions reported is_alive=false with sub-minute heartbeats. Calling these dead
    // would retarget a LIVE session's mail away from it — the more damaging error of the two.
    const freshButMislabelled = {
      session_id: 'fresh-1',
      status: 'released',
      is_alive: false,
      heartbeat_at: ago(20 * 1000)
    };
    expect(isSessionLive(freshButMislabelled, { nowMs: NOW })).toBe(true);
  });

  it('uses the NEWER of heartbeat_at and last_tool_at', () => {
    const toolActiveButHeartbeatStale = {
      session_id: 'tool-1',
      status: 'active',
      heartbeat_at: ago(3 * HOUR),
      last_tool_at: ago(1 * MIN)
    };
    expect(isSessionLive(toolActiveButHeartbeatStale, { nowMs: NOW })).toBe(true);
  });

  it('treats a missing session as NOT live', () => {
    expect(isSessionLive(undefined, { nowMs: NOW })).toBe(false);
    expect(isSessionLive(null, { nowMs: NOW })).toBe(false);
  });

  it('treats a session with no timestamps at all as NOT live, whatever it claims', () => {
    // Absence of proof is not proof of life. Defaulting this to live would reinstate the defect
    // for every row whose target never wrote a heartbeat.
    expect(isSessionLive({ session_id: 'x', status: 'active', is_alive: true }, { nowMs: NOW })).toBe(false);
  });

  it('ignores status and is_alive entirely — identical heartbeats produce identical verdicts', () => {
    const heartbeat_at = ago(1 * MIN);
    const verdicts = ['active', 'idle', 'released', 'stale', 'unknown', undefined].map((status) =>
      isSessionLive({ session_id: 's', status, is_alive: status === 'active', heartbeat_at }, { nowMs: NOW })
    );
    expect(new Set(verdicts).size).toBe(1);
    expect(verdicts[0]).toBe(true);
  });

  it('is bounded by an explicit, overridable threshold', () => {
    const s = { session_id: 's', heartbeat_at: ago(20 * MIN) };
    expect(isSessionLive(s, { nowMs: NOW, staleAfterMs: 30 * MIN })).toBe(true);
    expect(isSessionLive(s, { nowMs: NOW, staleAfterMs: 10 * MIN })).toBe(false);
  });

  it('exports a default threshold that is generous relative to the ~30s heartbeat cadence', () => {
    // Generous on purpose: the cost of calling a live session dead (mail retargeted away from a
    // working seat) exceeds the cost of leaving one dead session's rows for the next sweep tick.
    expect(LIVENESS_STALE_AFTER_MS).toBeGreaterThanOrEqual(10 * MIN);
    expect(isSessionLive({ session_id: 's', heartbeat_at: ago(LIVENESS_STALE_AFTER_MS - MIN) }, { nowMs: NOW })).toBe(true);
    expect(isSessionLive({ session_id: 's', heartbeat_at: ago(LIVENESS_STALE_AFTER_MS + MIN) }, { nowMs: NOW })).toBe(false);
  });

  it('tolerates an unparseable timestamp by refusing to call it live', () => {
    expect(isSessionLive({ session_id: 's', heartbeat_at: 'not-a-date' }, { nowMs: NOW })).toBe(false);
  });
});
