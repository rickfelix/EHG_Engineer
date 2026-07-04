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
        maybeSingle: async () => {
          if (table === 'claude_sessions') return { data: state.claudeSessionsRow, error: null };
          if (table === 'eva_scheduler_heartbeat') return { data: state.schedulerRow, error: null };
          return { data: null, error: null };
        },
      };
      return chain;
    },
  }),
}));

const { evaluateRow, STATE } = await import('../../scripts/periodic-liveness-watcher.mjs');

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
});
