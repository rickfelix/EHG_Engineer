/**
 * Shared eva_audit_log writer — fail-loud.
 * SD-LEO-FIX-FIX-PHANTOM-COLUMN-002 (FR-1)
 *
 * Live columns (EHG_Engineer DB, verified 2026-06-10):
 *   id, eva_venture_id (uuid), action_type (NOT NULL), action_source (default 'system'),
 *   action_data (jsonb default '{}'), actor_type (default 'system'), actor_id, created_at
 *
 * Never write venture_id / details / actor — those columns DO NOT exist; PostgREST
 * rejects the whole insert and (previously) the discarded error made the audit
 * trail vanish silently.
 *
 * @param {object} supabase - Supabase client
 * @param {object} row
 * @param {string} row.eva_venture_id - Venture UUID (eva_ventures.id)
 * @param {string} row.action_type - Audit action type (NOT NULL)
 * @param {object} [row.action_data] - JSONB payload
 * @param {string} [row.actor_type] - Who acted (e.g. 'event_bus', 'chairman')
 * @param {string} [row.actor_id] - Optional actor identifier
 * @param {object} [opts]
 * @param {string} [opts.handler] - Calling handler name for log context
 * @returns {Promise<{ok: boolean, error?: object}>}
 */
export async function logEvaAudit(supabase, { eva_venture_id, action_type, action_data = {}, actor_type = 'system', actor_id = null }, { handler = 'unknown' } = {}) {
  const { error } = await supabase.from('eva_audit_log').insert({
    eva_venture_id,
    action_type,
    action_data,
    actor_type,
    ...(actor_id ? { actor_id } : {}),
  });

  if (error) {
    console.warn(`[EvaAudit:${handler}] eva_audit_log write failed (${action_type}): ${error.message}`);
    return { ok: false, error };
  }
  return { ok: true };
}
