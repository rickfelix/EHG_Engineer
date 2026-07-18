/**
 * PC-7: CONST-003 audit stamp (actor, policy version, evidence snapshot) —
 * SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-C.
 *
 * Closes a gap child A's own migration comment named but did not implement: even
 * chairman_switchon_policy's migration cites "CONST-003: actor, policy version,
 * evidence snapshot" as the audit requirement, but ships only added_by/added_at/
 * rationale on a table that is REVOKE-locked against per-decision writes anyway (only
 * the chairman-ceremony table owner may INSERT). This module writes to a purpose-built
 * table instead (database/migrations/20260718_switchon_decision_audit.sql).
 *
 * @module lib/switch-automation/prechecks/audit-stamp
 */

/**
 * @param {Object} supabase - service-role Supabase client
 * @param {string} component
 * @returns {Promise<string>} a stable policy_version identifier for chairman_switchon_policy's
 *   current state (count + max(added_at)), so a later widening is distinguishable in the
 *   audit trail from an earlier decision made under a narrower policy. Fails soft to a
 *   sentinel string ('policy-table-not-live') if the STAGED table hasn't been applied yet.
 */
export async function computePolicyVersion(supabase) {
  try {
    const { data, error } = await supabase
      .from('chairman_switchon_policy')
      .select('added_at')
      .order('added_at', { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return 'policy-table-empty';
    return `v1:${data.length}:${data[0].added_at}`;
  } catch {
    return 'policy-table-not-live';
  }
}

/**
 * @param {Object} supabase - service-role Supabase client
 * @param {Object} params
 * @param {string} params.component
 * @param {string} params.action
 * @param {string} params.actor
 * @param {string} params.policyVersion
 * @param {Object} params.evidenceSnapshot - full classifier + authorizeSwitchOn + 7-precheck results
 * @param {string} params.decision - 'auto-proceed' | 'held-for-chairman'
 * @returns {Promise<{id:string}>}
 */
export async function recordSwitchOnAuditStamp(supabase, {
  component, action, actor, policyVersion, evidenceSnapshot, decision,
}) {
  const { data, error } = await supabase
    .from('switchon_decision_audit')
    .insert({
      component,
      action,
      actor,
      policy_version: policyVersion,
      evidence_snapshot: evidenceSnapshot,
      decision,
    })
    .select('id')
    .single();

  // CONST-003's purpose is defeated by a silently-swallowed audit write -- surface loudly.
  if (error) throw new Error(`recordSwitchOnAuditStamp: insert failed: ${error.message}`);
  return data;
}

export default { computePolicyVersion, recordSwitchOnAuditStamp };
