/**
 * OKR Archive Stale Handler
 *
 * SD: SD-EHG-ORCH-GOVERNANCE-STACK-001-D (US-001)
 *
 * Archives expired OKRs by setting is_active=false on objectives and
 * key_results whose period has passed. Preserves all historical data
 * in kr_progress_snapshots.
 *
 * @module lib/eva/jobs/okr-archive-stale
 */

/**
 * Archive stale OKRs whose period has ended.
 *
 * @param {Object} deps
 * @param {Object} deps.supabase - Supabase client (service-role)
 * @param {Object} [deps.logger]  - Logger (defaults to console)
 * @param {boolean} [deps.dryRun] - If true, report but don't mutate
 * @returns {Promise<{archivedObjectives: number, archivedKRs: number}>}
 */
export async function archiveStaleOkrs({ supabase, logger = console, dryRun = false }) {
  const today = new Date().toISOString().slice(0, 10);

  // 1. Find active objectives whose period has ended
  const { data: staleObjectives, error: objError } = await supabase
    .from('objectives')
    .select('id, code, title, period')
    .eq('is_active', true);

  if (objError) {
    throw new Error(`Failed to fetch objectives: ${objError.message}`);
  }

  // Filter to objectives whose period has ended
  // Period format: "2026-Q1" → end of March 2026
  const expired = (staleObjectives || []).filter(obj => {
    return isPeriodExpired(obj.period, today);
  });

  if (expired.length === 0) {
    logger.log('[OKR-Archive] No stale objectives found');
    return { archivedObjectives: 0, archivedKRs: 0 };
  }

  logger.log(`[OKR-Archive] Found ${expired.length} stale objective(s)${dryRun ? ' (DRY RUN)' : ''}`);

  let archivedObjectives = 0;
  let archivedKRs = 0;

  for (const obj of expired) {
    logger.log(`  → ${obj.code}: ${obj.title} (period: ${obj.period})`);

    if (!dryRun) {
      // Archive the objective
      const { error: archObjError } = await supabase
        .from('objectives')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', obj.id);

      if (archObjError) {
        logger.warn(`[OKR-Archive] Failed to archive objective ${obj.code}: ${archObjError.message}`);
        continue;
      }

      // Archive its key results
      const { data: krs, error: krError } = await supabase
        .from('key_results')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('objective_id', obj.id)
        .eq('is_active', true)
        .select('id');

      if (krError) {
        logger.warn(`[OKR-Archive] Failed to archive KRs for ${obj.code}: ${krError.message}`);
      } else {
        archivedKRs += (krs || []).length;
      }
    }

    archivedObjectives++;
  }

  logger.log(`[OKR-Archive] Complete: ${archivedObjectives} objectives, ${archivedKRs} KRs archived`);
  return { archivedObjectives, archivedKRs };
}

/**
 * Check if a period string like "2026-Q1" has expired relative to today.
 */
function isPeriodExpired(period, today) {
  if (!period) return false;

  // "2026-Q1" → end of March
  const qMatch = period.match(/^(\d{4})-Q(\d)$/);
  if (qMatch) {
    const year = parseInt(qMatch[1]);
    const quarter = parseInt(qMatch[2]);
    const endMonth = quarter * 3;
    const endDate = new Date(year, endMonth, 0); // last day of quarter
    return today > endDate.toISOString().slice(0, 10);
  }

  // "2026-03" → end of March
  const mMatch = period.match(/^(\d{4})-(\d{2})$/);
  if (mMatch) {
    const year = parseInt(mMatch[1]);
    const month = parseInt(mMatch[2]);
    const endDate = new Date(year, month, 0);
    return today > endDate.toISOString().slice(0, 10);
  }

  return false;
}
