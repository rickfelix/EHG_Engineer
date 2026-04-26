/**
 * Loop State Tracker — single source of truth for claude_sessions.loop_state writes.
 *
 * SD: SD-LEO-INFRA-LOOP-STATE-SIGNAL-001
 *
 * Why this module exists:
 *   Coordinators need DB-queryable visibility into worker /loop chaining state.
 *   Three writer paths (PostToolUse hook on ScheduleWakeup, SessionStart wakeup
 *   detection in session-register.cjs, stale-session-sweep extension) must all
 *   route through ONE place so the constants and validation rules cannot drift.
 *
 * Writes are best-effort observability — they MUST NOT throw. A failed write
 * logs to stderr and returns; the calling hook continues.
 *
 * Constants are exported as named strings (not inline literals at call sites)
 * so a `grep -r LOOP_STATE_AWAITING_TICK` from repo root finds every reference.
 */

const LOOP_STATE_ACTIVE = 'active';
const LOOP_STATE_AWAITING_TICK = 'awaiting_tick';
const LOOP_STATE_EXITED = 'exited';
const LOOP_STATE_UNKNOWN = 'unknown';

const VALID_STATES = Object.freeze([
  LOOP_STATE_ACTIVE,
  LOOP_STATE_AWAITING_TICK,
  LOOP_STATE_EXITED,
  LOOP_STATE_UNKNOWN
]);

function isValidState(state) {
  return VALID_STATES.includes(state);
}

/**
 * Set loop_state on a claude_sessions row. Best-effort, non-throwing.
 *
 * @param {string} sessionId - claude_sessions.session_id
 * @param {string} state - one of VALID_STATES
 * @param {object} [options]
 * @param {object} [options.supabase] - injectable client; if omitted, lazily created
 * @param {string} [options.reason] - free-form note logged on failure
 * @returns {Promise<{ ok: boolean, skipped?: string, error?: string }>}
 */
async function setLoopState(sessionId, state, options = {}) {
  if (!sessionId) {
    return { ok: false, skipped: 'no_session_id' };
  }
  if (!isValidState(state)) {
    // Validation failure is the one case we surface — invalid state is a bug,
    // not a runtime condition. Throw so tests catch it; production callers
    // already pass constants from this module so this is a developer-error path.
    throw new Error(
      `loop-state-tracker: invalid state '${state}'; expected one of ${VALID_STATES.join(', ')}`
    );
  }

  let supabase = options.supabase;
  if (!supabase) {
    try {
      const { createSupabaseServiceClient } = require('../../../lib/supabase-client.cjs');
      supabase = createSupabaseServiceClient();
    } catch (e) {
      // Supabase unavailable — degrade silently; this is best-effort observability.
      process.stderr.write(
        `[loop-state-tracker] supabase client unavailable for session ${sessionId.slice(0, 12)} state=${state}: ${e.message}\n`
      );
      return { ok: false, error: 'supabase_unavailable' };
    }
  }

  try {
    const { error, count } = await supabase
      .from('claude_sessions')
      .update({ loop_state: state })
      .eq('session_id', sessionId)
      .select('session_id', { count: 'exact', head: true });

    if (error) {
      process.stderr.write(
        `[loop-state-tracker] update failed for session ${sessionId.slice(0, 12)} state=${state}: ${error.message}\n`
      );
      return { ok: false, error: error.message };
    }

    if (count === 0) {
      // Session row does not exist yet (cold-start race) or was just released.
      // Non-fatal: surface to stderr so operators can audit, but do not throw.
      process.stderr.write(
        `[loop-state-tracker] no session row found for ${sessionId.slice(0, 12)} state=${state}; skipped\n`
      );
      return { ok: false, skipped: 'session_not_found' };
    }

    return { ok: true };
  } catch (e) {
    process.stderr.write(
      `[loop-state-tracker] unexpected failure for session ${sessionId.slice(0, 12)} state=${state}: ${e.message}\n`
    );
    return { ok: false, error: e.message };
  }
}

module.exports = {
  LOOP_STATE_ACTIVE,
  LOOP_STATE_AWAITING_TICK,
  LOOP_STATE_EXITED,
  LOOP_STATE_UNKNOWN,
  VALID_STATES,
  isValidState,
  setLoopState
};
