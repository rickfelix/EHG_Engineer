/**
 * PC-5: rate/soak cap — SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-C.
 *
 * Mirrors CONST-007's 3-per-24h count-cap shape (get_auto_apply_count_in_window(),
 * scripts/verify/rate_limit_const_007.js), applied here to a NEW action class:
 * CONST-007's own table (protocol_improvement_queue) only counts protocol
 * self-improvement changes, not switch-on actions — this precheck needs its own
 * table (database/migrations/20260718_switchon_auto_actions.sql).
 *
 * "One per window" (minimum spacing between consecutive auto-proceeds for the same
 * component) has no prior-art precedent in this codebase — CONST-007 is a pure
 * count-cap, not a spacing rule. minSoakMinutes is a reasoned new interpretation,
 * documented and tunable via opts.
 *
 * @module lib/switch-automation/prechecks/rate-soak
 */

const DEFAULT_MAX_PER_WINDOW = 3;
const DEFAULT_WINDOW_HOURS = 24;
const DEFAULT_MIN_SOAK_MINUTES = 60;

/**
 * @param {Object} supabase - service-role Supabase client
 * @param {string} component
 * @param {Object} [opts]
 * @param {number} [opts.maxPerWindow=3]
 * @param {number} [opts.windowHours=24]
 * @param {number} [opts.minSoakMinutes=60]
 * @returns {Promise<{id:string, name:string, passed:boolean, reason:string}>}
 */
export async function checkRateSoak(supabase, component, opts = {}) {
  const maxPerWindow = opts.maxPerWindow ?? DEFAULT_MAX_PER_WINDOW;
  const windowHours = opts.windowHours ?? DEFAULT_WINDOW_HOURS;
  const minSoakMinutes = opts.minSoakMinutes ?? DEFAULT_MIN_SOAK_MINUTES;
  const base = { id: 'PC-5', name: 'rate-soak' };

  const cutoffIso = new Date(Date.now() - windowHours * 3_600_000).toISOString();

  let rows;
  try {
    const { data, error } = await supabase
      .from('switchon_auto_actions')
      .select('occurred_at')
      .eq('component', component)
      .gte('occurred_at', cutoffIso)
      .order('occurred_at', { ascending: false });
    if (error) throw new Error(error.message);
    rows = data || [];
  } catch (err) {
    return { ...base, passed: false, reason: `query-failed:${err.message}` };
  }

  if (rows.length >= maxPerWindow) {
    return { ...base, passed: false, reason: 'rate-cap-exceeded' };
  }

  if (rows.length > 0) {
    const mostRecentMs = Date.parse(rows[0].occurred_at);
    if (Number.isFinite(mostRecentMs)) {
      const minutesSince = (Date.now() - mostRecentMs) / 60_000;
      if (minutesSince < minSoakMinutes) {
        return { ...base, passed: false, reason: 'soak-window-active' };
      }
    }
  }

  return { ...base, passed: true, reason: 'within-rate-and-soak' };
}

export default checkRateSoak;
