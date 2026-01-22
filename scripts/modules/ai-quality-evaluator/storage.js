/**
 * AI Quality Evaluator - Storage
 * Assessment storage and orchestrator context enrichment
 */

/**
 * Enrich SD object with orchestrator context
 * Detects if SD is a parent with children and adds relevant metadata
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} sd - Strategic Directive object
 * @returns {Promise<Object>} Enriched SD object
 */
export async function enrichWithOrchestratorContext(supabase, sd) {
  if (!sd || !sd.id) return sd;

  try {
    // Check if this SD has children
    const { data: children, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status, progress_percentage')
      .eq('parent_sd_id', sd.id);

    if (error) {
      console.warn(`Could not check orchestrator status for ${sd.id}:`, error.message);
      sd._orchestratorChecked = true;
      return sd;
    }

    const isOrchestrator = children && children.length > 0;
    const completedChildren = children?.filter(c => c.status === 'completed').length || 0;
    const totalChildren = children?.length || 0;

    // Enrich SD with orchestrator metadata
    return {
      ...sd,
      _orchestratorChecked: true,
      _isOrchestrator: isOrchestrator,
      _childCount: totalChildren,
      _completedChildCount: completedChildren,
      _childrenAllComplete: totalChildren > 0 && completedChildren === totalChildren
    };
  } catch (err) {
    console.warn(`Orchestrator check failed for ${sd.id}:`, err.message);
    sd._orchestratorChecked = true;
    return sd;
  }
}

/**
 * Store assessment in database with sd_type, threshold tracking, band, and confidence
 * v1.2.0: Added band and confidence for stable decision caching
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} rubricConfig - Rubric configuration
 * @param {string} contentId - Content ID
 * @param {Object} scores - Score data
 * @param {number} weightedScore - Weighted score 0-100
 * @param {Object} feedback - Generated feedback
 * @param {number} duration - Assessment duration in ms
 * @param {Object} tokensUsed - Token usage
 * @param {number} cost - Cost in USD
 * @param {Object} sd - Strategic Directive
 * @param {number} threshold - Pass threshold
 * @param {string} contentHash - Content hash
 * @param {string} band - Scoring band
 * @param {string} confidence - Confidence level
 * @param {string} confidenceReasoning - Confidence reasoning
 * @param {string} model - Model used
 * @param {number} temperature - Temperature used
 */
export async function storeAssessment(
  supabase,
  rubricConfig,
  contentId,
  scores,
  weightedScore,
  feedback,
  duration,
  tokensUsed,
  cost,
  sd = null,
  threshold = 70,
  contentHash = null,
  band = null,
  confidence = null,
  confidenceReasoning = null,
  model,
  temperature
) {
  // Guard: Skip storage if contentId is null/undefined
  if (!contentId) {
    console.warn(`[AIQualityEvaluator] Skipping assessment storage: content_id is ${contentId === null ? 'null' : 'undefined'} for content_type=${rubricConfig.contentType}`);
    console.warn(`[AIQualityEvaluator] This may indicate a missing 'id' field in the evaluated content. Score: ${weightedScore}%`);
    return;
  }

  try {
    const insertData = {
      content_type: rubricConfig.contentType,
      content_id: contentId,
      model,
      temperature,
      scores,
      weighted_score: weightedScore,
      feedback,
      assessment_duration_ms: duration,
      tokens_used: tokensUsed,
      cost_usd: cost,
      rubric_version: 'v1.2.0-scoring-bands',
      sd_type: sd?.sd_type || null,
      pass_threshold: threshold
    };

    // v1.2.0: Include band and confidence for stable decision caching
    if (band) insertData.band = band;
    if (confidence) insertData.confidence = confidence;
    if (confidenceReasoning) insertData.confidence_reasoning = confidenceReasoning;

    // Include content_hash for cache invalidation
    if (contentHash) {
      insertData.content_hash = contentHash;
    }

    const { error } = await supabase
      .from('ai_quality_assessments')
      .insert(insertData);

    if (error) {
      // Handle missing columns gracefully (backward compatible)
      const missingColumnFields = ['content_hash', 'band', 'confidence', 'confidence_reasoning'];
      let needsRetry = false;

      for (const field of missingColumnFields) {
        if (error.message?.includes(field)) {
          delete insertData[field];
          needsRetry = true;
        }
      }

      if (needsRetry) {
        const { error: retryError } = await supabase
          .from('ai_quality_assessments')
          .insert(insertData);
        if (retryError) {
          console.error('Failed to store assessment (retry):', retryError);
        }
      } else {
        console.error('Failed to store assessment:', error);
      }
      // Don't throw - assessment succeeded even if storage failed
    }
  } catch (error) {
    console.error('Database storage error:', error);
    // Don't throw - assessment succeeded even if storage failed
  }
}
