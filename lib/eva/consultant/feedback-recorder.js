/**
 * Feedback Recorder for EVA Consultant System
 *
 * Records chairman accept/dismiss/defer decisions on Friday meeting findings.
 * Applies confidence weighting:
 * - Dismissed patterns: 4-week half-life decay (minimum floor: 0.1)
 * - Accepted patterns: dampened boost (0.25 factor, cap: 2.0)
 * - Domain-level weights propagate to related findings
 *
 * Part of SD-MAN-ORCH-FRIDAY-EVA-AUTONOMOUS-001-C
 */

const HALF_LIFE_WEEKS = 4;
const CONFIDENCE_FLOOR = 0.1;
const BOOST_FACTOR = 0.25;
const BOOST_CAP = 2.0;
const SECONDARY_BOOST = 0.1;
const BASELINE_WEIGHT = 1.0;

/**
 * Compute decay multiplier for a dismissed pattern.
 * Formula: 0.5^(weeks/HALF_LIFE_WEEKS)
 * Applied once at dismissal time (representing one "week" of negative signal).
 *
 * @param {number} currentWeight - Current feedback_weight
 * @returns {number} New weight (never below CONFIDENCE_FLOOR)
 */
function computeDecay(currentWeight) {
  // Each dismissal applies one half-life period worth of decay
  const decayed = currentWeight * Math.pow(0.5, 1 / HALF_LIFE_WEEKS);
  return Math.max(CONFIDENCE_FLOOR, Math.round(decayed * 1000) / 1000);
}

/**
 * Compute boost for an accepted pattern.
 * Formula: weight *= (1 + BOOST_FACTOR), capped at BOOST_CAP
 *
 * @param {number} currentWeight - Current feedback_weight
 * @returns {number} New weight (capped at BOOST_CAP)
 */
function computeBoost(currentWeight) {
  const boosted = currentWeight * (1 + BOOST_FACTOR);
  return Math.min(BOOST_CAP, Math.round(boosted * 1000) / 1000);
}

/**
 * Record a single chairman decision on a recommendation.
 *
 * @param {object} supabase - Supabase client
 * @param {object} params
 * @param {string} params.recommendationId - UUID of the recommendation
 * @param {string} params.action - 'accepted' | 'dismissed' | 'deferred'
 * @param {string} [params.notes] - Chairman reasoning/notes
 * @returns {Promise<{success: boolean, recommendation?: object, error?: string}>}
 */
async function recordDecision(supabase, { recommendationId, action, notes }) {
  const validActions = ['accepted', 'dismissed', 'deferred'];
  if (!validActions.includes(action)) {
    return { success: false, error: `Invalid action: ${action}. Must be one of: ${validActions.join(', ')}` };
  }

  // Map 'dismissed' to DB status 'rejected' (DB constraint only allows pending/accepted/deferred/rejected)
  const dbStatus = action === 'dismissed' ? 'rejected' : action;

  // Update the recommendation record
  const { data: rec, error: updateError } = await supabase
    .from('eva_consultant_recommendations')
    .update({
      status: dbStatus,
      chairman_feedback: notes || action,
      feedback_at: new Date().toISOString()
    })
    .eq('id', recommendationId)
    .select('id, trend_id, application_domain, title')
    .single();

  if (updateError) {
    return { success: false, error: `Failed to update recommendation: ${updateError.message}` };
  }

  // Apply confidence weighting to the trend if it exists
  if (rec.trend_id) {
    const weightResult = await adjustTrendWeight(supabase, rec.trend_id, action);
    if (!weightResult.success) {
      console.warn(`  Warning: Trend weight adjustment failed: ${weightResult.error}`);
    }
  }

  // Apply domain-level secondary boost for accepted findings
  if (action === 'accepted' && rec.application_domain) {
    await applyDomainSecondaryBoost(supabase, rec.application_domain, recommendationId);
  }

  return { success: true, recommendation: rec };
}

/**
 * Adjust the feedback_weight on an eva_consultant_trends record.
 *
 * @param {object} supabase
 * @param {string} trendId - UUID of the trend
 * @param {string} action - 'accepted' | 'dismissed' | 'deferred'
 * @returns {Promise<{success: boolean, oldWeight?: number, newWeight?: number, error?: string}>}
 */
async function adjustTrendWeight(supabase, trendId, action) {
  if (action === 'deferred') {
    return { success: true, oldWeight: null, newWeight: null }; // No weight change for deferred
  }

  const { data: trend, error: fetchError } = await supabase
    .from('eva_consultant_trends')
    .select('id, feedback_weight')
    .eq('id', trendId)
    .single();

  if (fetchError || !trend) {
    return { success: false, error: `Trend not found: ${trendId}` };
  }

  const oldWeight = trend.feedback_weight ?? BASELINE_WEIGHT;
  let newWeight;

  if (action === 'accepted') {
    newWeight = computeBoost(oldWeight);
  } else if (action === 'dismissed') {
    newWeight = computeDecay(oldWeight);
  } else {
    return { success: true, oldWeight, newWeight: oldWeight };
  }

  const { error: updateError } = await supabase
    .from('eva_consultant_trends')
    .update({ feedback_weight: newWeight })
    .eq('id', trendId);

  if (updateError) {
    return { success: false, error: `Weight update failed: ${updateError.message}` };
  }

  return { success: true, oldWeight, newWeight };
}

/**
 * Apply a secondary confidence boost to related findings in the same domain.
 * Only affects pending recommendations (not yet decided).
 *
 * @param {object} supabase
 * @param {string} domain - application_domain value
 * @param {string} excludeId - Recommendation to exclude (the one being accepted)
 */
async function applyDomainSecondaryBoost(supabase, domain, excludeId) {
  // Find pending recommendations in same domain with trend_ids
  const { data: relatedRecs } = await supabase
    .from('eva_consultant_recommendations')
    .select('id, trend_id')
    .eq('application_domain', domain)
    .eq('status', 'pending')
    .neq('id', excludeId)
    .not('trend_id', 'is', null);

  if (!relatedRecs || relatedRecs.length === 0) return;

  // Apply secondary boost to each related trend
  const trendIds = [...new Set(relatedRecs.map(r => r.trend_id))];
  for (const trendId of trendIds) {
    const { data: trend } = await supabase
      .from('eva_consultant_trends')
      .select('id, feedback_weight')
      .eq('id', trendId)
      .single();

    if (trend) {
      const currentWeight = trend.feedback_weight ?? BASELINE_WEIGHT;
      const boosted = Math.min(BOOST_CAP, Math.round((currentWeight + SECONDARY_BOOST) * 1000) / 1000);
      await supabase
        .from('eva_consultant_trends')
        .update({ feedback_weight: boosted })
        .eq('id', trendId);
    }
  }
}

/**
 * Record multiple decisions in batch (for Friday meeting flow).
 *
 * @param {object} supabase
 * @param {Array<{recommendationId: string, action: string, notes?: string}>} decisions
 * @returns {Promise<{processed: number, successes: number, failures: Array}>}
 */
async function recordBatch(supabase, decisions) {
  const results = { processed: 0, successes: 0, failures: [] };

  for (const decision of decisions) {
    results.processed++;
    const result = await recordDecision(supabase, decision);
    if (result.success) {
      results.successes++;
    } else {
      results.failures.push({ id: decision.recommendationId, error: result.error });
    }
  }

  return results;
}

export {
  HALF_LIFE_WEEKS,
  CONFIDENCE_FLOOR,
  BOOST_FACTOR,
  BOOST_CAP,
  SECONDARY_BOOST,
  BASELINE_WEIGHT,
  computeDecay,
  computeBoost,
  recordDecision,
  adjustTrendWeight,
  applyDomainSecondaryBoost,
  recordBatch
};
