/**
 * PC-6: hard-stop during FREEZE (CONST-009) or open incident —
 * SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-C.
 *
 * Two independent, parallel freeze mechanisms exist live (confirmed at PLAN via direct
 * query) — both checked, either being active blocks:
 *   - system_settings key AUTO_FREEZE, read via the existing is_auto_frozen() RPC.
 *   - leo_kill_switches row switch_key='CONST-009' ("Feature Flag Kill Switch" — when
 *     active, all feature flags evaluate disabled; the literal CONST-009 mechanism).
 *
 * No generic "open incident" table exists for op-co components (confirmed at PLAN:
 * exhaustive grep, zero hits) — accepted as caller-injected evidence, same pattern as
 * PC-3's dependent-incident check. Unknown (null) is treated as blocking, never as clear.
 *
 * @module lib/switch-automation/prechecks/freeze-incident
 */

const FREEZE_KILL_SWITCH_KEY = 'CONST-009';

/**
 * @param {Object} supabase - service-role Supabase client
 * @param {string} component
 * @param {Object} evidence
 * @param {boolean|null} [evidence.openIncident] - true (open incident), false (clear), null (unknown -> fail closed)
 * @returns {Promise<{id:string, name:string, passed:boolean, reason:string}>}
 */
export async function checkFreezeAndIncident(supabase, component, evidence = {}) {
  const base = { id: 'PC-6', name: 'freeze-and-incident' };

  try {
    const { data: autoFrozen, error: freezeErr } = await supabase.rpc('is_auto_frozen');
    if (freezeErr) throw new Error(freezeErr.message);
    if (autoFrozen === true) {
      return { ...base, passed: false, reason: 'auto-freeze-active' };
    }
  } catch (err) {
    return { ...base, passed: false, reason: `freeze-check-failed:${err.message}` };
  }

  try {
    const { data: killSwitch, error: ksErr } = await supabase
      .from('leo_kill_switches')
      .select('switch_key, is_active')
      .eq('switch_key', FREEZE_KILL_SWITCH_KEY)
      .maybeSingle();
    if (ksErr) throw new Error(ksErr.message);
    if (killSwitch && killSwitch.is_active === true) {
      return { ...base, passed: false, reason: `kill-switch-active:${killSwitch.switch_key}` };
    }
  } catch (err) {
    return { ...base, passed: false, reason: `kill-switch-check-failed:${err.message}` };
  }

  if (evidence.openIncident === true) {
    return { ...base, passed: false, reason: 'open-incident' };
  }
  if (evidence.openIncident !== false) {
    // null/undefined (unknown) fails closed -- never silently treated as clear.
    return { ...base, passed: false, reason: 'incident-status-unknown' };
  }

  return { ...base, passed: true, reason: 'no-freeze-no-incident' };
}

export default checkFreezeAndIncident;
