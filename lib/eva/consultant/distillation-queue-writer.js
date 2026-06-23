/**
 * Chairman review-queue writer for the Brainstorm Distillation Pipeline.
 *
 * SD-LEO-INFRA-BRAINSTORM-DISTILLATION-PIPELINE-001-A (FR-2), child idx 0 of
 * SD-LEO-INFRA-BRAINSTORM-DISTILLATION-PIPELINE-001.
 *
 * Records a DISTILLED brainstorm candidate as a chairman-reviewable row in
 * eva_consultant_recommendations: it links back to the source roadmap_wave_items row
 * (source_wave_item_id) and carries the distilled SD JSON (distilled_sd_payload), so the
 * chairman can review it and the downstream disposition-gate child can FK-check acceptance
 * before any auto-mint.
 *
 * Reuses the existing recommendation insert shape (see scripts/eva/consultant-analysis-round.mjs
 * and lib/eva/consultant/*): NOT NULL columns recommendation_date / recommendation_type / title /
 * action_type / status are always populated with engine-consistent defaults. The supabase client is
 * injected so the writer is unit-testable without a live DB.
 */

const DEFAULTS = {
  // Engine-consistent defaults (mirror consultant-analysis-round.mjs):
  recommendation_type: 'strategic',
  action_type: 'create_sd',
  status: 'pending',
  detected_by: 'distillation-queue-writer',
};

/**
 * Build the eva_consultant_recommendations row for a distilled candidate.
 * Pure (no I/O) so it can be asserted directly in tests.
 *
 * @param {Object} candidate
 * @param {string} candidate.sourceWaveItemId   roadmap_wave_items.id (uuid) the distillation came from
 * @param {Object} candidate.distilledPayload   the distilled SD JSON ({title, description, ...})
 * @param {string} [candidate.title]            explicit title (else derived from distilledPayload.title)
 * @param {string} [candidate.description]      explicit description (else from distilledPayload)
 * @param {string} [candidate.confidenceTier]   'high' | 'medium' | 'low' (optional)
 * @param {number} [candidate.priorityScore]    optional priority/confidence score
 * @param {string} [candidate.recommendationDate] ISO date (defaults to today via the caller/DB)
 * @returns {Object} the row to insert
 */
export function buildRecommendationRow(candidate = {}) {
  const {
    sourceWaveItemId,
    distilledPayload,
    title,
    description,
    confidenceTier,
    priorityScore,
    recommendationDate,
  } = candidate;

  if (!sourceWaveItemId) {
    throw new Error('buildRecommendationRow: sourceWaveItemId is required');
  }
  if (!distilledPayload || typeof distilledPayload !== 'object') {
    throw new Error('buildRecommendationRow: distilledPayload object is required');
  }

  const resolvedTitle = (title || distilledPayload.title || 'Distilled brainstorm candidate')
    .toString()
    .substring(0, 255);

  const row = {
    recommendation_date: recommendationDate || new Date().toISOString().slice(0, 10),
    recommendation_type: DEFAULTS.recommendation_type,
    title: resolvedTitle,
    description: description || distilledPayload.description || null,
    action_type: DEFAULTS.action_type,
    status: DEFAULTS.status,
    detected_by: DEFAULTS.detected_by,
    source_wave_item_id: sourceWaveItemId,
    distilled_sd_payload: distilledPayload,
  };

  if (confidenceTier != null) row.confidence_tier = confidenceTier;
  if (priorityScore != null) row.priority_score = priorityScore;

  return row;
}

/**
 * Insert a distilled candidate into the chairman review queue.
 * Surfaces an insert error to the caller (does NOT swallow it).
 *
 * @param {Object} supabase  injected supabase client
 * @param {Object} candidate see buildRecommendationRow
 * @returns {Promise<Object>} { ok: true, row } on success
 * @throws on insert error or invalid candidate
 */
export async function enqueueDistilledCandidate(supabase, candidate) {
  if (!supabase || typeof supabase.from !== 'function') {
    throw new Error('enqueueDistilledCandidate: a supabase client is required');
  }
  const row = buildRecommendationRow(candidate);

  const { data, error } = await supabase
    .from('eva_consultant_recommendations')
    .insert(row)
    .select()
    .single();

  if (error) {
    // Surface, do not swallow (FR-3 / risk: missing NOT NULL or FK mismatch must be visible).
    throw new Error(`enqueueDistilledCandidate: insert failed: ${error.message}`);
  }

  return { ok: true, row: data };
}

export const __defaults = DEFAULTS;
