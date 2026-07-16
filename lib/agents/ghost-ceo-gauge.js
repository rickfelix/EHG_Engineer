/**
 * Ghost-CEO detection gauge — read-only.
 * SD-LEO-GEN-SATELLITE-AGENT-LIFECYCLE-001 (Satellite 3.6 Agent-lifecycle, phase b,
 * resized per the RETIRE verdict at docs/audits/venture-ceo-factory-reachability-verdict.json).
 *
 * Spine principle S6: "no ghost CEOs — a CEO row without a live evaluable agent is a
 * named defect." agent_registry.status is hardcoded 'active' at creation and never
 * cleared, so it is NOT proof of liveness — treating it as one would be a fabricated
 * green. There is no heartbeat/last_active/loop-registry link for agents anywhere in
 * this codebase today, so the honest default is: no venture_ceo row can currently prove
 * liveness, and zero rows renders the explicit NO-DATA marker rather than a fabricated
 * all-clear (mirrors lib/eva/stage-zero/data-pollers/staleness.js's NO_DATA_MARKER
 * contract). `livenessEvidenceProvider` is an injection point for tests and for a future
 * BUILD-ON runtime that can supply a real evidence source — it must never be assumed.
 *
 * This gauge performs reads only. It must never write/update/delete/upsert.
 */

/** Stable prefix — greppable downstream, pinned by tests. */
export const NO_DATA_MARKER = 'NO-DATA: agent_registry has no venture_ceo rows — do not fabricate a ghost-CEO all-clear';

/**
 * @param {Object} supabase - service-role client (read-only usage enforced by caller contract)
 * @param {Object} [opts]
 * @param {(row: object) => Promise<boolean>} [opts.livenessEvidenceProvider] - returns true only
 *   when independent evidence of a live, evaluable agent exists for the row. Defaults to a
 *   provider that always returns false (no real evidence source exists today — see header).
 * @returns {Promise<{status: 'NO_DATA'|'OK'|'GHOSTS_FOUND', ghosts: Array<{agentId:string, ventureId:string|null, reason:string}>, checkedAt: string}>}
 */
export async function checkGhostCeos(supabase, opts = {}) {
  const livenessEvidenceProvider = opts.livenessEvidenceProvider ?? (async () => false);
  const checkedAt = new Date().toISOString();

  const { data: rows, error } = await supabase
    .from('agent_registry')
    .select('id, venture_id, status')
    .eq('agent_type', 'venture_ceo');

  if (error) throw new Error(`ghost-ceo-gauge: agent_registry query failed: ${error.message}`);

  if (!Array.isArray(rows) || rows.length === 0) {
    return { status: 'NO_DATA', ghosts: [], checkedAt };
  }

  const ghosts = [];
  for (const row of rows) {
    // status alone is never sufficient evidence — see header. Only an explicit,
    // independently-supplied evidence source may clear a row.
    const hasLiveEvidence = await livenessEvidenceProvider(row);
    if (!hasLiveEvidence) {
      ghosts.push({
        agentId: row.id,
        ventureId: row.venture_id ?? null,
        reason: `agent_registry.status='${row.status}' is not proof of liveness; no independent live-evidence source confirmed this CEO agent`,
      });
    }
  }

  return { status: ghosts.length > 0 ? 'GHOSTS_FOUND' : 'OK', ghosts, checkedAt };
}

export default { checkGhostCeos, NO_DATA_MARKER };
