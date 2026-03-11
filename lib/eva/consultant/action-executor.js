/**
 * Post-Meeting Action Executor for EVA Consultant System
 *
 * Converts chairman Friday meeting decisions into immediate system actions:
 * - Accepted findings with action_type='create_sd' → new SD via leo-create-sd.js
 * - Baseline updates → propagate to management_reviews
 *
 * Rate-limited to MAX_SDS_PER_MEETING to prevent queue flooding.
 *
 * Part of SD-MAN-ORCH-FRIDAY-EVA-AUTONOMOUS-001-C
 */

import { createSD } from '../../../scripts/leo-create-sd.js';
import { generateSDKey, SD_SOURCES } from '../../../scripts/modules/sd-key-generator.js';
import { recordDecision } from './feedback-recorder.js';

const MAX_SDS_PER_MEETING = 5;

/**
 * Map recommendation fields to SD creation parameters.
 *
 * @param {object} recommendation - From eva_consultant_recommendations
 * @returns {object} Parameters for createSD()
 */
function mapRecommendationToSD(recommendation) {
  // Map recommendation_type → SD type
  const typeMap = {
    strategic: 'feature',
    tactical: 'fix',
    research: 'enhancement',
    operational: 'infrastructure'
  };
  const sdType = typeMap[recommendation.recommendation_type] || 'feature';

  return {
    title: recommendation.title,
    description: recommendation.description || recommendation.title,
    type: sdType,
    priority: recommendation.priority_score >= 0.7 ? 'high' : 'medium',
    rationale: `Auto-created from EVA consultant finding (${recommendation.application_domain || 'general'})`,
    metadata: {
      source: 'eva_recommendation',
      source_id: recommendation.id,
      trend_id: recommendation.trend_id,
      application_domain: recommendation.application_domain,
      confidence_tier: recommendation.confidence_tier,
      meeting_date: new Date().toISOString().split('T')[0]
    }
  };
}

/**
 * Execute actions from accepted Friday meeting findings.
 * Creates SDs for accepted findings where action_type='create_sd'.
 *
 * @param {object} supabase - Supabase client
 * @param {Array<{recommendationId: string, action: string, notes?: string}>} decisions
 * @returns {Promise<{sdsCreated: Array, feedbackRecorded: number, errors: Array}>}
 */
async function executeDecisions(supabase, decisions) {
  const results = {
    sdsCreated: [],
    feedbackRecorded: 0,
    baselineUpdates: 0,
    errors: []
  };

  let sdCount = 0;

  for (const decision of decisions) {
    // Record the feedback signal first
    const feedbackResult = await recordDecision(supabase, decision);
    if (feedbackResult.success) {
      results.feedbackRecorded++;
    } else {
      results.errors.push({ phase: 'feedback', id: decision.recommendationId, error: feedbackResult.error });
      continue;
    }

    // If accepted, check if we should create an SD
    if (decision.action === 'accepted') {
      // Fetch full recommendation to check action_type
      const { data: rec, error: fetchError } = await supabase
        .from('eva_consultant_recommendations')
        .select('*')
        .eq('id', decision.recommendationId)
        .single();

      if (fetchError || !rec) {
        results.errors.push({ phase: 'fetch', id: decision.recommendationId, error: fetchError?.message || 'Not found' });
        continue;
      }

      // Create SD if action_type warrants it and under rate limit
      if (rec.action_type === 'create_sd' && sdCount < MAX_SDS_PER_MEETING) {
        const sdResult = await createSDFromRecommendation(supabase, rec);
        if (sdResult.success) {
          results.sdsCreated.push(sdResult.sd);
          sdCount++;
        } else {
          results.errors.push({ phase: 'sd_creation', id: rec.id, error: sdResult.error });
        }
      }
    }
  }

  return results;
}

/**
 * Create a new SD from an accepted recommendation.
 *
 * @param {object} supabase
 * @param {object} recommendation - Full recommendation record
 * @returns {Promise<{success: boolean, sd?: object, error?: string}>}
 */
async function createSDFromRecommendation(supabase, recommendation) {
  try {
    const sdParams = mapRecommendationToSD(recommendation);

    // Generate the SD key
    const sdKey = generateSDKey({
      source: SD_SOURCES.EVA || 'EVA',
      type: sdParams.type,
      title: sdParams.title
    });

    const sd = await createSD({
      sdKey,
      ...sdParams
    });

    if (!sd || !sd.sd_key) {
      return { success: false, error: 'createSD returned no result' };
    }

    return { success: true, sd: { sd_key: sd.sd_key, title: sd.title, id: sd.id } };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Update baseline version in management_reviews when chairman approves.
 *
 * @param {object} supabase
 * @param {object} params
 * @param {string} params.baselineFrom - Previous baseline version
 * @param {string} params.baselineTo - New baseline version
 * @param {string} [params.reason] - Reason for baseline change
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function updateBaseline(supabase, { baselineFrom, baselineTo, reason }) {
  // Get the most recent management review
  const { data: review, error: fetchError } = await supabase
    .from('management_reviews')
    .select('id, baseline_version_from, baseline_version_to')
    .order('review_date', { ascending: false })
    .limit(1)
    .single();

  if (fetchError || !review) {
    return { success: false, error: `No management review found: ${fetchError?.message || 'empty'}` };
  }

  const before = {
    baseline_version_from: review.baseline_version_from,
    baseline_version_to: review.baseline_version_to
  };

  const { error: updateError } = await supabase
    .from('management_reviews')
    .update({
      baseline_version_from: baselineFrom,
      baseline_version_to: baselineTo
    })
    .eq('id', review.id);

  if (updateError) {
    return { success: false, error: `Baseline update failed: ${updateError.message}` };
  }

  // Log audit trail
  console.log(`[action-executor] Baseline updated: ${JSON.stringify(before)} → ${JSON.stringify({ baselineFrom, baselineTo })} (${reason || 'chairman approval'})`);

  return { success: true };
}

export {
  MAX_SDS_PER_MEETING,
  mapRecommendationToSD,
  executeDecisions,
  createSDFromRecommendation,
  updateBaseline
};
