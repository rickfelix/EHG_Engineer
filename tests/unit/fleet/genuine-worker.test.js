/**
 * SD-FDBK-FIX-COORDINATOR-AUDIT-MJS-001 — shared genuine-worker predicate.
 *
 * coordinator-audit.mjs over-counted workers (counted every session heartbeating <15m
 * regardless of role/status/claim-history), disagreeing with coordinator-email-summary.mjs
 * and the dashboard. The predicate is now shared in lib/fleet/genuine-worker.mjs. These
 * tests pin that it excludes the coordinator, Adam, non_fleet, non-live statuses, and
 * never-claimed ghosts.
 */
import { describe, it, expect } from 'vitest';
import { everClaimed, isFleetWorker, liveFleetWorkers } from '../../../lib/fleet/genuine-worker.mjs';

const ME = 'coord-1';
const fresh = () => new Date().toISOString();

// a baseline genuine worker: active, ever-claimed (has sd_key), fresh heartbeat
const worker = (over = {}) => ({
  session_id: 'w1', status: 'active', metadata: {}, sd_key: 'SD-X-001',
  claimed_at: null, worktree_path: null, continuous_sds_completed: 0,
  heartbeat_at: fresh(), ...over,
});

describe('everClaimed (ghost-filter)', () => {
  it('true when any claim signal is present', () => {
    expect(everClaimed({ sd_key: 'SD-X' })).toBe(true);
    expect(everClaimed({ claimed_at: '2026-01-01' })).toBe(true);
    expect(everClaimed({ worktree_path: '/wt' })).toBe(true);
    expect(everClaimed({ continuous_sds_completed: 2 })).toBe(true);
  });
  it('false when the session never held a claim (a ghost)', () => {
    expect(everClaimed({ sd_key: null, claimed_at: null, worktree_path: null, continuous_sds_completed: 0 })).toBe(false);
  });
});

describe('isFleetWorker', () => {
  it('accepts a genuine active worker', () => {
    expect(isFleetWorker(worker(), ME)).toBe(true);
  });
  it('accepts a genuine idle worker that ever claimed (no current sd_key)', () => {
    expect(isFleetWorker(worker({ session_id: 'w2', sd_key: null, status: 'idle', continuous_sds_completed: 3 }), ME)).toBe(true);
  });
  it('excludes the coordinator itself', () => {
    expect(isFleetWorker(worker({ session_id: ME }), ME)).toBe(false);
  });
  it('excludes Adam (metadata.role=adam)', () => {
    expect(isFleetWorker(worker({ metadata: { role: 'adam' } }), ME)).toBe(false);
  });
  it('excludes non_fleet sessions', () => {
    expect(isFleetWorker(worker({ metadata: { non_fleet: true } }), ME)).toBe(false);
  });
  it('excludes non-live statuses (released/exited/stale ghosts)', () => {
    for (const status of ['released', 'exited', 'stale', 'completed']) {
      expect(isFleetWorker(worker({ status }), ME)).toBe(false);
    }
  });
  it('excludes a never-claimed ghost even when active', () => {
    expect(isFleetWorker(worker({ session_id: 'g1', sd_key: null, claimed_at: null, worktree_path: null, continuous_sds_completed: 0 }), ME)).toBe(false);
  });
});

describe('liveFleetWorkers (the over-count regression)', () => {
  it('counts only genuine live workers from a mixed session list', () => {
    const now = Date.now();
    const sessions = [
      worker({ session_id: 'builder', sd_key: 'SD-A' }),                                   // genuine builder ✓
      worker({ session_id: 'idle', sd_key: null, status: 'idle', continuous_sds_completed: 1 }), // genuine idle ✓
      worker({ session_id: ME }),                                                           // coordinator ✗
      worker({ session_id: 'adam', metadata: { role: 'adam' } }),                           // Adam ✗
      worker({ session_id: 'nf', metadata: { non_fleet: true } }),                          // non_fleet ✗
      worker({ session_id: 'released', status: 'released' }),                               // released ghost ✗
      worker({ session_id: 'ghost', sd_key: null, claimed_at: null, worktree_path: null, continuous_sds_completed: 0 }), // never-claimed ✗
      worker({ session_id: 'stale', heartbeat_at: new Date(now - 20 * 60 * 1000).toISOString() }), // heartbeat >15m ✗
    ];
    const live = liveFleetWorkers(sessions, ME, now);
    expect(live.map((s) => s.session_id).sort()).toEqual(['builder', 'idle']);
    // the FLOW/LIVENESS gauges the audit derives:
    expect(live.filter((s) => s.sd_key).length).toBe(1);   // builders
    expect(live.filter((s) => !s.sd_key).length).toBe(1);  // live-idle
  });

  it('returns [] for null/empty input (fail-open)', () => {
    expect(liveFleetWorkers(null, ME, Date.now())).toEqual([]);
    expect(liveFleetWorkers([], ME, Date.now())).toEqual([]);
  });
});
