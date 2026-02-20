/**
 * OKR Monthly Snapshot Handler
 *
 * SD: SD-EHG-ORCH-FOUNDATION-CLEANUP-001-F (US-001)
 *
 * Captures monthly KR progress snapshots, computes weighted objective
 * scores, and emits EVA events. Uses UPSERT to prevent duplicate
 * snapshots for the same period.
 *
 * @module lib/eva/jobs/okr-monthly-handler
 */

/**
 * Run the monthly OKR snapshot.
 *
 * @param {Object} deps
 * @param {Object} deps.supabase - Supabase client (service-role)
 * @param {Object} [deps.logger]  - Logger (defaults to console)
 * @returns {Promise<{snapshotCount: number, objectivesScored: number}>}
 */
export async function runOkrMonthlySnapshot({ supabase, logger = console }) {
  const snapshotDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // 1. Fetch all active key results
  const { data: keyResults, error: krError } = await supabase
    .from('key_results')
    .select('id, objective_id, current_value, target_value, baseline_value, direction, title')
    .eq('is_active', true);

  if (krError) {
    throw new Error(`Failed to fetch key results: ${krError.message}`);
  }

  if (!keyResults || keyResults.length === 0) {
    logger.warn('[OKR-Snapshot] No active key results found — skipping snapshot');
    return { snapshotCount: 0, objectivesScored: 0 };
  }

  // 2. UPSERT progress snapshots for each KR
  let snapshotCount = 0;
  for (const kr of keyResults) {
    const { error: upsertError } = await supabase
      .from('kr_progress_snapshots')
      .upsert(
        {
          key_result_id: kr.id,
          snapshot_date: snapshotDate,
          value: kr.current_value ?? 0,
          notes: `Auto-snapshot by EVA scheduler on ${snapshotDate}`,
          created_by: 'eva-scheduler',
        },
        { onConflict: 'key_result_id,snapshot_date', ignoreDuplicates: false },
      );

    if (upsertError) {
      logger.warn(`[OKR-Snapshot] Upsert failed for KR ${kr.id}: ${upsertError.message}`);
    } else {
      snapshotCount++;
    }
  }

  logger.log(`[OKR-Snapshot] ${snapshotCount}/${keyResults.length} KR snapshots captured for ${snapshotDate}`);

  // 3. Compute weighted objective scores
  const objectiveIds = [...new Set(keyResults.map(kr => kr.objective_id))];
  let objectivesScored = 0;

  for (const objId of objectiveIds) {
    const objKRs = keyResults.filter(kr => kr.objective_id === objId);
    const score = computeObjectiveScore(objKRs);

    // Emit EVA event for objective scored
    await emitEvent(supabase, 'okr.objective.scored', {
      objective_id: objId,
      score,
      kr_count: objKRs.length,
      snapshot_date: snapshotDate,
    }, logger);

    objectivesScored++;
  }

  // 4. Emit completion event
  await emitEvent(supabase, 'okr.snapshot.completed', {
    snapshot_date: snapshotDate,
    kr_count: snapshotCount,
    objectives_scored: objectivesScored,
  }, logger);

  logger.log(`[OKR-Snapshot] Complete: ${snapshotCount} snapshots, ${objectivesScored} objectives scored`);

  return { snapshotCount, objectivesScored };
}

/**
 * Compute a 0-100 score for an objective from its child KRs.
 * Each KR contributes equally (uniform weight).
 *
 * @param {Array} krs - Key results belonging to one objective
 * @returns {number} Score 0-100
 */
export function computeObjectiveScore(krs) {
  if (!krs || krs.length === 0) return 0;

  let totalProgress = 0;
  for (const kr of krs) {
    const baseline = kr.baseline_value ?? 0;
    const current = kr.current_value ?? 0;
    const target = kr.target_value ?? 100;

    const range = target - baseline;
    if (range === 0) {
      totalProgress += current >= target ? 100 : 0;
      continue;
    }

    const raw = ((current - baseline) / range) * 100;
    // For 'decrease' direction, invert the progress
    const progress = kr.direction === 'decrease' ? 100 - raw : raw;
    totalProgress += Math.max(0, Math.min(100, progress));
  }

  return Math.round(totalProgress / krs.length);
}

/**
 * Emit an EVA event to eva_scheduler_metrics.
 * Non-blocking: failures are logged but don't throw.
 */
async function emitEvent(supabase, eventType, metadata, logger) {
  try {
    await supabase.from('eva_scheduler_metrics').insert({
      event_type: eventType,
      metadata,
      scheduler_instance_id: 'okr-monthly-handler',
      occurred_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn(`[OKR-Snapshot] Event emit failed (${eventType}): ${err.message}`);
  }
}
