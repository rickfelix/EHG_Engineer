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

const state = {
  claudeSessionsRow: null,
  schedulerRow: null,
  updateError: null,
  updateCalls: [],
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        or: () => chain,
        order: () => chain,
        limit: () => chain,
        neq: () => chain,
        update: (payload) => {
          state.updateCalls.push({ table, payload });
          return chain;
        },
        maybeSingle: async () => {
          if (table === 'claude_sessions') return { data: state.claudeSessionsRow, error: null };
          if (table === 'eva_scheduler_heartbeat') return { data: state.schedulerRow, error: null };
          return { data: null, error: null };
        },
        then: (resolve) => resolve({ data: null, error: state.updateError }),
      };
      return chain;
    },
  }),
}));

const { evaluateRow, STATE, hasCrossedUnverifiedThreshold, UNVERIFIED_ESCALATION_MS, stampStateChangeAnchor } = await import('../../scripts/periodic-liveness-watcher.mjs');

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

describe('evaluateRow', () => {
  beforeEach(() => {
    state.claudeSessionsRow = null;
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
    expect(result.reason).toBe('fewer_than_2_evaluable_signals');
  });

  it('role_session: heartbeat + terminal_id populated, both genuinely stale -> OVERDUE', async () => {
    state.claudeSessionsRow = { heartbeat_at: OLD_TS, terminal_id: 'win-cc-1234-999999', tty: null, process_alive_at: null, is_alive: false };
    const row = roleSessionRow();
    const result = await evaluateRow(row);
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
