/**
 * Feedback Dimension Aggregator
 * SD: SD-EHG-ORCH-INTELLIGENCE-INTEGRATION-001-E (FR-002)
 *
 * Computes per-dimension quality metrics from classified feedback.
 * Queries the feedback table for items tagged with dimension_codes in metadata,
 * then aggregates rubric_score values per dimension.
 */

const DEFAULT_LOOKBACK_DAYS = 30;
const MAX_FEEDBACK_ITEMS = 500;

/**
 * Aggregate feedback quality metrics per dimension.
 *
 * @param {Object} supabase - Supabase client
 * @param {string[]} dimensionIds - Dimension IDs to aggregate (e.g., ['V01', 'V02', 'A01'])
 * @param {Object} [options]
 * @param {number} [options.lookbackDays=30] - How far back to look
 * @returns {Promise<Record<string, { avgScore: number, count: number, recentCount: number, trend: number }>>}
 */
export async function aggregateFeedbackQuality(supabase, dimensionIds, options = {}) {
  if (!supabase || !dimensionIds || dimensionIds.length === 0) return {};

  const lookbackDays = options.lookbackDays || DEFAULT_LOOKBACK_DAYS;
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  // Query feedback items that have rubric_score within the lookback window.
  // We filter for dimension_codes in application code because Supabase JSONB
  // array containment queries on metadata->dimension_codes are complex.
  const { data: feedbackItems, error } = await supabase
    .from('feedback')
    .select('id, rubric_score, metadata, created_at')
    .not('rubric_score', 'is', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(MAX_FEEDBACK_ITEMS);

  if (error) {
    console.warn(`[FeedbackAggregator] Query failed: ${error.message}`);
    return {};
  }

  if (!feedbackItems || feedbackItems.length === 0) return {};

  // Midpoint for trend calculation (recent half vs full window)
  const halfLookback = new Date(Date.now() - (lookbackDays / 2) * 24 * 60 * 60 * 1000).toISOString();
  const dimSet = new Set(dimensionIds);

  // Build per-dimension score arrays
  const aggregates = {};

  for (const item of feedbackItems) {
    const dimCodes = item.metadata?.dimension_codes;
    if (!Array.isArray(dimCodes)) continue;

    for (const dimId of dimCodes) {
      if (!dimSet.has(dimId)) continue;

      if (!aggregates[dimId]) {
        aggregates[dimId] = { scores: [], recentScores: [] };
      }

      aggregates[dimId].scores.push(item.rubric_score);

      if (item.created_at >= halfLookback) {
        aggregates[dimId].recentScores.push(item.rubric_score);
      }
    }
  }

  // Compute final metrics
  const result = {};
  for (const [dimId, agg] of Object.entries(aggregates)) {
    const avgScore = agg.scores.reduce((a, b) => a + b, 0) / agg.scores.length;
    const recentAvg = agg.recentScores.length > 0
      ? agg.recentScores.reduce((a, b) => a + b, 0) / agg.recentScores.length
      : avgScore;

    // Trend: positive = quality improving, negative = declining
    const trend = agg.recentScores.length > 0 ? recentAvg - avgScore : 0;

    result[dimId] = {
      avgScore: Math.round(avgScore * 100) / 100,
      count: agg.scores.length,
      recentCount: agg.recentScores.length,
      trend: Math.round(trend * 100) / 100,
    };
  }

  return result;
}
