/**
 * SD-LEO-INFRA-FORECASTER-FIXTURE-WORKER-EXCLUSION-001 — the capacity forecaster's live-worker
 * predicate: a fixture/test session is NOT counted; a real worker IS; released/coordinator/adam
 * sessions are excluded so demand(soon) reflects only real workers.
 */
import { describe, it, expect } from 'vitest';
import { isLiveCountableWorker, RELEASED_WORKER_STATUSES } from '../../scripts/lib/live-countable-worker.mjs';

const COORD = 'coord-session-uuid';
const realWorker = { session_id: '32925831-81d7-40a1-b0a9-36987b3730a4', status: 'active', metadata: { callsign: 'Echo' } };

describe('forecaster live-worker predicate — fixtures (FR-1)', () => {
  it('a real worker session IS counted', () => {
    expect(isLiveCountableWorker(realWorker, COORD)).toBe(true);
  });

  it.each([
    'drain_test_123', 'test_execute_9', 'test-session-x', 'test_session_y',
    'test-switch-claim-guards-session', 'qf-route-probe-A', 'QF-TEST-001', 'some-fixture-id',
  ])('a fixture-id session (%s) is NOT counted', (sid) => {
    expect(isLiveCountableWorker({ session_id: sid, status: 'active' }, COORD)).toBe(false);
  });

  it('a session with metadata.role=adam is NOT counted', () => {
    expect(isLiveCountableWorker({ session_id: 'real-uuid-1', status: 'active', metadata: { role: 'adam' } }, COORD)).toBe(false);
  });

  it('a non_fleet session is NOT counted', () => {
    expect(isLiveCountableWorker({ session_id: 'real-uuid-2', status: 'active', metadata: { non_fleet: true } }, COORD)).toBe(false);
  });

  it('the active coordinator (by id) is NOT counted', () => {
    expect(isLiveCountableWorker({ session_id: COORD, status: 'active', metadata: {} }, COORD)).toBe(false);
  });

  it('a stale metadata.is_coordinator marker is NOT counted even when not the active coordinator id', () => {
    expect(isLiveCountableWorker({ session_id: 'stale-coord', status: 'active', metadata: { is_coordinator: true } }, COORD)).toBe(false);
  });
});

describe('forecaster live-worker predicate — released/terminal status (FR-2)', () => {
  it.each([...RELEASED_WORKER_STATUSES])('a %s session is NOT counted (not available even with a fresh heartbeat)', (status) => {
    expect(isLiveCountableWorker({ session_id: 'real-uuid-3', status, metadata: {} }, COORD)).toBe(false);
  });

  it('an active status real worker IS counted', () => {
    expect(isLiveCountableWorker({ session_id: 'real-uuid-4', status: 'active', metadata: {} }, COORD)).toBe(true);
  });
});

describe('forecaster live-worker predicate — demand reflects only real workers (FR-4)', () => {
  it('filtering a mixed session set leaves only the real workers', () => {
    const sessions = [
      realWorker,                                                              // real
      { session_id: 'drain_test_1', status: 'active', metadata: {} },          // fixture
      { session_id: 'r2', status: 'active', metadata: { role: 'adam' } },      // adam
      { session_id: 'r3', status: 'released', metadata: {} },                  // released
      { session_id: COORD, status: 'active', metadata: {} },                   // coordinator
      { session_id: 'r4', status: 'active', metadata: { callsign: 'Foxtrot' } }, // real
    ];
    const live = sessions.filter((s) => isLiveCountableWorker(s, COORD));
    expect(live.map((s) => s.session_id).sort()).toEqual([realWorker.session_id, 'r4'].sort());
  });
});

describe('forecaster live-worker predicate — totality', () => {
  it('null/garbage input is not a worker (never throws)', () => {
    expect(isLiveCountableWorker(null, COORD)).toBe(false);
    expect(isLiveCountableWorker(undefined, undefined)).toBe(false);
    expect(isLiveCountableWorker({}, null)).toBe(true); // empty session, no exclusion signal -> real
  });
});
