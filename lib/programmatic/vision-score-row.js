/**
 * Vision-score row builder for the programmatic (tool-loop) scorer.
 * QF-20260609-493: extracted so the persist logic is unit-testable without the CLI.
 *
 * Root cause it serves: scripts/programmatic/vision-scorer.js used to ask the LLM to
 * supabase_upsert AND then echo the score JSON in its final message. On the Gemini
 * fallback the final message frequently omitted the JSON, so the caller saw
 * "No JSON found in scorer output" and wrote nothing — even though --dry-run returned a
 * valid score. The fix scores the model in score-only mode (final message = the JSON) and
 * persists the row in JS via buildVisionScoreRow().
 *
 * @module lib/programmatic/vision-score-row
 */

/** Allowed values for eva_vision_scores.threshold_action (DB CHECK constraint). */
export const THRESHOLD_ACTIONS = ['accept', 'minor_sd', 'gap_closure_sd', 'escalate'];

/**
 * Map the programmatic rubric's action (proceed/minor_sd/corrective_sd/block) onto the
 * eva_vision_scores.threshold_action CHECK vocab. Already-canonical values pass through;
 * anything unrecognised fails safe to 'escalate' (most conservative — never a constraint
 * violation, which is what silently dropped the row before).
 *
 * @param {string} action
 * @returns {string} one of THRESHOLD_ACTIONS
 */
export function mapThresholdAction(action) {
  const MAP = { proceed: 'accept', minor_sd: 'minor_sd', corrective_sd: 'gap_closure_sd', block: 'escalate' };
  if (MAP[action]) return MAP[action];
  return THRESHOLD_ACTIONS.includes(action) ? action : 'escalate';
}

/**
 * Extract and parse the score JSON object from a model's final text message.
 * Returns null when no JSON object is present or it does not parse, so the caller can
 * retry / fail loudly instead of throwing.
 *
 * @param {string} text
 * @returns {Object|null}
 */
export function extractScoreJson(text) {
  const m = (text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

/**
 * Build a fully-populated eva_vision_scores row. Supplies every NOT-NULL column that has
 * no DB default (vision_id, total_score, dimension_scores, threshold_action,
 * rubric_snapshot) — the model's old upsert omitted vision_id/rubric_snapshot, which is
 * why valid scores failed to persist. iteration/scored_at/metadata fall back to their
 * column defaults (metadata carries scoring_method, which is NOT a real column).
 *
 * @param {{scoreData: Object, visionId: string, archPlanId?: string|null, sdId: string}} args
 * @returns {Object} insertable eva_vision_scores row
 */
export function buildVisionScoreRow({ scoreData, visionId, archPlanId, sdId }) {
  return {
    vision_id: visionId,
    arch_plan_id: archPlanId ?? null,
    sd_id: sdId,
    total_score: scoreData.total_score,
    dimension_scores: scoreData.dimension_scores ?? {},
    threshold_action: mapThresholdAction(scoreData.action),
    rubric_snapshot: { rubric: 'eva-5dim-v1', source: 'vision-scorer-programmatic' },
    created_by: 'vision-scorer-programmatic',
    metadata: { scoring_method: 'programmatic-ollama' },
  };
}
