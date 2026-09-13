/**
 * Screen reconciliation builder — SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I FR-4.
 *
 * Additive to (never a replacement of) any existing pipeline stage: traces each
 * wireframe screen through the journeys referencing it and any walked/verified
 * UAT evidence, into one persisted row per screen (venture_screen_reconciliation).
 * built_surface_artifact_type is sourced only from a recorded FR-2 disposition's
 * evidence_ref -- there is no structural "which artifact type represents this
 * screen" signal anywhere in this codebase (measured during EXEC), so this
 * module never guesses one; a screen with no disposition evidence simply reads
 * built_surface_artifact_type: null, which is correct, not a bug.
 *
 * walked_step_evidence IS structurally derivable: journeys[].steps[].screen_ref
 * names the screen a step targets, and uat_test_results.metadata.source_id
 * matches that step's step_id -- both measured live against AltifyAI's real
 * data during EXEC (14 scenario_snapshot entries, 14 uat_test_results rows,
 * source_id values matching step_id values exactly).
 */

import { createLogger } from '../../logger.js';

const moduleLogger = createLogger('ScreenReconciliationBuilder');

/**
 * @returns {Promise<{ok: boolean, rowsWritten?: number, reason?: string}>}
 */
export async function buildScreenReconciliation({ supabase, ventureId, logger = moduleLogger }) {
  if (!supabase || !ventureId) {
    return { ok: false, reason: 'missing_supabase_or_ventureId' };
  }

  const [wireframeRes, journeyRes, dispositionRes, uatRunRes] = await Promise.all([
    supabase.from('venture_artifacts').select('artifact_data').eq('venture_id', ventureId).eq('artifact_type', 'wireframe_screens').eq('is_current', true).maybeSingle(),
    supabase.from('venture_artifacts').select('artifact_data').eq('venture_id', ventureId).eq('artifact_type', 'blueprint_user_journey').eq('is_current', true).maybeSingle(),
    supabase.from('venture_screen_dispositions').select('screen_id, disposition_class, evidence_ref').eq('venture_id', ventureId).limit(200),
    supabase.from('uat_test_runs').select('id').eq('metadata->>venture_id', ventureId).eq('metadata->>stage_number', '23')
      .eq('metadata->>quality_gate', 'GREEN').order('completed_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (wireframeRes.error) {
    logger?.warn?.(`[ScreenReconciliationBuilder] wireframe read error: ${wireframeRes.error.message}`);
    return { ok: false, reason: 'wireframe_read_error' };
  }
  const screens = wireframeRes.data?.artifact_data?.screens || [];
  if (screens.length === 0) {
    return { ok: true, rowsWritten: 0 };
  }

  const journeys = journeyRes.error ? [] : (journeyRes.data?.artifact_data?.journeys || []);
  const unreachableScreens = new Set(journeyRes.data?.artifact_data?.coverage_selfcheck?.unreachable_screens || []);

  // screen_id -> Set(journey_id); step_id -> screen_id (for the UAT cross-reference below).
  const journeyIdsByScreen = new Map();
  const screenIdByStepId = new Map();
  for (const journey of journeys) {
    for (const step of journey.steps || []) {
      if (!step.screen_ref) continue;
      screenIdByStepId.set(step.step_id, step.screen_ref);
      if (!journeyIdsByScreen.has(step.screen_ref)) journeyIdsByScreen.set(step.screen_ref, new Set());
      journeyIdsByScreen.get(step.screen_ref).add(journey.journey_id);
    }
  }

  const dispositionByScreen = new Map((dispositionRes.data || []).map((row) => [row.screen_id, row]));

  // Only a real, GREEN, stage-23 UAT run's results count as walked evidence -- an
  // absent/degraded run means no screen has walked evidence, never a guess.
  let walkedEvidenceByScreen = new Map();
  if (!uatRunRes.error && uatRunRes.data?.id) {
    const { data: results, error: resultsErr } = await supabase
      .from('uat_test_results')
      .select('status, metadata')
      .eq('run_id', uatRunRes.data.id)
      .limit(500);
    if (!resultsErr) {
      for (const result of results || []) {
        const stepId = result.metadata?.source_id;
        const screenId = stepId ? screenIdByStepId.get(stepId) : null;
        if (!screenId) continue;
        const existing = walkedEvidenceByScreen.get(screenId) || { stepIds: [], allPassed: true };
        existing.stepIds.push(stepId);
        existing.allPassed = existing.allPassed && result.status === 'pass';
        walkedEvidenceByScreen.set(screenId, existing);
      }
    } else {
      logger?.warn?.(`[ScreenReconciliationBuilder] uat_test_results read error (treating as no walked evidence): ${resultsErr.message}`);
    }
  }

  const rows = screens.map((screen) => {
    const journeyIds = [...(journeyIdsByScreen.get(screen.screen_id) || [])];
    const disposition = dispositionByScreen.get(screen.screen_id);
    const builtSurfaceArtifactType = disposition?.disposition_class === 'ENTRY_POINT' ? (disposition.evidence_ref || null) : null;
    const walkedEvidence = walkedEvidenceByScreen.get(screen.screen_id) || null;

    let reconciliationStatus;
    if (journeyIds.length > 0 && walkedEvidence?.allPassed) {
      reconciliationStatus = 'built_and_walked';
    } else if (journeyIds.length > 0 || builtSurfaceArtifactType) {
      reconciliationStatus = 'built_not_walked';
    } else if (unreachableScreens.has(screen.screen_id)) {
      reconciliationStatus = 'unreachable';
    } else {
      reconciliationStatus = 'not_built';
    }

    return {
      venture_id: ventureId,
      screen_id: screen.screen_id,
      screen_name: screen.screen_name || null,
      built_surface_artifact_type: builtSurfaceArtifactType,
      journey_ids: journeyIds,
      walked_step_evidence: walkedEvidence,
      reconciliation_status: reconciliationStatus,
      updated_at: new Date().toISOString(),
    };
  });

  const { error: upsertErr } = await supabase
    .from('venture_screen_reconciliation')
    .upsert(rows, { onConflict: 'venture_id,screen_id' });
  if (upsertErr) {
    logger?.warn?.(`[ScreenReconciliationBuilder] upsert failed: ${upsertErr.message}`);
    return { ok: false, reason: 'upsert_failed' };
  }

  return { ok: true, rowsWritten: rows.length };
}

/**
 * Reads the persisted reconciliation table for a venture, for the sitting packet (FR-5).
 * @returns {Promise<Array<object>>}
 */
export async function readScreenReconciliation({ supabase, ventureId, logger = moduleLogger }) {
  if (!supabase || !ventureId) return [];
  const { data, error } = await supabase
    .from('venture_screen_reconciliation')
    .select('screen_id, screen_name, built_surface_artifact_type, journey_ids, walked_step_evidence, reconciliation_status')
    .eq('venture_id', ventureId)
    .limit(200);
  if (error) {
    logger?.warn?.(`[ScreenReconciliationBuilder] read error (treating as empty): ${error.message}`);
    return [];
  }
  return data || [];
}
