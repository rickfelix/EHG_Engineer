/**
 * SD-LEO-INFRA-PERIODIC-PROCESS-LIVENESS-001 (FR-3/FR-4) -- unit coverage for
 * scripts/periodic-liveness-watcher.mjs::evaluateRow, the per-registry-row state evaluator.
 *
 * NOTE: lib/fleet/session-liveness.cjs is loaded inside the watcher via createRequire(), which
 * bypasses Vitest's ESM mock interception -- vi.mock() on that path is a silent no-op (confirmed
 * empirically: a mocked hasPidAlive()=>true was ignored and the REAL PID-marker check ran
 * instead). Rather than fight that, these tests drive evaluateRow with REAL, deterministic
 * timestamps chosen to make the actual hasFreshHeartbeat/hasTickAlive/hasPidAlive primitives
 * produce the desired signal combination -- a genuine test of the real logic, not a mock stand-in.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { observedGapStats } from '../../lib/periodic-liveness/gha-run-resolver.mjs';

const state = {
  claudeSessionsRow: null,
  // SD-LEO-INFRA-PID-LIVENESS-DURABLE-VENUE-001 (FR-3c): resolveRoleSession no longer collapses
  // the class to one row, so the claude_sessions query is now awaited directly and yields an
  // ARRAY of seats. Tests that care about a single seat keep setting claudeSessionsRow; the
  // multi-seat cases set claudeSessionsRows.
  claudeSessionsRows: null,
  schedulerRow: null,
  updateError: null,
  updateCalls: [],
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table) {
      // Per-query, because `from()` is called fresh for each: an UPDATE must still resolve to the
      // update result, not to the seat list, even though both await the same chain object.
      let isUpdate = false;
      const chain = {
        select: () => chain,
        eq: () => chain,
        or: () => chain,
        order: () => chain,
        limit: () => chain,
        neq: () => chain,
        update: (payload) => {
          state.updateCalls.push({ table, payload });
          isUpdate = true;
          return chain;
        },
        maybeSingle: async () => {
          if (table === 'claude_sessions') return { data: state.claudeSessionsRow, error: null };
          if (table === 'eva_scheduler_heartbeat') return { data: state.schedulerRow, error: null };
          return { data: null, error: null };
        },
        then: (resolve) => {
          if (!isUpdate && table === 'claude_sessions') {
            const rows = state.claudeSessionsRows
              ?? (state.claudeSessionsRow ? [state.claudeSessionsRow] : []);
            return resolve({ data: rows, error: null });
          }
          return resolve({ data: null, error: state.updateError });
        },
      };
      return chain;
    },
  }),
}));

const { evaluateRow, STATE, hasCrossedUnverifiedThreshold, UNVERIFIED_ESCALATION_MS, stampStateChangeAnchor, deriveFailureSignature } = await import('../../scripts/periodic-liveness-watcher.mjs');

function roleSessionRow(overrides = {}) {
  return {
    process_key: 'role_session:adam',
    display_name: 'Adam',
    process_type: 'role_session',
    expected_interval_seconds: 1800,
    grace_multiplier: 3,
    liveness_source: 'claude_sessions_heartbeat',
    liveness_source_ref: { metadata_filter: { role: 'adam' } },
    session_bound: true,
    currently_expected_active: true,
    last_fired_at: null,
    ...overrides,
  };
}

function schedulerRoundRow(overrides = {}) {
  return {
    process_key: 'scheduler_round:daily_digest',
    display_name: 'eva-scheduler round: daily_digest',
    process_type: 'scheduler_round',
    expected_interval_seconds: 86400,
    grace_multiplier: 3,
    liveness_source: 'eva_scheduler_heartbeat',
    liveness_source_ref: { metadata_path: 'last_round_runs', round_key: 'daily_digest' },
    session_bound: false,
    currently_expected_active: true,
    last_fired_at: null,
    ...overrides,
  };
}

function selfStampedRow(overrides = {}) {
  return {
    process_key: 'standalone:consultant-generator',
    display_name: 'Consultant generator',
    process_type: 'standalone_cron',
    expected_interval_seconds: 300,
    grace_multiplier: 3,
    liveness_source: 'self_stamped',
    liveness_source_ref: {},
    session_bound: false,
    currently_expected_active: true,
    last_fired_at: null,
    ...overrides,
  };
}

const OLD_TS = '2020-01-01T00:00:00Z'; // unambiguously stale for every signal type
const FRESH_TS = () => new Date().toISOString();

// SD-LEO-INFRA-PID-LIVENESS-DURABLE-VENUE-001 (FR-3a in the watcher).
// pid-venue.cjs also loads via createRequire(), so vi.mock() is a silent no-op on it for the same
// reason the header documents for session-liveness.cjs. evaluateRow therefore accepts an INJECTED
// venue (ctx.pidVenue) so both verdicts are drivable hermetically instead of inheriting whatever
// the machine running the suite happens to have on disk. Without this, every PID-rung assertion
// below is environment-dependent: green on a dev box with markers, red in CI without them.
const CAPABLE_VENUE = { capable: true, reason: 'marker_dir_present', markerDir: '/fake/markers', markerCount: 3 };
const BLIND_VENUE = { capable: false, reason: 'marker_dir_absent', markerDir: '/fake/markers', markerCount: 0 };

describe('evaluateRow', () => {
  beforeEach(() => {
    state.claudeSessionsRow = null;
    state.claudeSessionsRows = null;
    state.schedulerRow = null;
  });

  it('INTENTIONALLY_DOWN short-circuits when currently_expected_active=false, without querying signals', async () => {
    // No claudeSessionsRow set (would error/no-op if a signal query were attempted) -- proves the
    // short-circuit happens before any resolution.
    const row = roleSessionRow({ currently_expected_active: false });
    const result = await evaluateRow(row);
    expect(result.state).toBe(STATE.INTENTIONALLY_DOWN);
  });

  it('role_session: only heartbeat_at populated (terminal_id/process_alive_at null) -> UNVERIFIED, never OVERDUE on 1 signal', async () => {
    state.claudeSessionsRow = { heartbeat_at: OLD_TS, terminal_id: null, process_alive_at: null, is_alive: false };
    const row = roleSessionRow();
    const result = await evaluateRow(row);
    expect(result.state).toBe(STATE.UNVERIFIED);
    // FR-3c appended the seat census to this reason; the verdict itself is unchanged.
    expect(result.reason).toMatch(/^fewer_than_2_evaluable_signals/);
    expect(result.reason).toMatch(/examined 1 seat\(s\)/);
  });

  it('role_session: heartbeat + terminal_id populated, both genuinely stale -> OVERDUE', async () => {
    state.claudeSessionsRow = { heartbeat_at: OLD_TS, terminal_id: 'win-cc-1234-999999', tty: null, process_alive_at: null, is_alive: false };
    const row = roleSessionRow();
    // Venue pinned CAPABLE: in a venue where markers DO exist, "no marker for this seat" is a real
    // negative and OVERDUE is the correct verdict. Left unpinned this assertion would silently
    // become a test of the runner's own .claude/session-identity directory.
    const result = await evaluateRow(row, { pidVenue: CAPABLE_VENUE });
    expect(result.state).toBe(STATE.OVERDUE);
  });

  // ── FR-3a REGRESSION GUARD (adversarial review of PR #6537, CRITICAL) ────────────────────────
  // The PID rung's guard was `(seat.terminal_id != null || seat.session_id != null)`. session_id is
  // TEXT NOT NULL UNIQUE, so on a PRODUCTION row that condition is ALWAYS TRUE -- pidAlive could
  // never be null, and hasPidAlive() returns a bare false for "no marker exists anywhere" exactly
  // as it does for "the marker says the process is gone". The unanswerable case therefore counted
  // as a corroborating STALE signal, pushing evaluableCount to 2 and converting an honest
  // UNVERIFIED into OVERDUE -- could-not-determine coerced into death, in the very file
  // implementing FR-3c.
  //
  // The pre-existing suite could not catch it: its fixtures omit session_id, a row shape that
  // cannot occur in production. Both cases below carry session_id for that reason.
  it('FR-3a: PID-BLIND venue + production row shape (session_id present) -> UNVERIFIED, never OVERDUE', async () => {
    state.claudeSessionsRow = {
      // Synthetic and unresolvable ON PURPOSE. A first draft of this test used the authoring
      // session's REAL uuid -- which has a live marker on disk, so the capable-venue control
      // resolved a running pid and returned OK instead of OVERDUE. The negative control caught it.
      // hasPidAlive() reaches the real resolver here (createRequire bypasses vi.mock), so the id
      // must be one no marker can ever match.
      session_id: '00000000-0000-0000-0000-00000000dead', // NOT NULL in claude_sessions
      heartbeat_at: OLD_TS, terminal_id: null, tty: null, process_alive_at: null, is_alive: false,
    };
    const result = await evaluateRow(roleSessionRow(), { pidVenue: BLIND_VENUE });
    // Where no marker was ever written, the rung has NO ANSWER -- so heartbeat is the only
    // evaluable signal and the 2-signal death gate must hold.
    expect(result.state).toBe(STATE.UNVERIFIED);
    expect(result.reason).toMatch(/^fewer_than_2_evaluable_signals/);
  });

  it('FR-3a NEGATIVE CONTROL: the SAME row in a CAPABLE venue does reach OVERDUE', async () => {
    // Proves the assertion above is load-bearing rather than vacuous: the only thing that changed
    // is venue capability, and the verdict flips. If this ever stops flipping, the abstention test
    // has gone vacuous and must be fixed, not deleted.
    state.claudeSessionsRow = {
      session_id: '00000000-0000-0000-0000-00000000dead',
      heartbeat_at: OLD_TS, terminal_id: null, tty: null, process_alive_at: null, is_alive: false,
    };
    const result = await evaluateRow(roleSessionRow(), { pidVenue: CAPABLE_VENUE });
    expect(result.state).toBe(STATE.OVERDUE);
  });

  it('role_session: stale heartbeat but a genuinely fresh process_alive_at tick -> OK (2nd signal saves it)', async () => {
    state.claudeSessionsRow = { heartbeat_at: OLD_TS, terminal_id: null, process_alive_at: FRESH_TS(), is_alive: false };
    const row = roleSessionRow();
    const result = await evaluateRow(row);
    expect(result.state).toBe(STATE.OK);
  });

  it('role_session: fresh heartbeat alone (only 1 evaluable signal, but it is fresh) -> OK, not UNVERIFIED', async () => {
    // A single FRESH signal is unambiguous positive evidence -- the 2+-signal gate protects the
    // DEATH declaration only, never blocks a legitimate ALIVE read on "not enough signals".
    state.claudeSessionsRow = { heartbeat_at: FRESH_TS(), terminal_id: null, process_alive_at: null, is_alive: false };
    const row = roleSessionRow();
    const result = await evaluateRow(row);
    expect(result.state).toBe(STATE.OK);
  });

  // ── SD-LEO-INFRA-PID-LIVENESS-DURABLE-VENUE-001 (FR-3c) ────────────────────────────────────
  // The measured residual: the class probe used to end in
  //   .order('heartbeat_at', {ascending:false}).limit(1).maybeSingle()
  // so ONE seat spoke for the whole class — and the DESC ordering selected FOR the pathology,
  // because a dead seat whose immortal tick kept stamping fresh heartbeats sorts FIRST. The SD
  // measured 5 dead seats and found only 1 marked; this is the shape that produced that.
  it('role_session: 4 dead seats hiding behind 1 forged-fresh seat are ALL examined and named', async () => {
    const deadSeat = (n) => ({
      session_id: `dead-${n}`,
      heartbeat_at: OLD_TS,
      terminal_id: 'win-cc-1234-999999', // unresolvable pid => a real, evaluable "not alive"
      tty: null,
      process_alive_at: OLD_TS,
      is_alive: false,
    });
    state.claudeSessionsRows = [
      // Sorts FIRST under the old heartbeat_at DESC ordering — the forged-fresh seat that used to
      // be the only row examined, and which reported OK for the entire class.
      { session_id: 'forged-fresh', heartbeat_at: FRESH_TS(), terminal_id: null, process_alive_at: null, is_alive: false },
      deadSeat(1), deadSeat(2), deadSeat(3), deadSeat(4),
    ];

    const result = await evaluateRow(roleSessionRow());

    // Class-level verdict is unchanged and still OK — something in the class IS alive, and this
    // file's existing rule is that a single fresh signal is unambiguous positive evidence.
    expect(result.state).toBe(STATE.OK);

    // THE POINT: the other four are no longer invisible. Under the old probe these four rows were
    // never read at all, on any run, however durable the invoker.
    expect(result.seats_examined).toBe(5);
    expect(result.dead_seat_ids).toEqual(['dead-1', 'dead-2', 'dead-3', 'dead-4']);
    expect(result.reason).toMatch(/examined 5 seat\(s\), 1 alive/);
    expect(result.reason).toMatch(/4 evaluable-but-not-alive/);
  });

  it('role_session: a class where every seat is alive names NO dead seats (negative control)', async () => {
    // Without this, "always report 4 dead" would satisfy the test above. The census must track the
    // population, not decorate every verdict with a fixed alarm.
    state.claudeSessionsRows = [
      { session_id: 'a', heartbeat_at: FRESH_TS(), terminal_id: null, process_alive_at: null, is_alive: false },
      { session_id: 'b', heartbeat_at: FRESH_TS(), terminal_id: null, process_alive_at: null, is_alive: false },
    ];
    const result = await evaluateRow(roleSessionRow());
    expect(result.state).toBe(STATE.OK);
    expect(result.seats_examined).toBe(2);
    expect(result.dead_seat_ids).toEqual([]);
    expect(result.reason).toMatch(/examined 2 seat\(s\), 2 alive/);
    expect(result.reason).not.toMatch(/evaluable-but-not-alive/);
  });

  it('scheduler_round: stale round-key timestamp beyond interval*grace -> OVERDUE (no 2-signal requirement)', async () => {
    state.schedulerRow = { last_poll_at: FRESH_TS(), metadata: { last_round_runs: { daily_digest: Date.now() - 10 * 86400 * 1000 } } };
    const row = schedulerRoundRow();
    const result = await evaluateRow(row);
    expect(result.state).toBe(STATE.OVERDUE);
  });

  it('scheduler_round: fresh round-key timestamp within interval*grace -> OK', async () => {
    state.schedulerRow = { last_poll_at: FRESH_TS(), metadata: { last_round_runs: { daily_digest: Date.now() - 60 * 1000 } } };
    const row = schedulerRoundRow();
    const result = await evaluateRow(row);
    expect(result.state).toBe(STATE.OK);
  });

  it('scheduler_round: instance-agnostic resolution -- resolves against whatever row is live regardless of any instance_id in liveness_source_ref', async () => {
    state.schedulerRow = { last_poll_at: FRESH_TS(), metadata: { last_round_runs: { daily_digest: Date.now() - 60 * 1000 } } };
    const row = schedulerRoundRow({ liveness_source_ref: { instance_id: 'some-stale-old-instance-id', metadata_path: 'last_round_runs', round_key: 'daily_digest' } });
    const result = await evaluateRow(row);
    expect(result.state).toBe(STATE.OK); // resolved via the live row, not blocked by the stale instance_id
  });

  it('self_stamped: uses the row own last_fired_at directly, no external resolution', async () => {
    const row = selfStampedRow({ last_fired_at: OLD_TS, expected_interval_seconds: 300, grace_multiplier: 3 });
    const result = await evaluateRow(row);
    expect(result.state).toBe(STATE.OVERDUE);
  });

  it('self_stamped: fresh last_fired_at -> OK', async () => {
    const row = selfStampedRow({ last_fired_at: FRESH_TS(), expected_interval_seconds: 300, grace_multiplier: 3 });
    const result = await evaluateRow(row);
    expect(result.state).toBe(STATE.OK);
  });

  it('self_stamped: null last_fired_at (never fired) -> UNVERIFIED, not a false OK or OVERDUE', async () => {
    const row = selfStampedRow({ last_fired_at: null });
    const result = await evaluateRow(row);
    expect(result.state).toBe(STATE.UNVERIFIED);
    expect(result.reason).toBe('no_last_fired_data_available');
  });

  // SD-FDBK-ENH-CENTRAL-LIVENESS-STAMPER-001 (FR-2) -- github_actions_api branch. Decisions are
  // pre-resolved once per watcher run (see main()) and passed in via ctx.ghaDecisions, so these
  // tests exercise evaluateRow's consumption of that map directly (no live GitHub API call).
  function ghaCronRow(overrides = {}) {
    return {
      process_key: 'gha_cron:foo.yml',
      display_name: 'foo cron',
      process_type: 'standalone_cron',
      expected_interval_seconds: 3600,
      grace_multiplier: 3,
      liveness_source: 'github_actions_api',
      liveness_source_ref: {},
      session_bound: false,
      currently_expected_active: true,
      last_fired_at: null,
      ...overrides,
    };
  }

  it('github_actions_api: TS-1 a "stamp" decision with a fresh ranAtIso -> OK', async () => {
    const row = ghaCronRow();
    const ghaDecisions = new Map([[row.process_key, { processKey: row.process_key, decision: 'stamp', ranAtIso: FRESH_TS() }]]);
    const result = await evaluateRow(row, { ghaDecisions });
    expect(result.state).toBe(STATE.OK);
  });

  it('github_actions_api: TS-2 an "overdue" decision (latest scheduled run failed) -> OVERDUE, not UNVERIFIED', async () => {
    const row = ghaCronRow();
    const ghaDecisions = new Map([[row.process_key, { processKey: row.process_key, decision: 'overdue', ranAtIso: OLD_TS }]]);
    const result = await evaluateRow(row, { ghaDecisions });
    expect(result.state).toBe(STATE.OVERDUE);
    expect(result.reason).toBe('latest_scheduled_run_failed');
  });

  it('github_actions_api: TS-3 no decision available (resolver fetch failed / not in map) -> UNVERIFIED, degrades to today\'s state', async () => {
    const row = ghaCronRow();
    const result = await evaluateRow(row, { ghaDecisions: new Map() });
    expect(result.state).toBe(STATE.UNVERIFIED);
    expect(result.reason).toBe('no_gha_run_data_available');
  });

  it('github_actions_api: a "no_data" decision (workflow registered but no matching run found) -> UNVERIFIED', async () => {
    const row = ghaCronRow();
    const ghaDecisions = new Map([[row.process_key, { processKey: row.process_key, decision: 'no_data' }]]);
    const result = await evaluateRow(row, { ghaDecisions });
    expect(result.state).toBe(STATE.UNVERIFIED);
  });

  it('github_actions_api: a "stamp" decision old enough to exceed interval*grace -> OVERDUE (generic age check still applies)', async () => {
    const row = ghaCronRow({ expected_interval_seconds: 300, grace_multiplier: 3 });
    const ghaDecisions = new Map([[row.process_key, { processKey: row.process_key, decision: 'stamp', ranAtIso: OLD_TS }]]);
    const result = await evaluateRow(row, { ghaDecisions });
    expect(result.state).toBe(STATE.OVERDUE);
  });

  // QF-20260823-631: GitHub delivers a declared */5 workflow's scheduled runs 5-6x slower than
  // declared (measured 23-30min gaps against a 300s/grace=3 => 900s/15min threshold), so the
  // generic age check false-OVERDUEs a healthy workflow. github_actions_api rows must floor the
  // effective grace multiplier at 6x regardless of the declared value.
  it('github_actions_api: a 20-min-old "stamp" with declared grace=3 (900s/15min threshold) does NOT breach -- measured-delivery floor applies', async () => {
    const ranAt = new Date('2026-08-23T15:00:00Z');
    const now = new Date(ranAt.getTime() + 20 * 60 * 1000); // 20 minutes later
    const row = ghaCronRow({ expected_interval_seconds: 300, grace_multiplier: 3 });
    const ghaDecisions = new Map([[row.process_key, { processKey: row.process_key, decision: 'stamp', ranAtIso: ranAt.toISOString() }]]);
    const result = await evaluateRow(row, { ghaDecisions, now: now.getTime() });
    expect(result.state).toBe(STATE.OK);
  });

  it('github_actions_api: a declared grace_multiplier ABOVE the floor (e.g. 10) is not weakened by the floor', async () => {
    const ranAt = new Date('2026-08-23T15:00:00Z');
    const now = new Date(ranAt.getTime() + 45 * 60 * 1000); // 45 minutes later -- within 10x(300s)=50min, beyond 6x(300s)=30min
    const row = ghaCronRow({ expected_interval_seconds: 300, grace_multiplier: 10 });
    const ghaDecisions = new Map([[row.process_key, { processKey: row.process_key, decision: 'stamp', ranAtIso: ranAt.toISOString() }]]);
    const result = await evaluateRow(row, { ghaDecisions, now: now.getTime() });
    expect(result.state).toBe(STATE.OK);
  });

  it('self_stamped: the github_actions_api measured-delivery floor does NOT apply to other liveness sources', async () => {
    const firedAt = new Date('2026-08-23T15:00:00Z');
    const now = new Date(firedAt.getTime() + 20 * 60 * 1000); // 20 minutes later -- beyond 300s*3=15min, would false-OK if floored to 6x
    const row = selfStampedRow({ last_fired_at: firedAt.toISOString(), expected_interval_seconds: 300, grace_multiplier: 3 });
    const result = await evaluateRow(row, { now: now.getTime() });
    expect(result.state).toBe(STATE.OVERDUE);
  });

  // QF-20260824-373: the QF-631 fix's fixed GHA_GRACE_MULTIPLIER_FLOOR=6 (30min threshold on a
  // declared 300s workflow) recurred after shipping -- overnight GitHub scheduler throttling
  // produced WORSE gaps than the one daytime incident it was measured from. Real evidence: three
  // successful sms-relay-drain-cron.yml runs at 05:37, 06:22, 07:35Z (gaps 45min, then 73min).
  // Regression (per the QF's own instruction): replay that run history through the derivation and
  // assert no false breach on a comparable future gap once it is in the fetched window.
  it('github_actions_api: QF-20260824-373 replay of the 05:37/06:22/07:35Z overnight gaps -- observedGapStats floors a comparable future gap OK', async () => {
    const row = ghaCronRow({ process_key: 'gha_cron:sms-relay-drain-cron.yml', expected_interval_seconds: 300, grace_multiplier: 3 });
    const runs = [
      { path: '.github/workflows/sms-relay-drain-cron.yml', created_at: '2026-08-24T05:37:00Z', run_started_at: '2026-08-24T05:37:00Z', conclusion: 'success' },
      { path: '.github/workflows/sms-relay-drain-cron.yml', created_at: '2026-08-24T06:22:00Z', run_started_at: '2026-08-24T06:22:00Z', conclusion: 'success' },
      { path: '.github/workflows/sms-relay-drain-cron.yml', created_at: '2026-08-24T07:35:00Z', run_started_at: '2026-08-24T07:35:00Z', conclusion: 'success' },
    ];
    const ghaGapStats = observedGapStats(runs); // max observed gap = 73min (06:22 -> 07:35)
    const lastRun = new Date('2026-08-24T07:35:00Z');
    // A later night's comparable 80min gap (beyond the old 30min static floor, inside the new
    // 73min*1.2=87.6min observed-gap floor).
    const now = new Date(lastRun.getTime() + 80 * 60 * 1000);
    const ghaDecisions = new Map([[row.process_key, { processKey: row.process_key, decision: 'stamp', ranAtIso: lastRun.toISOString() }]]);
    const result = await evaluateRow(row, { ghaDecisions, ghaGapStats, now: now.getTime() });
    expect(result.state).toBe(STATE.OK);
  });

  it('github_actions_api: QF-20260824-373 without ghaGapStats, the SAME 80min gap still false-OVERDUEs on the old static floor alone (proves the new floor is load-bearing)', async () => {
    const row = ghaCronRow({ process_key: 'gha_cron:sms-relay-drain-cron.yml', expected_interval_seconds: 300, grace_multiplier: 3 });
    const lastRun = new Date('2026-08-24T07:35:00Z');
    const now = new Date(lastRun.getTime() + 80 * 60 * 1000);
    const ghaDecisions = new Map([[row.process_key, { processKey: row.process_key, decision: 'stamp', ranAtIso: lastRun.toISOString() }]]);
    const result = await evaluateRow(row, { ghaDecisions, now: now.getTime() }); // no ghaGapStats
    expect(result.state).toBe(STATE.OVERDUE);
  });
});

// SD-FDBK-ENH-CENTRAL-LIVENESS-STAMPER-001 (FR-5) -- hasCrossedUnverifiedThreshold (TS-6/TS-8).
describe('hasCrossedUnverifiedThreshold', () => {
  it('TS-6: >7 days since last_state_changed_at, and the previous tick was still within 7 days -> true (fresh crossing)', () => {
    const changedAtMs = Date.parse('2026-07-10T00:00:00Z');
    const row = {
      last_state_changed_at: '2026-07-10T00:00:00Z',
      updated_at: new Date(changedAtMs + UNVERIFIED_ESCALATION_MS - 60 * 60 * 1000).toISOString(), // previous tick: 6d23h in
    };
    const nowMs = changedAtMs + UNVERIFIED_ESCALATION_MS + 60 * 60 * 1000; // now: 7d1h in
    expect(hasCrossedUnverifiedThreshold(row, nowMs)).toBe(true);
  });

  it('TS-6: <=7 days since last_state_changed_at -> false (not yet escalated)', () => {
    const nowMs = Date.parse('2026-07-15T00:00:00Z');
    const row = { last_state_changed_at: '2026-07-10T00:00:00Z', updated_at: '2026-07-14T23:45:00Z' };
    expect(hasCrossedUnverifiedThreshold(row, nowMs)).toBe(false);
  });

  it('TS-8: fires only on the tick where the threshold is FIRST crossed, not on every subsequent tick', () => {
    const changedAt = '2026-07-10T00:00:00Z';
    const changedAtMs = Date.parse(changedAt);
    // Tick that lands exactly on the crossing: previous tick (updated_at) was still <=7d old,
    // this tick's "now" is >7d old.
    const crossingTick = {
      row: { last_state_changed_at: changedAt, updated_at: new Date(changedAtMs + UNVERIFIED_ESCALATION_MS - 60_000).toISOString() },
      nowMs: changedAtMs + UNVERIFIED_ESCALATION_MS + 60_000,
    };
    expect(hasCrossedUnverifiedThreshold(crossingTick.row, crossingTick.nowMs)).toBe(true);

    // A LATER tick, still in the same continuous UNVERIFIED episode: the previous tick
    // (updated_at) is now ALSO past the threshold -- must not re-fire.
    const laterTick = {
      row: { last_state_changed_at: changedAt, updated_at: new Date(changedAtMs + UNVERIFIED_ESCALATION_MS + 60_000).toISOString() },
      nowMs: changedAtMs + UNVERIFIED_ESCALATION_MS + 120_000,
    };
    expect(hasCrossedUnverifiedThreshold(laterTick.row, laterTick.nowMs)).toBe(false);
  });

  it('no last_state_changed_at recorded -> false (nothing to measure against)', () => {
    expect(hasCrossedUnverifiedThreshold({ last_state_changed_at: null, updated_at: FRESH_TS() }, Date.now())).toBe(false);
  });

  it('no prior updated_at recorded but already past threshold -> true (treated as a fresh crossing)', () => {
    const nowMs = Date.parse('2026-07-20T00:00:00Z');
    const row = { last_state_changed_at: '2026-07-01T00:00:00Z', updated_at: null };
    expect(hasCrossedUnverifiedThreshold(row, nowMs)).toBe(true);
  });
});

// SD-FDBK-ENH-CENTRAL-LIVENESS-STAMPER-001 -- pre-EXEC-TO-PLAN TESTING sub-agent FINDING-1: the
// anchor write must be its OWN independently fail-soft update, never bundled into the primary
// last_state write (this code can merge before FR-1's migration is applied out-of-band, so
// last_state_changed_at may not exist yet -- bundling would make the whole statement fail
// atomically, silently breaking last_state's own advancement too).
describe('stampStateChangeAnchor', () => {
  beforeEach(() => {
    state.updateError = null;
    state.updateCalls = [];
  });

  it('skips entirely when last_state did not change (no wasted write)', async () => {
    await stampStateChangeAnchor({ process_key: 'x', last_state: 'OK' }, { state: 'OK' });
    expect(state.updateCalls).toHaveLength(0);
  });

  it('issues a standalone update({last_state_changed_at}) on a genuine transition', async () => {
    await stampStateChangeAnchor({ process_key: 'x', last_state: 'OK' }, { state: 'OVERDUE' });
    expect(state.updateCalls).toHaveLength(1);
    expect(Object.keys(state.updateCalls[0].payload)).toEqual(['last_state_changed_at']);
  });

  it('a failed anchor update (e.g. pre-migration missing column) logs but does not throw', async () => {
    state.updateError = { message: 'column "last_state_changed_at" does not exist' };
    await expect(stampStateChangeAnchor({ process_key: 'x', last_state: 'OK' }, { state: 'OVERDUE' })).resolves.toBeUndefined();
  });
});

// FR-3 (SD-FDBK-ENH-PERIODIC-LIVENESS-WATCHER-001): direct producer-side coverage. Prior to this,
// every test exercising ladder signature-suppression injected a hand-written signature literal,
// proving only the CONSUMER (emitLadderDigest's partition logic) works while leaving the actual
// producer (this function) untested and unexported -- a regression here (e.g. reverting to
// `return evaluation.reason` for heartbeat rows) would defeat FR-3's dismissal match for exactly
// the highest-profile role_session processes while every other test in the suite stayed green.
describe('deriveFailureSignature (FR-3)', () => {
  it('claude_sessions_heartbeat rows get the STABLE label, invariant to churning reason text', () => {
    // Two evaluations of the SAME ongoing outage, one tick apart -- the seat-census detail in
    // `reason` differs (this is the real, observed shape of signalNote), but the signature must not.
    const row = { liveness_source: 'claude_sessions_heartbeat' };
    const tick1 = deriveFailureSignature(row, { state: STATE.OVERDUE, reason: 'adam dead 2/3 sessions, coordinator alive' });
    const tick2 = deriveFailureSignature(row, { state: STATE.OVERDUE, reason: 'adam dead 1/3 sessions, coordinator alive' });
    expect(tick1).toBe('stale_heartbeat');
    expect(tick2).toBe('stale_heartbeat');
    expect(tick1).toBe(tick2);
  });

  it('a non-heartbeat row with a set reason returns that reason verbatim', () => {
    const row = { liveness_source: 'self_stamped' };
    expect(deriveFailureSignature(row, { state: STATE.OVERDUE, reason: 'armed_never_produced' })).toBe('armed_never_produced');
  });

  it('a non-heartbeat OVERDUE row with no reason falls back to threshold_exceeded', () => {
    const row = { liveness_source: 'self_stamped' };
    expect(deriveFailureSignature(row, { state: STATE.OVERDUE, reason: null })).toBe('threshold_exceeded');
  });

  it('a non-heartbeat, non-OVERDUE row with no reason falls back to unknown (never undefined)', () => {
    const row = { liveness_source: 'self_stamped' };
    expect(deriveFailureSignature(row, { state: STATE.OK, reason: null })).toBe('unknown');
  });
});
