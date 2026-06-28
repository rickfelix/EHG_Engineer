/**
 * Shared venture_stage_work write-through (daemon-parity).
 *
 * SD-LEO-INFRA-RUN-STAGE-FAITHFUL-PERSIST-001: extracted verbatim from
 * StageExecutionWorker._syncStageWork (the daemon completion-persist, which is
 * the parity reference) so BOTH the daemon AND run-stage/executeStage write the
 * SAME stage-completion records — a single source of truth. Re-implementing this
 * is how the artifact_type drift arose; share the helper instead.
 *
 * On stage completion this upserts the venture_stage_work row with
 * advisory_data (the producer's stage-display output) at daemon parity:
 * stage_status, work_type, health_score, started_at/completed_at. Idempotent —
 * UPSERT on (venture_id, lifecycle_stage), so a re-run overwrites rather than
 * double-writes.
 *
 * @module lib/eva/stage-work-sync
 */

import { getStageGovernance } from './stage-governance.js';

/**
 * Whether a stage is in the DB-configured hard-gate set (chairman_dashboard_config).
 * Fail-soft: any read error → false.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {number} stageNumber
 * @returns {Promise<boolean>}
 */
export async function isInHardGateStages(supabase, stageNumber) {
  try {
    const { data } = await supabase
      .from('chairman_dashboard_config')
      .select('hard_gate_stages')
      .eq('config_key', 'default')
      .maybeSingle();
    return (data?.hard_gate_stages || []).includes(stageNumber);
  } catch {
    return false;
  }
}

/**
 * Write-through to venture_stage_work so the UI can display results. The
 * producer (processStage / executeStage) writes venture_artifacts but not
 * venture_stage_work, while the frontend reads advisory_data from
 * venture_stage_work.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} args
 * @param {string} args.ventureId
 * @param {number} args.stageNumber
 * @param {Object} args.result — { artifacts: [{artifactType, payload}], status, startedAt, _gateApproved }
 * @param {{ log: Function, warn: Function }} [args.logger=console]
 */
export async function syncStageWork(supabase, { ventureId, stageNumber, result, logger = console }) {
  if (!result) return;

  // Merge artifact payloads into a single advisory_data object
  const advisoryData = {};
  if (result.artifacts && Array.isArray(result.artifacts)) {
    // QF-20260521-812: studio-style stages (e.g. S18 Marketing Copy Studio) read
    // advisory_data[section] for per-section content and advisory_data.completedSections/
    // totalSections for the counter. The legacy flat Object.assign collapses multiple
    // typed artifacts whose payloads share keys, so only the last survived and the
    // counter read 0/9. Fix is ADDITIVE: keep the flat merge (back-compat), AND expose
    // each artifact under its prefix-stripped section key plus a populated-count summary.
    let populatedCount = 0;
    for (const artifact of result.artifacts) {
      const payload = artifact.payload || {};
      if (typeof payload === 'object' && !Array.isArray(payload)) {
        Object.assign(advisoryData, payload);
        const sectionKey = typeof artifact.artifactType === 'string'
          ? artifact.artifactType.replace(/^[a-z0-9]+_/, '')
          : '';
        if (sectionKey && sectionKey !== artifact.artifactType) {
          advisoryData[sectionKey] = payload;
        }
        if (Object.keys(payload).length > 0) populatedCount++;
      }
    }
    if (result.artifacts.length > 0) {
      if (advisoryData.totalSections === undefined) advisoryData.totalSections = result.artifacts.length;
      if (advisoryData.completedSections === undefined) advisoryData.completedSections = populatedCount;
    }
  }

  // Determine stage_status from result
  const resultStatus = (result.status || '').toUpperCase();
  let stageStatus;
  if (resultStatus === 'COMPLETED') stageStatus = 'completed';
  else if (resultStatus === 'BLOCKED') stageStatus = 'blocked';
  else if (resultStatus === 'FAILED') stageStatus = 'blocked'; // DB constraint: not_started, in_progress, blocked, completed, skipped
  // SD-LEO-INFRA-KILLGATE-ROUTE-TO-REVIEW-HOLD-001: a HELD (route-to-review) stage maps to 'blocked'.
  else if (resultStatus === 'HELD') stageStatus = 'blocked';
  else stageStatus = 'in_progress';

  // For chairman gate stages AND review-mode stages, mark as blocked (awaiting chairman approval),
  // unless the gate was already auto-approved.
  const govForGateCheck = await getStageGovernance(supabase);
  const isGateStage = govForGateCheck.isBlocking(stageNumber) || govForGateCheck.isReview(stageNumber) || await isInHardGateStages(supabase, stageNumber);
  if (isGateStage && stageStatus === 'completed' && !result._gateApproved) {
    stageStatus = 'blocked';
  }

  // Fetch work_type from venture_stages (required NOT NULL column)
  let workType = 'artifact_only'; // fallback
  try {
    const { data: cfg } = await supabase
      .from('venture_stages') /* SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-B: unified superset */
      .select('work_type')
      .eq('stage_number', stageNumber)
      .single();
    if (cfg?.work_type) workType = cfg.work_type;
  } catch { /* use fallback */ }

  const now = new Date().toISOString();
  const updateData = {
    stage_status: stageStatus,
    work_type: workType,
    advisory_data: Object.keys(advisoryData).length > 0 ? advisoryData : null,
    started_at: result.startedAt || now,
    updated_at: now,
  };

  // Set completed_at and health_score for stages that completed
  if (stageStatus === 'completed') {
    updateData.completed_at = now;
    // SD-MAN-FIX-PIPELINE-HEALTH-GAPS-ORCH-001-A: compute health score at sync time
    try {
      const { computeHealthScore } = await import('./health-score-computer.js');
      updateData.health_score = computeHealthScore(
        Object.keys(advisoryData).length > 0 ? advisoryData : null,
      );
    } catch (_) { /* non-fatal */ }
  }

  const { error } = await supabase
    .from('venture_stage_work')
    .upsert({
      venture_id: ventureId,
      lifecycle_stage: stageNumber,
      ...updateData,
    }, { onConflict: 'venture_id,lifecycle_stage' });

  if (error) {
    logger.warn(`[stage-work-sync] venture_stage_work upsert failed for stage ${stageNumber}: ${error.message}`);
  } else {
    logger.log(`[stage-work-sync] venture_stage_work synced for stage ${stageNumber} (status: ${stageStatus}, advisory_data: ${Object.keys(advisoryData).length} keys)`);
  }
}

export default { syncStageWork, isInHardGateStages };
