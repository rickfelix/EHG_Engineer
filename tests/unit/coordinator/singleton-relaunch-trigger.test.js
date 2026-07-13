import { describe, it, expect } from 'vitest';
import {
  decideRelaunchSchedule,
  evaluateSingletonRelaunch,
  writeScheduleRecord,
  SAFE_LOOP_STATES,
} from '../../../lib/coordinator/singleton-relaunch-trigger.js';

// SD-LEO-INFRA-COORDINATOR-ORCHESTRATED-SINGLETON-REFRESH-001-A (FR-1): quiescent-window
// trigger + relaunch scheduler. TS-1/TS-2 from the parent PRD are covered via
// evaluateSingletonRelaunch below; decideRelaunchSchedule covers the full pure decision matrix.

function makeSupabaseStub({ pendingRows = [], insertResult = { data: { id: 'sched-1' }, error: null }, sessionRow = null } = {}) {
  const calls = { findPending: 0, insert: 0, insertedRows: [] };
  return {
    from() {
      return {
        select() {
          const chain = {
            eq() { return chain; },
            filter() { return chain; },
            is() { return chain; },
            order() { return chain; },
            limit() {
              calls.findPending += 1;
              return Promise.resolve({ data: pendingRows, error: null });
            },
            maybeSingle() {
              return Promise.resolve({ data: sessionRow, error: null });
            },
          };
          return chain;
        },
        insert(row) {
          calls.insert += 1;
          calls.insertedRows.push(row);
          return { select: () => ({ single: () => Promise.resolve(insertResult) }) };
        },
      };
    },
    _calls: calls,
  };
}

const staleFreshness = { verdict: 'STALE', behind: 5, criticalDiff: [] };
const quiescentFleet = { quiescent: true, reason: 'quiescent', signals: {} };

describe('decideRelaunchSchedule (pure)', () => {
  it('FRESH checkout never schedules, regardless of other signals', () => {
    const r = decideRelaunchSchedule({ freshnessVerdict: 'FRESH', fleetQuiescent: true, targetLoopState: 'awaiting_tick' });
    expect(r).toEqual({ scheduled: false, reason: 'fresh' });
  });

  it('missing freshnessVerdict is treated as fresh (fail-safe default)', () => {
    const r = decideRelaunchSchedule({ fleetQuiescent: true, targetLoopState: 'awaiting_tick' });
    expect(r.scheduled).toBe(false);
    expect(r.reason).toBe('fresh');
  });

  it('STALE + fleet NOT quiescent does not schedule', () => {
    const r = decideRelaunchSchedule({ freshnessVerdict: 'STALE', fleetQuiescent: false, targetLoopState: 'awaiting_tick' });
    expect(r).toEqual({ scheduled: false, reason: 'fleet_not_quiescent' });
  });

  it('STALE + fleet quiescent + target loop_state=active (mid-consult) does not schedule — AC1', () => {
    const r = decideRelaunchSchedule({ freshnessVerdict: 'STALE', fleetQuiescent: true, targetLoopState: 'active' });
    expect(r).toEqual({ scheduled: false, reason: 'target_not_idle' });
  });

  it('STALE + fleet quiescent + target loop_state=unknown does not schedule (fail-closed, not fail-open)', () => {
    const r = decideRelaunchSchedule({ freshnessVerdict: 'STALE', fleetQuiescent: true, targetLoopState: 'unknown' });
    expect(r.scheduled).toBe(false);
    expect(r.reason).toBe('target_not_idle');
  });

  it.each(SAFE_LOOP_STATES)('STALE-CRITICAL + fleet quiescent + target loop_state=%s schedules — AC2', (state) => {
    const r = decideRelaunchSchedule({ freshnessVerdict: 'STALE-CRITICAL', fleetQuiescent: true, targetLoopState: state });
    expect(r).toEqual({ scheduled: true, reason: 'behind_n_and_quiescent' });
  });
});

describe('evaluateSingletonRelaunch (IO-orchestrated)', () => {
  it('returns unknown_role for an unrecognized role without touching supabase', async () => {
    const stub = makeSupabaseStub();
    const r = await evaluateSingletonRelaunch(stub, { role: 'not-a-real-role' });
    expect(r).toEqual({ role: 'not-a-real-role', scheduled: false, reason: 'unknown_role' });
    expect(stub._calls.findPending).toBe(0);
    expect(stub._calls.insert).toBe(0);
  });

  it('TS-1: behind-N + fleet idle + target mid-consult schedules nothing and performs no IO', async () => {
    const stub = makeSupabaseStub();
    const r = await evaluateSingletonRelaunch(stub, {
      role: 'adam',
      freshness: staleFreshness,
      fleetActivity: quiescentFleet,
      targetLoopState: 'active',
    });
    expect(r.scheduled).toBe(false);
    expect(r.reason).toBe('target_not_idle');
    expect(stub._calls.findPending).toBe(0);
    expect(stub._calls.insert).toBe(0);
  });

  it('TS-2: behind-N + fleet idle + target idle schedules exactly once', async () => {
    const stub = makeSupabaseStub({ pendingRows: [] });
    const r = await evaluateSingletonRelaunch(stub, {
      role: 'solomon',
      freshness: staleFreshness,
      fleetActivity: quiescentFleet,
      targetLoopState: 'awaiting_tick',
      senderSession: 'test-session',
    });
    expect(r.scheduled).toBe(true);
    expect(r.reason).toBe('behind_n_and_quiescent');
    expect(r.scheduleId).toBe('sched-1');
    expect(stub._calls.insert).toBe(1);
  });

  it('TS-2: a repeated tick with an existing pending schedule does not duplicate-write', async () => {
    const stub = makeSupabaseStub({ pendingRows: [{ id: 'sched-1', created_at: new Date().toISOString(), payload: {} }] });
    const r = await evaluateSingletonRelaunch(stub, {
      role: 'solomon',
      freshness: staleFreshness,
      fleetActivity: quiescentFleet,
      targetLoopState: 'awaiting_tick',
    });
    expect(r.scheduled).toBe(false);
    expect(r.reason).toBe('already_scheduled_pending');
    expect(r.pendingId).toBe('sched-1');
    expect(stub._calls.insert).toBe(0);
  });

  it('rollout flag off (enabled=false) evaluates but never writes — dry-run mode', async () => {
    const stub = makeSupabaseStub();
    const r = await evaluateSingletonRelaunch(stub, {
      role: 'coordinator',
      freshness: staleFreshness,
      fleetActivity: quiescentFleet,
      targetLoopState: 'exited',
      enabled: false,
    });
    expect(r.scheduled).toBe(false);
    expect(r.reason).toBe('would_schedule_but_disabled');
    expect(r.wouldSchedule).toBe(true);
    expect(stub._calls.findPending).toBe(0);
    expect(stub._calls.insert).toBe(0);
  });

  it('a write error is surfaced, not swallowed', async () => {
    const stub = makeSupabaseStub({ insertResult: { data: null, error: { message: 'insert failed' } } });
    const r = await evaluateSingletonRelaunch(stub, {
      role: 'adam',
      freshness: staleFreshness,
      fleetActivity: quiescentFleet,
      targetLoopState: 'awaiting_tick',
    });
    expect(r.scheduled).toBe(false);
    expect(r.reason).toBe('write_failed');
    expect(r.error).toBe('insert failed');
  });
});

// QF-20260712-972: writeScheduleRecord() previously omitted target_session, failing the
// session_coordination valid_target CHECK ((target_session IS NOT NULL) OR (target_sd IS NOT
// NULL)) on every insert (feedback d100a68f, confirmed live 2026-07-07). Fixed to default to
// the documented 'broadcast-coordinator' sentinel, matching lib/coordinator/canary-trigger.cjs.
describe('writeScheduleRecord — session_coordination valid_target CHECK', () => {
  it('sets a non-null target_session on every insert (the CHECK-satisfying fix)', async () => {
    const stub = makeSupabaseStub();
    await writeScheduleRecord(stub, {
      role: 'coordinator',
      senderSession: 'some-session-id',
      freshness: staleFreshness,
      fleetActivity: quiescentFleet,
      targetLoopState: 'exited',
      reason: 'quiescent_window',
    });
    expect(stub._calls.insert).toBe(1);
    const row = stub._calls.insertedRows[0];
    expect(row.target_session).toBe('broadcast-coordinator');
    expect(row.sender_session).toBe('some-session-id');
  });

  it('still sets target_session even when senderSession is omitted (default sender)', async () => {
    const stub = makeSupabaseStub();
    await writeScheduleRecord(stub, {
      role: 'adam',
      freshness: staleFreshness,
      fleetActivity: quiescentFleet,
      targetLoopState: 'awaiting_tick',
      reason: 'quiescent_window',
    });
    const row = stub._calls.insertedRows[0];
    expect(row.target_session).toBe('broadcast-coordinator');
    expect(row.sender_session).toBe('singleton-relaunch-scheduler');
  });
});
