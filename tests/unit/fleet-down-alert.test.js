// SD-LEO-INFRA-FLEET-DOWN-EMAIL-ALERT-001 — pure decision logic for the fleet-down operator alert.
// Oscillation-robust (sustained window, not point-in-time), claimable-gated, and edge-trigger-deduped
// so a long outage emails once rather than every 15-min run.
import { describe, it, expect, vi } from 'vitest';
// SD-LEO-INFRA-CHAIRMAN-QUIET-WINDOW-001 (E1): checkDeadCoordinator's send branch now
// resolves the chairman's zone via a dynamic import; the real resolver reaches a live
// ChairmanPreferenceStore/Supabase client, which hangs in the vitest sandbox.
vi.mock('../../lib/comms/adam-outbound/quiet-hours-extension.js', () => ({
  resolveChairmanZone: vi.fn(async () => ({ zone: 'America/New_York', source: 'default' })),
}));
import {
  evaluateFleetDownAlert, evaluateDeadCoordinatorAlert, buildDeadCoordinatorMessage, checkDeadCoordinator,
  evaluateFleetDeadManPredicate, buildFleetDeadManMessage, checkFleetDeadMan,
} from '../../scripts/fleet-down-alert.mjs';

// Helper: build a newest-first pulse list from active_count values.
const pulses = (...active) => active.map((a) => ({ active_count: a }));

describe('evaluateFleetDownAlert (SD-LEO-INFRA-FLEET-DOWN-EMAIL-ALERT-001)', () => {
  it('ALERTS on 3 consecutive active=0 pulses with claimable work (prior pulse was up)', () => {
    const r = evaluateFleetDownAlert({ pulses: pulses(0, 0, 0, 2), claimableCount: 5, requiredConsecutive: 3 });
    expect(r.alert).toBe(true);
    expect(r.reason).toMatch(/FLEET DOWN/);
  });

  it('ALERTS when there is no prior pulse (exactly the window, all zero)', () => {
    const r = evaluateFleetDownAlert({ pulses: pulses(0, 0, 0), claimableCount: 1, requiredConsecutive: 3 });
    expect(r.alert).toBe(true);
  });

  it('does NOT alert when there is no claimable work (idle empty queue is not an outage)', () => {
    const r = evaluateFleetDownAlert({ pulses: pulses(0, 0, 0, 2), claimableCount: 0, requiredConsecutive: 3 });
    expect(r.alert).toBe(false);
    expect(r.reason).toMatch(/no claimable work/);
  });

  it('does NOT alert on a single dip (oscillation self-recovers)', () => {
    const r = evaluateFleetDownAlert({ pulses: pulses(0, 3, 2, 1), claimableCount: 9, requiredConsecutive: 3 });
    expect(r.alert).toBe(false);
    expect(r.reason).toMatch(/not sustained-down/);
  });

  it('does NOT alert with insufficient pulse history', () => {
    const r = evaluateFleetDownAlert({ pulses: pulses(0, 0), claimableCount: 4, requiredConsecutive: 3 });
    expect(r.alert).toBe(false);
    expect(r.reason).toMatch(/insufficient pulse history/);
  });

  it('DEDUPS: does not re-alert when the pulse before the window was already 0 (mid-outage)', () => {
    const r = evaluateFleetDownAlert({ pulses: pulses(0, 0, 0, 0), claimableCount: 7, requiredConsecutive: 3 });
    expect(r.alert).toBe(false);
    expect(r.reason).toMatch(/already alerted/);
  });

  it('re-ALERTS after a recovery then a new sustained-down (prior pulse was up)', () => {
    // newest-first: down,down,down, up(recovery), down,down...  → prior to window is up → fire again
    const r = evaluateFleetDownAlert({ pulses: pulses(0, 0, 0, 5, 0, 0), claimableCount: 3, requiredConsecutive: 3 });
    expect(r.alert).toBe(true);
  });

  it('honors a custom requiredConsecutive threshold', () => {
    expect(evaluateFleetDownAlert({ pulses: pulses(0, 0, 4), claimableCount: 2, requiredConsecutive: 2 }).alert).toBe(true);
    expect(evaluateFleetDownAlert({ pulses: pulses(0, 0, 4), claimableCount: 2, requiredConsecutive: 3 }).alert).toBe(false);
  });

  it('is total / fail-safe on odd input', () => {
    expect(evaluateFleetDownAlert().alert).toBe(false);
    expect(evaluateFleetDownAlert({ pulses: null, claimableCount: NaN }).alert).toBe(false);
    expect(evaluateFleetDownAlert({ pulses: pulses(0, 0, 0), claimableCount: 1, requiredConsecutive: 0 }).alert).toBe(true); // clamps to default 3
  });

  it('counts the leading zero-run in consecutiveZero', () => {
    expect(evaluateFleetDownAlert({ pulses: pulses(0, 0, 3), claimableCount: 1 }).consecutiveZero).toBe(2);
    expect(evaluateFleetDownAlert({ pulses: pulses(1, 0, 0), claimableCount: 1 }).consecutiveZero).toBe(0);
  });
});

// SD-LEO-INFRA-DURABLE-COORDINATOR-LOOPS-001 / FR-3 — dead-coordinator chairman-SMS page.
// Independent predicate from evaluateFleetDownAlert() above (TS-10 non-regression scenario):
// this describe block never touches the worker-fleet-down pulses/claimable inputs.
describe('evaluateDeadCoordinatorAlert (SD-LEO-INFRA-DURABLE-COORDINATOR-LOOPS-001)', () => {
  const NOW = new Date('2026-07-19T22:00:00.000Z');
  const minutesAgo = (m) => new Date(NOW.getTime() - m * 60000).toISOString();

  it('TS-4: fires exactly once per outage — first tick past the threshold alerts', () => {
    const r = evaluateDeadCoordinatorAlert({ lastCoordinatorHeartbeatAt: minutesAgo(16), now: NOW, staleMin: 15, cronIntervalMin: 15 });
    expect(r.alert).toBe(true);
    expect(r.reason).toMatch(/DEAD COORDINATOR/);
  });

  it('TS-4: does not re-fire on a later tick while still dead (edge-trigger dedup)', () => {
    const r = evaluateDeadCoordinatorAlert({ lastCoordinatorHeartbeatAt: minutesAgo(45), now: NOW, staleMin: 15, cronIntervalMin: 15 });
    expect(r.alert).toBe(false);
    expect(r.reason).toMatch(/already past the first alertable tick/);
  });

  it('TS-5: heartbeat within the staleness window does not fire', () => {
    const r = evaluateDeadCoordinatorAlert({ lastCoordinatorHeartbeatAt: minutesAgo(5), now: NOW, staleMin: 15, cronIntervalMin: 15 });
    expect(r.alert).toBe(false);
    expect(r.reason).toMatch(/within the/);
  });

  it('TS-5: heartbeat exactly at the staleness boundary fires (>=)', () => {
    const r = evaluateDeadCoordinatorAlert({ lastCoordinatorHeartbeatAt: minutesAgo(15), now: NOW, staleMin: 15, cronIntervalMin: 15 });
    expect(r.alert).toBe(true);
  });

  it('TS-6: defaults are independently named from resolve.cjs STALE_THRESHOLD_MIN (15min default, not 10)', () => {
    // 12min elapsed: dead under resolve.cjs's 10min internal constant, but NOT dead under this
    // alert's own default (15min) — proves the two thresholds are not silently sharing a value.
    const r = evaluateDeadCoordinatorAlert({ lastCoordinatorHeartbeatAt: minutesAgo(12), now: NOW });
    expect(r.alert).toBe(false);
  });

  it('no coordinator ever seen -> insufficient history, does not alert', () => {
    const r = evaluateDeadCoordinatorAlert({ lastCoordinatorHeartbeatAt: null, now: NOW });
    expect(r.alert).toBe(false);
    expect(r.reason).toMatch(/insufficient history/);
  });

  it('is total / fail-safe on odd input', () => {
    expect(evaluateDeadCoordinatorAlert().alert).toBe(false);
    expect(evaluateDeadCoordinatorAlert({ lastCoordinatorHeartbeatAt: 'not-a-date', now: NOW }).alert).toBe(false);
  });

  it('TS-10 (non-regression): evaluateFleetDownAlert is unaffected by dead-coordinator inputs and vice versa', () => {
    // Worst case simultaneously: fleet is down AND coordinator is dead — each predicate must
    // reach its own independent verdict from its own inputs only.
    const fleetVerdict = evaluateFleetDownAlert({ pulses: pulses(0, 0, 0, 2), claimableCount: 5, requiredConsecutive: 3 });
    const coordVerdict = evaluateDeadCoordinatorAlert({ lastCoordinatorHeartbeatAt: minutesAgo(16), now: NOW, staleMin: 15, cronIntervalMin: 15 });
    expect(fleetVerdict.alert).toBe(true);
    expect(coordVerdict.alert).toBe(true);
    expect(fleetVerdict.reason).toMatch(/FLEET DOWN/);
    expect(coordVerdict.reason).toMatch(/DEAD COORDINATOR/);
  });

  it('TS-7: buildDeadCoordinatorMessage names the dead-coordinator condition, not the worker-fleet-down one', () => {
    const verdict = evaluateDeadCoordinatorAlert({ lastCoordinatorHeartbeatAt: minutesAgo(16), now: NOW, staleMin: 15, cronIntervalMin: 15 });
    const msg = buildDeadCoordinatorMessage(verdict, NOW);
    expect(msg.body).toMatch(/DEAD COORDINATOR/);
    expect(msg.body).not.toMatch(/FLEET DOWN/);
    expect(msg.kind).toBe('dead_coordinator_alert');
    expect(msg.dedupeKey).toBe(`dead-coordinator-${NOW.toISOString().slice(0, 13)}`);
  });

  it('TS-7: checkDeadCoordinator() calls the injected sendChairmanSMS exactly once on a genuine trip, with the dead-coordinator message', async () => {
    const sendChairmanSMSFn = vi.fn().mockResolvedValue({ sent: true });
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: [{ heartbeat_at: minutesAgo(16) }], error: null }),
            }),
          }),
        }),
      }),
    };
    // getActiveCoordinatorId reads from the pointer file / DB internally; in this unit test we
    // only care that checkDeadCoordinator's OWN heartbeat-driven trip logic calls the sender —
    // stub the module's db-facing query surface above and let getActiveCoordinatorId resolve
    // however it naturally does in this env (it degrades gracefully with no supabase writes).
    await checkDeadCoordinator(db, false, sendChairmanSMSFn, NOW);
    expect(sendChairmanSMSFn).toHaveBeenCalledTimes(1);
    const [message, context] = sendChairmanSMSFn.mock.calls[0];
    expect(message.body).toMatch(/DEAD COORDINATOR/);
    expect(message.kind).toBe('dead_coordinator_alert');
    // SD-LEO-INFRA-CHAIRMAN-QUIET-WINDOW-001 (E1): the resolved chairman zone is threaded
    // into the send context, not silently defaulted inside sendChairmanSMS.
    expect(context.chairmanZone).toBe('America/New_York'); // the mocked resolver's default
  });

  it('E1: checkDeadCoordinator() resolves and threads a non-ET chairman zone into the send context', async () => {
    const { resolveChairmanZone } = await import('../../lib/comms/adam-outbound/quiet-hours-extension.js');
    resolveChairmanZone.mockResolvedValueOnce({ zone: 'America/Jamaica', source: 'chairman_preference' });
    const sendChairmanSMSFn = vi.fn().mockResolvedValue({ sent: true });
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: [{ heartbeat_at: minutesAgo(16) }], error: null }),
            }),
          }),
        }),
      }),
    };
    await checkDeadCoordinator(db, false, sendChairmanSMSFn, NOW);
    expect(sendChairmanSMSFn).toHaveBeenCalledTimes(1);
    const [, context] = sendChairmanSMSFn.mock.calls[0];
    expect(context.chairmanZone).toBe('America/Jamaica');
  });

  it('TS-7: checkDeadCoordinator() does NOT call sendChairmanSMS when the coordinator heartbeat is fresh', async () => {
    const sendChairmanSMSFn = vi.fn();
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: [{ heartbeat_at: minutesAgo(5) }], error: null }),
            }),
          }),
        }),
      }),
    };
    await checkDeadCoordinator(db, false, sendChairmanSMSFn, NOW);
    expect(sendChairmanSMSFn).not.toHaveBeenCalled();
  });
});

// SD-LEO-INFRA-FLEET-DEAD-MAN-001 / FR-1 — third, independent outage arm. Deliberately reads
// neither fleet_worker_pulse nor is_coordinator=true claude_sessions, so a defect in either of
// the two describe blocks above can't mask an outage this arm would otherwise catch.
describe('evaluateFleetDeadManPredicate (SD-LEO-INFRA-FLEET-DEAD-MAN-001 FR-1)', () => {
  const NOW = new Date('2026-08-21T16:00:00.000Z');
  const minutesAgo = (m) => new Date(NOW.getTime() - m * 60000).toISOString();

  it('TS-1: zero completions and a stale heartbeat => dead', () => {
    const r = evaluateFleetDeadManPredicate({ lastHeartbeatAt: minutesAgo(150), completionsInWindow: 0, now: NOW, windowMin: 120 });
    expect(r.dead).toBe(true);
    expect(r.reason).toMatch(/zero completions AND no heartbeat/);
  });

  it('TS-2: a recent heartbeat with zero completions is NOT dead (quiet but alive)', () => {
    const r = evaluateFleetDeadManPredicate({ lastHeartbeatAt: minutesAgo(10), completionsInWindow: 0, now: NOW, windowMin: 120 });
    expect(r.dead).toBe(false);
    expect(r.reason).toMatch(/within the/);
  });

  it('TS-2: any completion in the window is NOT dead, even with a stale heartbeat', () => {
    const r = evaluateFleetDeadManPredicate({ lastHeartbeatAt: minutesAgo(500), completionsInWindow: 1, now: NOW, windowMin: 120 });
    expect(r.dead).toBe(false);
    expect(r.reason).toMatch(/is producing/);
  });

  it('TS-3: schedule-jitter robust — a heartbeat far past the window still reads dead (no narrow alertable window to miss)', () => {
    // Unlike evaluateDeadCoordinatorAlert's narrow [staleMin, staleMin+cronIntervalMin) window, this
    // predicate has no upper bound -- a delayed/skipped cron tick landing hours late still correctly
    // reads dead instead of silently falling past an alertable window.
    const r = evaluateFleetDeadManPredicate({ lastHeartbeatAt: minutesAgo(5000), completionsInWindow: 0, now: NOW, windowMin: 120 });
    expect(r.dead).toBe(true);
  });

  it('no heartbeat ever recorded and zero completions => dead', () => {
    const r = evaluateFleetDeadManPredicate({ lastHeartbeatAt: null, completionsInWindow: 0, now: NOW });
    expect(r.dead).toBe(true);
    expect(r.reason).toMatch(/has ever been recorded/);
  });

  it('is total / fail-safe on odd input', () => {
    expect(evaluateFleetDeadManPredicate().dead).toBe(true); // no heartbeat, 0 completions -> dead by construction
    expect(evaluateFleetDeadManPredicate({ lastHeartbeatAt: 'not-a-date', completionsInWindow: 0, now: NOW }).dead).toBe(true);
  });

  it('buildFleetDeadManMessage names the fleet-dead-man condition distinctly', () => {
    const verdict = evaluateFleetDeadManPredicate({ lastHeartbeatAt: minutesAgo(150), completionsInWindow: 0, now: NOW, windowMin: 120 });
    const msg = buildFleetDeadManMessage(verdict, NOW);
    expect(msg.body).toMatch(/FLEET DEAD-MAN/);
    expect(msg.kind).toBe('fleet_dead_man_alert');
    expect(msg.dedupeKey).toBe(`fleet-dead-man-${NOW.toISOString().slice(0, 13)}`);
  });
});

describe('checkFleetDeadMan (SD-LEO-INFRA-FLEET-DEAD-MAN-001 FR-1 integration)', () => {
  const NOW = new Date('2026-08-21T16:00:00.000Z');
  const minutesAgo = (m) => new Date(NOW.getTime() - m * 60000).toISOString();

  // A tiny 3-table router double: claude_sessions (heartbeat), strategic_directives_v2
  // (completions, HEAD-count shape), system_events (the verdict read-back + write). Mutable
  // `_state` lets a single db instance model successive cron ticks across one outage lifecycle
  // (TS-9), and `_events`/`_inserted` let a test assert on the persisted verdict trail.
  function makeDeadManDb(initial = {}) {
    const state = { heartbeatAt: null, completions: 0, ...initial };
    const events = [];
    const inserted = [];
    const calls = {};
    return {
      _state: state, _events: events, _inserted: inserted, _calls: calls,
      from(table) {
        if (table === 'claude_sessions') {
          return {
            select: (cols) => { calls.hbSelect = cols; return {
              order: (col) => { calls.hbOrderCol = col; return {
                limit: async () => ({ data: state.heartbeatAt ? [{ heartbeat_at: state.heartbeatAt }] : [], error: null }),
              }; },
            }; },
          };
        }
        if (table === 'strategic_directives_v2') {
          return {
            select: () => ({
              eq: (col, val) => { calls.sdEq = [col, val]; return {
                gte: (col2, val2) => { calls.sdGte = [col2, val2]; return Promise.resolve({ count: state.completions, error: null }); },
              }; },
            }),
          };
        }
        if (table === 'system_events') {
          return {
            select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: events.slice(0, 1), error: null }) }) }) }),
            insert: async (row) => {
              const full = { ...row, created_at: new Date().toISOString() };
              inserted.push(full); events.unshift(full);
              return { data: null, error: null };
            },
          };
        }
        throw new Error(`unexpected table in fleet-dead-man test double: ${table}`);
      },
    };
  }

  it('TS-1: genuinely dead fleet pages the chairman exactly once', async () => {
    const db = makeDeadManDb({ heartbeatAt: minutesAgo(150), completions: 0 });
    const sendChairmanSMSFn = vi.fn().mockResolvedValue({ sent: true });
    await checkFleetDeadMan(db, false, sendChairmanSMSFn, NOW);
    expect(sendChairmanSMSFn).toHaveBeenCalledTimes(1);
    const [message] = sendChairmanSMSFn.mock.calls[0];
    expect(message.kind).toBe('fleet_dead_man_alert');
    expect(message.body).toMatch(/FLEET DEAD-MAN/);
  });

  it('TS-2: a live fleet (recent heartbeat) does not page', async () => {
    const db = makeDeadManDb({ heartbeatAt: minutesAgo(5), completions: 0 });
    const sendChairmanSMSFn = vi.fn();
    await checkFleetDeadMan(db, false, sendChairmanSMSFn, NOW);
    expect(sendChairmanSMSFn).not.toHaveBeenCalled();
  });

  it('TS-8: queries the correct columns — heartbeat_at, status=completed, completion_date (column-name trap pin)', async () => {
    // completion_date, NOT updated_at: adversarial-review finding, verified live -- updated_at
    // on an already-completed row keeps moving for months via unrelated housekeeping writes, so
    // filtering on it would make "zero completions" almost never true.
    const db = makeDeadManDb({ heartbeatAt: minutesAgo(5), completions: 1 });
    await checkFleetDeadMan(db, false, vi.fn(), NOW);
    expect(db._calls.hbOrderCol).toBe('heartbeat_at');
    expect(db._calls.sdEq).toEqual(['status', 'completed']);
    expect(db._calls.sdGte[0]).toBe('completion_date');
  });

  it('TS-9: fires once on the initial outage, stays silent while still dead, re-fires after a recovery then a new outage', async () => {
    const db = makeDeadManDb({ heartbeatAt: minutesAgo(150), completions: 0 });
    const sendChairmanSMSFn = vi.fn().mockResolvedValue({ sent: true });

    await checkFleetDeadMan(db, false, sendChairmanSMSFn, NOW); // tick 1: newly dead -> fires
    expect(sendChairmanSMSFn).toHaveBeenCalledTimes(1);

    await checkFleetDeadMan(db, false, sendChairmanSMSFn, NOW); // tick 2: still dead -> suppressed
    expect(sendChairmanSMSFn).toHaveBeenCalledTimes(1);

    db._state.heartbeatAt = minutesAgo(1); // recovery
    await checkFleetDeadMan(db, false, sendChairmanSMSFn, NOW); // tick 3: alive -> no page, records recovery
    expect(sendChairmanSMSFn).toHaveBeenCalledTimes(1);

    db._state.heartbeatAt = minutesAgo(150); // dead again
    await checkFleetDeadMan(db, false, sendChairmanSMSFn, NOW); // tick 4: new outage -> fires again
    expect(sendChairmanSMSFn).toHaveBeenCalledTimes(2);
  });

  it('TS-10: two sequential ticks against the same outage never double-fire (serialized by the cron concurrency group)', async () => {
    const db = makeDeadManDb({ heartbeatAt: minutesAgo(150), completions: 0 });
    const sendChairmanSMSFn = vi.fn().mockResolvedValue({ sent: true });
    await checkFleetDeadMan(db, false, sendChairmanSMSFn, NOW);
    await checkFleetDeadMan(db, false, sendChairmanSMSFn, NOW);
    expect(sendChairmanSMSFn).toHaveBeenCalledTimes(1);
  });

  it('FR-3: writes a verdict row to system_events on every run, whether or not the state changed', async () => {
    const db = makeDeadManDb({ heartbeatAt: minutesAgo(5), completions: 0 });
    await checkFleetDeadMan(db, false, vi.fn(), NOW);
    await checkFleetDeadMan(db, false, vi.fn(), NOW);
    expect(db._inserted.length).toBe(2);
    expect(db._inserted.every((r) => r.event_type === 'fleet_dead_man_verdict')).toBe(true);
  });
});
