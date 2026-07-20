/**
 * Orphaned-provisioning reaper.
 * SD-LEO-INFRA-VENTURE-PROVISIONING-NAME-COLLISION-001 (FR-2 + FR-3, unified).
 *
 * For every venture whose ventures.status IN ('cancelled','killed'), this reaper:
 *   1. DELETEs the stale venture_provisioning_state row (keyed on venture_id — the PK), and
 *   2. TERMINALIZEs the venture's orphaned orchestrator SD tree in strategic_directives_v2
 *      (every SD with metadata.venture_id == the venture, still in a non-terminal status)
 *      by setting status='cancelled' + the cancellation_reason COLUMN (NOT metadata — per the
 *      coordinator's harness_backlog 3b5d63a4: SD cancel uses the cancellation_reason column).
 *
 * This single mechanism is BOTH the on-cancel cascade cleanup (invoke it from the cancel flow)
 * and the periodic defense-in-depth reaper (run it on a schedule). dryRun=true by default — it
 * reports counts without mutating. Fail-soft per item; idempotent (terminal rows are skipped).
 */

import { fetchAllPaginated } from '../../db/fetch-all-paginated.mjs';

const TERMINAL_SD_STATUSES = ['completed', 'cancelled', 'archived'];
const REAPABLE_VENTURE_STATUSES = ['cancelled', 'killed'];

/**
 * @param {object} opts
 * @param {import('@supabase/supabase-js').SupabaseClient} opts.supabase
 * @param {boolean} [opts.dryRun=true]
 * @param {(msg: string) => void} [opts.log]
 * @returns {Promise<{ dryRun: boolean, ventures: number, rowsReaped: number, treesTerminalized: number, sdsTerminalized: number, errors: string[] }>}
 */
export async function reapOrphanedProvisioning({ supabase, dryRun = true, log = () => {} } = {}) {
  const summary = { dryRun, ventures: 0, rowsReaped: 0, treesTerminalized: 0, sdsTerminalized: 0, errors: [] };
  if (!supabase) { summary.errors.push('no_supabase'); return summary; }

  // The set of cancelled/killed venture ids whose artifacts are reapable.
  // Paginated (FR-6 batch 7): a capped read would silently leave dead ventures
  // unreaped. Page errors preserve the prior errors[]-and-return policy.
  let deadVentures;
  try {
    deadVentures = await fetchAllPaginated(() => supabase
      .from('ventures')
      .select('id, name, status')
      .in('status', REAPABLE_VENTURE_STATUSES)
      .order('id', { ascending: true }));
  } catch (e) {
    summary.errors.push(`ventures_read: ${e.message}`); return summary;
  }

  const deadIds = new Set((deadVentures || []).map((v) => v.id));
  summary.ventures = deadIds.size;
  if (deadIds.size === 0) { log('[reaper] no cancelled/killed ventures — nothing to reap'); return summary; }

  // 1. Stale venture_provisioning_state rows for those ventures.
  const { data: staleRows, error: psErr } = await supabase
    .from('venture_provisioning_state')
    .select('venture_id, venture_name')
    .in('venture_id', Array.from(deadIds));
  if (psErr) summary.errors.push(`provisioning_read: ${psErr.message}`);

  for (const row of (staleRows || [])) {
    log(`[reaper] ${dryRun ? 'WOULD delete' : 'deleting'} provisioning_state for venture ${row.venture_id} (${row.venture_name})`);
    if (!dryRun) {
      const { error } = await supabase.from('venture_provisioning_state').delete().eq('venture_id', row.venture_id);
      if (error) { summary.errors.push(`delete ${row.venture_id}: ${error.message}`); continue; }
    }
    summary.rowsReaped++;
  }

  // 2. Orphaned orchestrator SD trees for those ventures (non-terminal SDs carrying the venture_id).
  for (const ventureId of deadIds) {
    const { data: sds, error: sdErr } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, status')
      .eq('metadata->>venture_id', ventureId)
      .not('status', 'in', `(${TERMINAL_SD_STATUSES.join(',')})`);
    if (sdErr) { summary.errors.push(`sd_read ${ventureId}: ${sdErr.message}`); continue; }
    if (!sds || sds.length === 0) continue;

    let terminalizedAny = false;
    for (const sd of sds) {
      log(`[reaper] ${dryRun ? 'WOULD cancel' : 'cancelling'} SD ${sd.sd_key} (orphaned tree of cancelled venture ${ventureId})`);
      if (!dryRun) {
        const { error } = await supabase
          .from('strategic_directives_v2')
          .update({
            status: 'cancelled',
            cancellation_reason: `Orphaned orchestrator tree of cancelled/killed venture ${ventureId} — reaped by SD-LEO-INFRA-VENTURE-PROVISIONING-NAME-COLLISION-001 reaper`,
          })
          .eq('id', sd.id);
        if (error) { summary.errors.push(`cancel ${sd.sd_key}: ${error.message}`); continue; }
      }
      summary.sdsTerminalized++;
      terminalizedAny = true;
    }
    if (terminalizedAny) summary.treesTerminalized++;
  }

  log(`[reaper] ${dryRun ? '(dry-run) ' : ''}ventures=${summary.ventures} rowsReaped=${summary.rowsReaped} treesTerminalized=${summary.treesTerminalized} sdsTerminalized=${summary.sdsTerminalized} errors=${summary.errors.length}`);
  return summary;
}

export default { reapOrphanedProvisioning };
