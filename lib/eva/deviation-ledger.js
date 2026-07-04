/**
 * Deviation Ledger — ADR-style build-time plan-vs-reality capture.
 *
 * SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-A. Per the chairman's deviation-semantics
 * refinement: straying from an original planning artifact is allowable — building
 * sharpens the picture. What the rubric (Child C) penalizes is UNDOCUMENTED drift,
 * not documented, sensible deviation. This module is the sole write/read path for
 * that record: a new venture_artifacts row (artifact_type=BUILD_DEVIATION_RECORD),
 * reusing that table's existing embedding/summarization/versioning infrastructure
 * rather than a bespoke table.
 *
 * declared-descope folds the older "deliberately descoped" concept into this same
 * ledger's weight taxonomy, rather than a separate primitive.
 *
 * Judging whether a reason is SENSIBLE (vs. thin/nonsensical) is explicitly Child
 * C's job (reason-quality scoring) — this module only enforces non-empty.
 *
 * @module lib/eva/deviation-ledger
 */

import { ARTIFACT_TYPES } from './artifact-types.js';

/** Chairman-ratified weight taxonomy (refinement #2). */
export const DEVIATION_WEIGHTS = Object.freeze(['minor', 'moderate', 'critical', 'declared-descope']);

/** venture_artifacts.lifecycle_stage is NOT NULL; deviations most commonly originate
 *  during Stage 19 (sprint/build) work, so that is the default when unspecified. */
const DEFAULT_LIFECYCLE_STAGE = 19;

/**
 * Record a build-time deviation from a planning artifact/claim.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} opts
 * @param {string} opts.ventureId - Venture UUID
 * @param {string} opts.artifactRef - Stable identifier for the artifact/claim/story deviated from
 *   (e.g. a venture_artifacts.id or a claim key within one)
 * @param {string} [opts.what] - What was deviated from
 * @param {string} [opts.instead] - What was done instead
 * @param {string} opts.why - Reason for the deviation (REQUIRED, non-empty, for every weight)
 * @param {string} [opts.decidedBy] - Who decided
 * @param {'minor'|'moderate'|'critical'|'declared-descope'} opts.weight
 * @param {number} [opts.lifecycleStage] - Defaults to 19 (Build)
 * @returns {Promise<string>} the new venture_artifacts row id
 */
export async function recordDeviation(supabase, opts = {}) {
  const { ventureId, artifactRef, what, instead, why, decidedBy, weight, lifecycleStage } = opts;

  if (!ventureId) {
    throw new Error('[deviation-ledger] recordDeviation requires ventureId');
  }
  if (!artifactRef) {
    throw new Error('[deviation-ledger] recordDeviation requires artifactRef');
  }
  if (!DEVIATION_WEIGHTS.includes(weight)) {
    throw new Error(`[deviation-ledger] recordDeviation requires weight to be one of [${DEVIATION_WEIGHTS.join(', ')}], got: ${JSON.stringify(weight)}`);
  }
  if (!why || !String(why).trim()) {
    throw new Error('[deviation-ledger] recordDeviation requires a non-empty reason (why) — this applies to every weight, including declared-descope');
  }

  const artifactData = {
    artifact_ref: artifactRef,
    what: what ?? null,
    instead: instead ?? null,
    why: String(why).trim(),
    decided_by: decidedBy ?? null,
    weight,
  };

  const { data, error } = await supabase
    .from('venture_artifacts')
    .insert({
      venture_id: ventureId,
      lifecycle_stage: lifecycleStage ?? DEFAULT_LIFECYCLE_STAGE,
      artifact_type: ARTIFACT_TYPES.BUILD_DEVIATION_RECORD,
      title: `Deviation: ${artifactRef}`,
      content: artifactData.why,
      artifact_data: artifactData,
      is_current: true,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`[deviation-ledger] recordDeviation failed: ${error.message}`);
  }
  return data.id;
}

/**
 * Read all deviation records for a given venture + artifact reference, in
 * creation order. Used by the artifact-walk engine (Child B) to distinguish
 * DEVIATED-WITH-DOCUMENTED-REASON from DEVIATED-UNDOCUMENTED.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} opts
 * @param {string} opts.ventureId
 * @param {string} opts.artifactRef
 * @returns {Promise<Array<{id:string, createdAt:string, artifact_ref:string, what:?string, instead:?string, why:string, decided_by:?string, weight:string}>>}
 *   Empty array (never null/undefined) when no deviation record exists.
 */
export async function readDeviations(supabase, opts = {}) {
  const { ventureId, artifactRef } = opts;

  if (!ventureId) {
    throw new Error('[deviation-ledger] readDeviations requires ventureId');
  }
  if (!artifactRef) {
    throw new Error('[deviation-ledger] readDeviations requires artifactRef');
  }

  const { data, error } = await supabase
    .from('venture_artifacts')
    .select('id, created_at, artifact_data')
    .eq('venture_id', ventureId)
    .eq('artifact_type', ARTIFACT_TYPES.BUILD_DEVIATION_RECORD)
    .contains('artifact_data', { artifact_ref: artifactRef })
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`[deviation-ledger] readDeviations failed: ${error.message}`);
  }

  return (data || []).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    ...row.artifact_data,
  }));
}

export default { DEVIATION_WEIGHTS, recordDeviation, readDeviations };
