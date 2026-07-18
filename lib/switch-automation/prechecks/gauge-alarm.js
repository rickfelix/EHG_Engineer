/**
 * PC-4: gauge+alarm armed AND verified firing + named owner —
 * SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-C.
 *
 * The one precheck with a strong existing pattern (PLAN research) — reuses
 * periodic_process_registry (lib/machinery-class/armed-registration.js registers ARMED
 * rows with a named owner; lib/periodic-liveness/stamp-last-fired.js flips
 * last_fired_at when the trigger genuinely fires) rather than building parallel
 * machinery. "Armed AND verified firing" = registered AND has actually fired at least
 * once (last_fired_at non-null), not merely registered.
 *
 * @module lib/switch-automation/prechecks/gauge-alarm
 */

/**
 * @param {Object} supabase - service-role Supabase client
 * @param {string} processKey - the periodic_process_registry.process_key for this component's gauge/alarm
 * @returns {Promise<{id:string, name:string, passed:boolean, reason:string}>}
 */
export async function checkGaugeAlarmArmed(supabase, processKey) {
  const base = { id: 'PC-4', name: 'gauge-alarm-armed' };

  let row;
  try {
    const { data, error } = await supabase
      .from('periodic_process_registry')
      .select('owner, last_fired_at, currently_expected_active')
      .eq('process_key', processKey)
      .maybeSingle();
    if (error) throw new Error(error.message);
    row = data;
  } catch (err) {
    return { ...base, passed: false, reason: `query-failed:${err.message}` };
  }

  if (!row) {
    return { ...base, passed: false, reason: 'not-registered' };
  }
  if (typeof row.owner !== 'string' || row.owner.trim() === '') {
    return { ...base, passed: false, reason: 'no-named-owner' };
  }
  if (!row.last_fired_at) {
    return { ...base, passed: false, reason: 'never-fired' };
  }
  if (row.currently_expected_active !== true) {
    return { ...base, passed: false, reason: 'not-currently-expected-active' };
  }

  return { ...base, passed: true, reason: 'armed-and-verified-firing' };
}

export default checkGaugeAlarmArmed;
