/**
 * Pure recommendation-row builder (SD-LEO-ORCH-GEMINI-MODEL-SCAN-001-I).
 * Builds the data for the ONE feedback-table write per surviving candidate -- never
 * writes anything itself. See TR-2: the known-models JSON write and this recommendation
 * insert are the only two write operations anywhere in this change.
 */

export const GOOGLE_TERMS_URL = 'https://ai.google.dev/gemini-api/terms';

/**
 * @param {{ modelId: string, lifecycle: string, evalResult: {ok: boolean, costUsd: number, latencyMs: number}, retrievedAt: string }} params
 * @returns {object} a row shaped for the feedback table (category='gemini_model_swap_recommendation')
 */
export function buildRecommendation({ modelId, lifecycle, evalResult, retrievedAt }) {
  return {
    category: 'gemini_model_swap_recommendation',
    description:
      `New Gemini model candidate: ${modelId} (lifecycle: ${lifecycle}). ` +
      `Smoke-eval: ${evalResult.ok ? 'passed' : 'FAILED'}, cost $${evalResult.costUsd.toFixed(4)}, ` +
      `avg latency ${evalResult.latencyMs}ms. Terms: ${GOOGLE_TERMS_URL} (retrieved ${retrievedAt}). ` +
      'Recommendation only -- no automatic adoption.',
    metadata: {
      source: 'gemini-weekly-scan',
      model_id: modelId,
      lifecycle,
      eval_cost_usd: evalResult.costUsd,
      eval_latency_ms: evalResult.latencyMs,
      eval_ok: evalResult.ok,
      terms_url: GOOGLE_TERMS_URL,
      terms_retrieved_at: retrievedAt,
    },
  };
}
