// SD-LEO-INFRA-FLEET-DOWN-EMAIL-ALERT-001 — pure decision logic for the fleet-down operator alert.
// Oscillation-robust (sustained window, not point-in-time), claimable-gated, and edge-trigger-deduped
// so a long outage emails once rather than every 15-min run.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// SD-LEO-INFRA-CHAIRMAN-QUIET-WINDOW-001 (E1): checkDeadCoordinator's send branch now
// resolves the chairman's zone via a dynamic import; the real resolver reaches a live
// ChairmanPreferenceStore/Supabase client, which hangs in the vitest sandbox.
vi.mock('../../lib/comms/adam-outbound/quiet-hours-extension.js', () => ({
  resolveChairmanZone: vi.fn(async () => ({ zone: 'America/New_York', source: 'default' })),
}));
import {
  evaluateFleetDownAlert, evaluateDeadCoordinatorAlert, buildDeadCoordinatorMessage, checkDeadCoordinator,
  evaluateFleetDeadManPredicate, buildFleetDeadManMessage, checkFleetDeadMan,
  evaluatePerHostFreezePredicate, buildPerHostFreezeMessage, checkPerHostFreeze, recordFleetDeadManVerdict,
  fetchEligibleHosts,
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
              not: (col, op, val) => { calls.hbNotFilter = [col, op, val]; return {
                order: (col2) => { calls.hbOrderCol = col2; return {
                  limit: async () => ({ data: state.heartbeatAt ? [{ heartbeat_at: state.heartbeatAt }] : [], error: null }),
                }; },
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
              if (state.insertError) return { data: null, error: { message: state.insertError } };
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
    expect(db._calls.hbNotFilter).toEqual(['heartbeat_at', 'is', null]);
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

  it('TESTING sub-agent finding: a PostgREST-level insert rejection (not a thrown exception) is caught and logged, never silently swallowed', async () => {
    // supabase-js resolves {data:null, error:{...}} on a constraint/RLS rejection instead of
    // throwing -- a naive `await db.from(...).insert(...)` with no destructuring would let that
    // vanish silently. Assert the error surfaces via console.error.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = makeDeadManDb({ heartbeatAt: minutesAgo(150), completions: 0 });
    db._state.insertError = 'permission denied for table system_events';
    const sendChairmanSMSFn = vi.fn().mockResolvedValue({ sent: true });
    await checkFleetDeadMan(db, false, sendChairmanSMSFn, NOW);
    expect(errSpy.mock.calls.join(' ')).toMatch(/verdict recording failed/);
    expect(errSpy.mock.calls.join(' ')).toMatch(/permission denied/);
    // Fails OPEN: the page still fires even though the audit write itself was rejected.
    expect(sendChairmanSMSFn).toHaveBeenCalledTimes(1);
    errSpy.mockRestore();
  });
});

// SD-LEO-INFRA-FLEET-DOWN-ALERT-001 FR-2/FR-3: the per-host, Leg-A-only companion check.
describe('evaluatePerHostFreezePredicate (SD-LEO-INFRA-FLEET-DOWN-ALERT-001 FR-2)', () => {
  const NOW = new Date('2026-08-21T16:00:00.000Z');
  const minutesAgo = (m) => new Date(NOW.getTime() - m * 60000).toISOString();

  it('is dead when the host has no recorded heartbeat', () => {
    const r = evaluatePerHostFreezePredicate({ hostname: 'ghost-host', lastHeartbeatAtForHost: null, now: NOW });
    expect(r.dead).toBe(true);
    expect(r.reason).toMatch(/no heartbeat recorded/);
  });

  it('is alive when the heartbeat is within the window', () => {
    const r = evaluatePerHostFreezePredicate({ hostname: 'Legion-Laptop', lastHeartbeatAtForHost: minutesAgo(5), now: NOW, windowMin: 120 });
    expect(r.dead).toBe(false);
  });

  it('is dead when the heartbeat is stale beyond the window', () => {
    const r = evaluatePerHostFreezePredicate({ hostname: 'some-host', lastHeartbeatAtForHost: minutesAgo(150), now: NOW, windowMin: 120 });
    expect(r.dead).toBe(true);
    expect(r.reason).toMatch(/no heartbeat for/);
  });

  it('buildPerHostFreezeMessage names the specific host and host-scopes the dedupeKey (mirrors buildDeadCoordinatorMessage/buildFleetDeadManMessage convention above)', () => {
    const verdict = evaluatePerHostFreezePredicate({ hostname: 'stale-host', lastHeartbeatAtForHost: minutesAgo(150), now: NOW, windowMin: 120 });
    const msg = buildPerHostFreezeMessage('stale-host', verdict, NOW);
    expect(msg.body).toMatch(/HOST DOWN: stale-host/);
    expect(msg.kind).toBe('fleet_dead_man_alert');
    expect(msg.dedupeKey).toBe(`fleet-dead-man-host-stale-host-${NOW.toISOString().slice(0, 13)}`);
  });

  it('SECURITY sub-agent finding (Finding 3, EXEC-TO-PLAN review): bounds the WHOLE composed SMS body, not just the first hostname interpolation, but keeps the dedupeKey keyed on the untruncated original', () => {
    // verdict.reason (built by evaluatePerHostFreezePredicate) embeds the raw hostname A SECOND
    // TIME -- an earlier draft of this fix only truncated the first "HOST DOWN: <hostname>"
    // interpolation and left the copy inside reason unbounded. This fixture would have caught that:
    // the full 200-char hostname would still have appeared once, past the truncation point.
    const longHostname = 'x'.repeat(200);
    const verdict = evaluatePerHostFreezePredicate({ hostname: longHostname, lastHeartbeatAtForHost: minutesAgo(150), now: NOW, windowMin: 120 });
    const msg = buildPerHostFreezeMessage(longHostname, verdict, NOW);
    expect(msg.body.length).toBeLessThan(220); // MAX_MESSAGE_BODY_CHARS (200) + '...(truncated)'
    expect(msg.body).not.toContain(longHostname); // the full 200-char run never survives intact
    expect(msg.body).toMatch(/\.\.\.\(truncated\)/);
    expect(msg.dedupeKey).toBe(`fleet-dead-man-host-${longHostname}-${NOW.toISOString().slice(0, 13)}`);
  });

  it('does NOT truncate a normal-length message (no false-positive truncation on legitimate alerts)', () => {
    const verdict = evaluatePerHostFreezePredicate({ hostname: 'Legion-Laptop', lastHeartbeatAtForHost: minutesAgo(150), now: NOW, windowMin: 120 });
    const msg = buildPerHostFreezeMessage('Legion-Laptop', verdict, NOW);
    expect(msg.body).not.toMatch(/\.\.\.\(truncated\)/);
    expect(msg.body).toBe('HOST DOWN: Legion-Laptop -- host Legion-Laptop: no heartbeat for 150.0min (>= 120min). Start/restart a worker session on that host.');
  });

  it('never reads or references completions -- Leg-A-only by construction (source-text pin — TESTING sub-agent finding M2)', () => {
    // A destructured single-object parameter always reports Function.length === 1 regardless of
    // how many fields the object literal has -- `.length` could never fail even if a `completions`
    // field were added to the destructure, making the old assertion a tautology. Pin the actual
    // function body text instead (mirrors this file's own "main() wiring" source-text-pin
    // convention below), so a real regression wiring Leg B into this Leg-A-only predicate is
    // visible to the test.
    // End-anchored on the function's OWN closing brace alone on its own line (column 0) -- every
    // brace inside the function body is indented under an `if`, so this cannot match early. NOT
    // anchored to whatever text happens to follow the function (a prior version anchored on
    // "\n\n/**" and silently over-matched into unrelated sibling functions the moment code was
    // inserted between this function and the next docblock -- caught when this exact test started
    // failing against a legitimate "completions" mention 100+ lines away).
    const src = readFileSync(fileURLToPath(new URL('../../scripts/fleet-down-alert.mjs', import.meta.url)), 'utf8');
    const match = src.match(/export function evaluatePerHostFreezePredicate\([\s\S]*?\n\}\n/);
    expect(match).not.toBeNull();
    const body = match[0];
    expect(body).not.toMatch(/completions/);
    expect(body).not.toMatch(/strategic_directives_v2/);
  });
});

describe('fetchEligibleHosts (SD-LEO-INFRA-FLEET-DOWN-ALERT-001 FR-2 host eligibility)', () => {
  const NOW = new Date('2026-08-21T16:00:00.000Z');
  const minutesAgo = (m) => new Date(NOW.getTime() - m * 60000).toISOString();

  // Projects each row down to the requested column list, mirroring
  // tests/unit/fleet/fleet-down-pager-freeze-reachability.test.js's own projecting fake -- a real
  // regression that narrows fetchEligibleHosts' .select(...) argument must be visible to a test,
  // not silently absorbed by a double that ignores what it was asked to return (TESTING sub-agent
  // finding H2, EXEC-phase review).
  const project = (rowsIn, cols) => {
    const keep = cols.split(',').map((c) => c.trim());
    return rowsIn.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => keep.includes(k))));
  };

  function makeSessionsDb(rows) {
    const calls = {};
    return {
      _calls: calls,
      from: (table) => {
        if (table !== 'claude_sessions') throw new Error(`unexpected table: ${table}`);
        return {
          select: (cols) => { calls.select = cols; return {
            not: (col, op, val) => { calls.notFilter = [col, op, val]; return {
              gte: (col2, val2) => { calls.gte = [col2, val2]; return {
                order: () => ({
                  limit: async () => ({ data: project(rows, cols), error: null }),
                }),
              }; },
            }; },
          }; },
        };
      },
    };
  }

  it('TS-4: excludes NULL hostname rows at the query (not by post-hoc grouping)', async () => {
    const db = makeSessionsDb([]);
    await fetchEligibleHosts(db, NOW);
    expect(db._calls.notFilter).toEqual(['hostname', 'is', null]);
  });

  it('applies the recency window at the query so long-dead hosts never reach the eligibility map', async () => {
    const db = makeSessionsDb([]);
    await fetchEligibleHosts(db, NOW);
    expect(db._calls.gte[0]).toBe('heartbeat_at');
    const windowStart = new Date(db._calls.gte[1]);
    const impliedWindowMin = (NOW.getTime() - windowStart.getTime()) / 60000;
    expect(impliedWindowMin).toBeCloseTo(4 * 60, 0); // HOST_ELIGIBILITY_WINDOW_MIN default (H1 fix: 24h -> 4h)
  });

  it('groups to one entry per host, keeping the NEWEST heartbeat_at (rows arrive newest-first)', async () => {
    const db = makeSessionsDb([
      { hostname: 'Legion-Laptop', heartbeat_at: minutesAgo(1) },
      { hostname: 'Legion-Laptop', heartbeat_at: minutesAgo(20) }, // older duplicate, must be ignored
      { hostname: 'second-host', heartbeat_at: minutesAgo(300) },
    ]);
    const result = await fetchEligibleHosts(db, NOW);
    expect(result.size).toBe(2);
    expect(result.get('Legion-Laptop')).toBe(minutesAgo(1));
    expect(result.get('second-host')).toBe(minutesAgo(300));
  });

  it('is total on a query failure -- throws rather than silently returning an empty map (caller decides fail-open behavior)', async () => {
    const db = { from: () => ({ select: () => ({ not: () => ({ gte: () => ({ order: () => ({ limit: async () => ({ data: null, error: { message: 'boom' } }) }) }) }) }) }) };
    await expect(fetchEligibleHosts(db, NOW)).rejects.toThrow('boom');
  });

  it('orders DESCENDING by heartbeat_at (source-text pin — TESTING sub-agent finding M1, mutation-confirmed)', () => {
    // Mutation-confirmed blind spot: flipping this to ascending:true survives every behavioral test
    // in this suite (grouping-by-newest-first only reads the FIRST occurrence per host, so a mock
    // fixture with one row per host can't distinguish the two orderings). Under ascending:true in
    // production, each host's OLDEST in-window heartbeat would be recorded instead of its newest --
    // a live host reads as long-stale -> mass false pages. Pin the literal shipped argument so a
    // regression is visible without depending on fixture shape.
    const src = readFileSync(fileURLToPath(new URL('../../scripts/fleet-down-alert.mjs', import.meta.url)), 'utf8');
    const fn = src.slice(src.indexOf('export async function fetchEligibleHosts'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toMatch(/\.order\(\s*'heartbeat_at'\s*,\s*\{\s*ascending:\s*false\s*\}\s*\)/);
  });
});

describe('checkPerHostFreeze (SD-LEO-INFRA-FLEET-DOWN-ALERT-001 FR-2/FR-3 integration)', () => {
  const NOW = new Date('2026-08-21T16:00:00.000Z');
  const minutesAgo = (m) => new Date(NOW.getTime() - m * 60000).toISOString();

  // A 2-table router double: claude_sessions (eligible-host query) and system_events (per-host
  // verdict read-back + write, supporting the double .eq(event_type).eq(payload->>host) chain the
  // real host-scoped query uses -- the existing makeDeadManDb() double only supports a single .eq().
  // Projects rows down to the requested column list (see the identical `project` helper in the
  // fetchEligibleHosts describe block above) -- both doubles in this function ignored their
  // .select(...) argument until the TESTING sub-agent's H2 finding: a real regression narrowing
  // recordFleetDeadManVerdict's .select('payload') would silently make lastState undefined ->
  // transitioned always true -> the dedup mechanism defeated, with every test still green.
  const project = (rowsIn, cols) => {
    const keep = cols.split(',').map((c) => c.trim());
    return rowsIn.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => keep.includes(k))));
  };

  function makeHostDb({ sessions = [], priorEvents = [], insertError = null } = {}) {
    const events = [...priorEvents];
    const inserted = [];
    return {
      _events: events, _inserted: inserted,
      from(table) {
        if (table === 'claude_sessions') {
          return {
            select: (cols) => ({
              not: () => ({
                gte: () => ({
                  order: () => ({
                    limit: async () => ({ data: project(sessions, cols), error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'system_events') {
          return {
            select: (cols) => ({
              eq: (col1, val1) => {
                const byType = events.filter((e) => e.event_type === val1);
                return {
                  eq: (col2, val2) => {
                    const byHost = byType.filter((e) => e.payload?.host === val2);
                    return { order: () => ({ limit: async () => ({ data: project(byHost.slice(0, 1), cols), error: null }) }) };
                  },
                  order: () => ({ limit: async () => ({ data: project(byType.slice(0, 1), cols), error: null }) }),
                };
              },
            }),
            insert: async (row) => {
              if (insertError) return { data: null, error: { message: insertError } };
              const full = { ...row, created_at: new Date().toISOString() };
              inserted.push(full); events.unshift(full);
              return { data: null, error: null };
            },
          };
        }
        throw new Error(`unexpected table in per-host test double: ${table}`);
      },
    };
  }

  it('TS-3: a 2-host fixture (one all-stale, one healthy) pages only the stale host', async () => {
    const db = makeHostDb({ sessions: [
      { hostname: 'stale-host', heartbeat_at: minutesAgo(150) },
      { hostname: 'Legion-Laptop', heartbeat_at: minutesAgo(1) },
    ] });
    const sendChairmanSMSFn = vi.fn().mockResolvedValue({ sent: true });
    await checkPerHostFreeze(db, false, sendChairmanSMSFn, NOW);
    expect(sendChairmanSMSFn).toHaveBeenCalledTimes(1);
    const [message] = sendChairmanSMSFn.mock.calls[0];
    expect(message.body).toMatch(/stale-host/);
    expect(message.dedupeKey).toMatch(/^fleet-dead-man-host-stale-host-/);
  });

  it('TS-4 (defense-in-depth): a real-but-unrecognized single-row host still pages if genuinely stale -- eligibility is decided upstream by fetchEligibleHosts, not by name', async () => {
    // fetchEligibleHosts (the real query) excludes long-dead hosts BEFORE this function ever sees
    // them; this test proves checkPerHostFreeze itself has no name-based special-casing, so an
    // unrecognized-but-eligible hostname is treated identically to any other.
    const db = makeHostDb({ sessions: [{ hostname: 'h', heartbeat_at: minutesAgo(200) }] });
    const sendChairmanSMSFn = vi.fn().mockResolvedValue({ sent: true });
    await checkPerHostFreeze(db, false, sendChairmanSMSFn, NOW);
    expect(sendChairmanSMSFn).toHaveBeenCalledTimes(1);
  });

  it('TS-5: per-host edge-trigger dedup -- Host A recovering does not affect Host B staying dead, and neither reads the other\'s row', async () => {
    const db = makeHostDb({ sessions: [
      { hostname: 'host-a', heartbeat_at: minutesAgo(1) }, // recovered
      { hostname: 'host-b', heartbeat_at: minutesAgo(150) }, // still dead
    ], priorEvents: [
      { event_type: 'fleet_dead_man_verdict_per_host', payload: { host: 'host-a', state: 'dead' } },
      { event_type: 'fleet_dead_man_verdict_per_host', payload: { host: 'host-b', state: 'dead' } },
    ] });
    const sendChairmanSMSFn = vi.fn().mockResolvedValue({ sent: true });
    await checkPerHostFreeze(db, false, sendChairmanSMSFn, NOW);
    // host-b is still dead AND was already dead (transitioned=false) -> suppressed, no new page.
    // host-a recovered (alive, transitioned=true) -> no page either (only dead+transitioned pages).
    expect(sendChairmanSMSFn).not.toHaveBeenCalled();
    const hostAInsert = db._inserted.find((r) => r.payload.host === 'host-a');
    const hostBInsert = db._inserted.find((r) => r.payload.host === 'host-b');
    expect(hostAInsert.payload.state).toBe('alive');
    expect(hostAInsert.payload.transitioned).toBe(true);
    expect(hostBInsert.payload.state).toBe('dead');
    expect(hostBInsert.payload.transitioned).toBe(false);
  });

  it('SECURITY sub-agent finding (Finding 1, EXEC-TO-PLAN review): caps chairman SMS volume at MAX_HOSTS_PAGED_PER_RUN (default 5) even with 6 simultaneously-dead hosts, and records nothing for the host beyond the cap', async () => {
    // claude_sessions carries permissive anon RLS -- an attacker could otherwise insert thousands
    // of fabricated hostnames and turn this arm into an unbounded chairman-SMS-bombing vector. This
    // fixture (6 dead hosts, default cap 5) proves the bound holds without needing an env override.
    const sessions = Array.from({ length: 6 }, (_, i) => ({ hostname: `dead-host-${i}`, heartbeat_at: minutesAgo(150) }));
    const db = makeHostDb({ sessions });
    const sendChairmanSMSFn = vi.fn().mockResolvedValue({ sent: true });
    await checkPerHostFreeze(db, false, sendChairmanSMSFn, NOW);
    expect(sendChairmanSMSFn).toHaveBeenCalledTimes(5);
    // The 6th host got NO system_events row this run (not just no page) -- so it is left eligible
    // to compete for a cap slot on the NEXT run instead of being permanently latched out.
    expect(db._inserted.length).toBe(5);
    const pagedHostnames = sendChairmanSMSFn.mock.calls.map(([msg]) => msg.body);
    const skippedHost = sessions.map((s) => s.hostname).find((h) => !pagedHostnames.some((body) => body.includes(h)));
    expect(db._inserted.some((r) => r.payload.host === skippedHost)).toBe(false);
  });

  it('a healthy host never counts against the dead-host cap, even alongside 6 dead hosts', async () => {
    const sessions = [
      { hostname: 'Legion-Laptop', heartbeat_at: minutesAgo(1) },
      ...Array.from({ length: 6 }, (_, i) => ({ hostname: `dead-host-${i}`, heartbeat_at: minutesAgo(150) })),
    ];
    const db = makeHostDb({ sessions });
    const sendChairmanSMSFn = vi.fn().mockResolvedValue({ sent: true });
    await checkPerHostFreeze(db, false, sendChairmanSMSFn, NOW);
    expect(sendChairmanSMSFn).toHaveBeenCalledTimes(5); // still capped at 5, the healthy host is separate
    // 5 dead + 1 alive = 6 rows recorded; only the 6th DEAD host is skipped.
    expect(db._inserted.length).toBe(6);
    expect(db._inserted.some((r) => r.payload.host === 'Legion-Laptop' && r.payload.state === 'alive')).toBe(true);
  });

  it('excludes hosts fetchEligibleHosts did not return (query-level filtering, not this function\'s job)', async () => {
    // fetchEligibleHosts is responsible for the recency/NULL filtering (its own dedicated unit
    // tests below cover that); this integration test only proves checkPerHostFreeze iterates
    // exactly the hosts it is handed.
    const db = makeHostDb({ sessions: [{ hostname: 'only-this-one', heartbeat_at: minutesAgo(150) }] });
    const sendChairmanSMSFn = vi.fn().mockResolvedValue({ sent: true });
    await checkPerHostFreeze(db, false, sendChairmanSMSFn, NOW);
    expect(sendChairmanSMSFn).toHaveBeenCalledTimes(1);
    expect(sendChairmanSMSFn.mock.calls[0][0].body).toMatch(/only-this-one/);
  });

  it('TESTING sub-agent finding pattern: a PostgREST-level insert rejection is caught and logged per-host, fails open', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = makeHostDb({ sessions: [{ hostname: 'stale-host', heartbeat_at: minutesAgo(150) }], insertError: 'permission denied for table system_events' });
    const sendChairmanSMSFn = vi.fn().mockResolvedValue({ sent: true });
    await checkPerHostFreeze(db, false, sendChairmanSMSFn, NOW);
    expect(errSpy.mock.calls.join(' ')).toMatch(/host=stale-host/);
    expect(sendChairmanSMSFn).toHaveBeenCalledTimes(1); // fails open: pages despite the audit-write rejection
    errSpy.mockRestore();
  });
});

describe('recordFleetDeadManVerdict host-parameter backward compatibility (FR-3)', () => {
  it('calling with no host argument uses the ORIGINAL global event_type and unfiltered read, byte-identical to pre-FR-3 behavior', async () => {
    const eqCalls = [];
    const db = {
      from: () => ({
        select: () => ({
          eq: (col, val) => { eqCalls.push([col, val]); return { order: () => ({ limit: async () => ({ data: [], error: null }) }) }; },
        }),
        insert: async (row) => { eqCalls.push(['INSERT', row.event_type]); return { data: null, error: null }; },
      }),
    };
    await recordFleetDeadManVerdict(db, { dead: true, reason: 'test' });
    expect(eqCalls[0]).toEqual(['event_type', 'fleet_dead_man_verdict']);
    expect(eqCalls[1]).toEqual(['INSERT', 'fleet_dead_man_verdict']);
    // Exactly one .eq() call on the read side (no second .eq for payload->>host) -- proves the
    // global path issues the SAME query shape as before FR-3.
    expect(eqCalls.filter((c) => c[0] === 'event_type' || c[0] === 'payload->>host').length).toBe(1);
  });

  it('calling WITH a host argument uses the per-host event_type and adds the payload->>host filter', async () => {
    const eqCalls = [];
    const db = {
      from: () => ({
        select: () => ({
          eq: (col, val) => { eqCalls.push([col, val]); return {
            eq: (col2, val2) => { eqCalls.push([col2, val2]); return { order: () => ({ limit: async () => ({ data: [], error: null }) }) }; },
          }; },
        }),
        insert: async (row) => { eqCalls.push(['INSERT', row.event_type, row.payload.host]); return { data: null, error: null }; },
      }),
    };
    await recordFleetDeadManVerdict(db, { dead: true, reason: 'test' }, 'some-host');
    expect(eqCalls[0]).toEqual(['event_type', 'fleet_dead_man_verdict_per_host']);
    expect(eqCalls[1]).toEqual(['payload->>host', 'some-host']);
    expect(eqCalls[2]).toEqual(['INSERT', 'fleet_dead_man_verdict_per_host', 'some-host']);
  });

  it('reads the read-back query DESCENDING by created_at (source-text pin — TESTING sub-agent finding M1 companion)', () => {
    // Same blind-spot class as fetchEligibleHosts' ordering (see the M1 pin above): the mocks in
    // this describe block return a single-element array regardless of order, so they cannot
    // distinguish ascending from descending. If this were flipped, .limit(1) would return the
    // OLDEST recorded verdict instead of the most recent, silently corrupting the edge-trigger
    // dedup this function exists to provide.
    const src = readFileSync(fileURLToPath(new URL('../../scripts/fleet-down-alert.mjs', import.meta.url)), 'utf8');
    const fn = src.slice(src.indexOf('export async function recordFleetDeadManVerdict'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toMatch(/\.order\(\s*'created_at'\s*,\s*\{\s*ascending:\s*false\s*\}\s*\)/);
  });
});

// TESTING sub-agent finding (SD-LEO-INFRA-FLEET-DEAD-MAN-001): main() isn't exported (it's a CLI
// entry point, guarded by the import.meta.url check at the bottom of the file), so no test
// previously verified the SHIPPED runAlertArms() call actually includes all three arms. Given
// this SD exists precisely because an alert arm didn't reliably fire, a source-text pin closes
// that gap without needing to invoke main() itself (which would require a live-shaped db/env).
describe('main() wiring (source-text pin — TESTING sub-agent finding)', () => {
  it('runAlertArms([...]) in main() includes all four arms, dead-coordinator-pager first (SD-LEO-INFRA-FLEET-DOWN-ALERT-001 FR-2 added fleet-dead-man-per-host-pager)', () => {
    const src = readFileSync(fileURLToPath(new URL('../../scripts/fleet-down-alert.mjs', import.meta.url)), 'utf8');
    const match = src.match(/const \{ failed \} = await runAlertArms\(\[([\s\S]*?)\]\);/);
    expect(match).not.toBeNull();
    // Adversarial-review finding: a commented-out entry (the JS parser drops it from the real
    // array, exactly the "arm silently doesn't fire" class this pin exists to catch) still reads
    // as a live entry to a naive regex over raw text. Strip `//`-to-end-of-line before matching so
    // a commented-out arm is correctly seen as ABSENT, not present.
    const armsBlock = match[1].split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');
    const armNames = [...armsBlock.matchAll(/\[\s*'([^']+)'/g)].map((m) => m[1]);
    expect(armNames).toEqual(['dead-coordinator-pager', 'fleet-dead-man-pager', 'fleet-dead-man-per-host-pager', 'worker-fleet-email']);
  });

  it('is comment-blind-proof: a commented-out arm entry is correctly seen as absent, not present', () => {
    // Regression pin for the adversarial-review finding above: without the comment-strip, this
    // synthetic sample (mirroring what main() would look like if an arm were commented out rather
    // than deleted) would still show all three names and falsely pass.
    const sample = `const { failed } = await runAlertArms([
    ['dead-coordinator-pager', () => checkDeadCoordinator(db, DRY)],
    // ['fleet-dead-man-pager', () => checkFleetDeadMan(db, DRY)],
    ['worker-fleet-email', () => checkWorkerFleetDown(db, DRY)],
  ]);`;
    const match = sample.match(/const \{ failed \} = await runAlertArms\(\[([\s\S]*?)\]\);/);
    const armsBlock = match[1].split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');
    const armNames = [...armsBlock.matchAll(/\[\s*'([^']+)'/g)].map((m) => m[1]);
    expect(armNames).toEqual(['dead-coordinator-pager', 'worker-fleet-email']);
  });
});
