/**
 * Feedback Quality Processor
 * SD-LEO-SELF-IMPROVE-001C - Phase 1: Feedback Quality Layer
 * SD-LEO-SELF-IMPROVE-001D - Phase 1.5: Feature Flag Integration
 *
 * Main integration module that orchestrates the quality processing pipeline:
 * 1. Sanitization (PII redaction, injection detection)
 * 2. Quality scoring (dimension-based assessment)
 * 3. Quarantine evaluation (risk-based blocking)
 * 4. Audit logging (comprehensive trail)
 *
 * Now integrated with LEO Feature Flags (CONST-009 kill switch supported).
 * Designed for fire-and-forget async processing with <250ms ACK time.
 *
 * @module lib/quality/feedback-quality-processor
 */

import { sanitize, loadConfig } from './sanitizer.js';
import { calculateQualityScore, getQualityTier, generateImprovementSuggestions } from './quality-scorer.js';
import { evaluateQuarantine, createQuarantineRecord } from './quarantine-engine.js';
import * as auditLogger from './audit-logger.js';
import { evaluateFlag } from '../feature-flags/index.js';

/**
 * Processing result status
 */
export const PROCESSING_STATUS = {
  SUCCESS: 'success',
  QUARANTINED: 'quarantined',
  ENHANCED: 'enhanced',
  SKIPPED: 'skipped',
  FAILED: 'failed'
};

/**
 * Process feedback through the quality pipeline
 * @param {Object} feedback - Feedback item to process
 * @param {Object} options - Processing options
 * @param {boolean} options.skipSanitization - Skip sanitization step
 * @param {boolean} options.skipScoring - Skip quality scoring
 * @param {boolean} options.skipQuarantine - Skip quarantine evaluation
 * @param {boolean} options.skipAudit - Skip audit logging
 * @param {Object} options.supabase - Supabase client for database operations
 * @param {string} options.subjectId - Subject ID for feature flag evaluation
 * @param {string} options.environment - Environment for feature flag evaluation
 * @returns {Promise<Object>} Processing result
 */
export async function processQuality(feedback, options = {}) {
  const startTime = Date.now();
  const result = {
    status: PROCESSING_STATUS.SUCCESS,
    original: { ...feedback },
    processed: { ...feedback },
    sanitization: null,
    qualityScore: null,
    quarantine: null,
    audit: [],
    featureFlags: {},
    processing_time_ms: 0
  };

  try {
    // Load config for thresholds and patterns
    const config = await loadConfig();

    // Feature flag evaluation context
    const flagContext = {
      subjectId: options.subjectId || feedback.source_id || 'anonymous',
      environment: options.environment || process.env.NODE_ENV || 'production'
    };

    // Evaluate feature flags for quality layer capabilities
    const sanitizationFlag = await evaluateFlag('quality_layer_sanitization', flagContext);
    const quarantineFlag = await evaluateFlag('quality_layer_quarantine', flagContext);
    const auditFlag = await evaluateFlag('quality_layer_audit_logging', flagContext);

    // Store flag evaluation results for debugging/audit
    result.featureFlags = {
      sanitization: sanitizationFlag,
      quarantine: quarantineFlag,
      audit: auditFlag
    };

    // Determine effective enabled state (feature flag AND config AND not skipped)
    const sanitizationEnabled = sanitizationFlag.enabled && config.enable_sanitization && !options.skipSanitization;
    const quarantineEnabled = quarantineFlag.enabled && config.enable_quarantine && !options.skipQuarantine;
    const auditEnabled = auditFlag.enabled;

    // Update audit logger state based on feature flag
    if (!auditEnabled) {
      // Temporarily disable audit logging if feature flag is off
      options.skipAudit = true;
    }

    // Step 1: Sanitization
    if (sanitizationEnabled) {
      await auditLogger.logSanitizationStart(feedback.id, options);

      result.sanitization = await sanitize(feedback);

      // Update processed feedback with sanitized content
      result.processed = {
        ...result.processed,
        ...result.sanitization.sanitized,
        metadata: {
          ...result.processed.metadata,
          sanitization: {
            applied: true,
            redaction_count: result.sanitization.redactions?.length || 0,
            injection_detected: result.sanitization.injection?.detected || false,
            risk_score: result.sanitization.injection?.risk_score || 0
          }
        }
      };

      await auditLogger.logSanitizationComplete(feedback.id, result.sanitization, options);

      // Log specific events
      if (result.sanitization.redactions?.length > 0) {
        await auditLogger.logPIIDetected(feedback.id, result.sanitization.redactions, options);
      }

      if (result.sanitization.injection?.detected) {
        await auditLogger.logInjectionDetected(feedback.id, result.sanitization.injection, options);
      }
    }

    // Step 2: Quarantine Evaluation
    if (quarantineEnabled && result.sanitization) {
      result.quarantine = await evaluateQuarantine(result.processed, result.sanitization);

      await auditLogger.logQuarantineEvaluated(feedback.id, result.quarantine, options);

      if (result.quarantine.shouldQuarantine) {
        result.status = PROCESSING_STATUS.QUARANTINED;

        // Create quarantine record if supabase client provided
        if (options.supabase && feedback.id) {
          await createQuarantineRecord(
            { ...result.processed, id: feedback.id },
            result.quarantine,
            options.supabase
          );
          await auditLogger.logQuarantineCreated(feedback.id, result.quarantine, options);
        }

        // Return early - quarantined items don't get further processing
        result.processing_time_ms = Date.now() - startTime;
        await auditLogger.logProcessingComplete(feedback.id, {
          sanitized: true,
          quarantined: true,
          totalProcessingTime: result.processing_time_ms
        }, options);

        return result;
      }
    }

    // Step 3: Quality Scoring
    if (!options.skipScoring) {
      result.qualityScore = await calculateQualityScore(result.processed);

      const tier = getQualityTier(result.qualityScore.score, {
        lowQualityThreshold: config.threshold_low
      });

      result.processed.metadata = {
        ...result.processed.metadata,
        quality: {
          score: result.qualityScore.score,
          tier,
          dimensions: result.qualityScore.dimensions
        }
      };

      await auditLogger.logQualityScored(feedback.id, result.qualityScore, options);

      // Generate improvement suggestions for low quality items
      if (tier === 'low') {
        result.processed.metadata.quality.suggestions = generateImprovementSuggestions(
          result.qualityScore.dimensions
        );
      }
    }

    result.processing_time_ms = Date.now() - startTime;

    // Final audit log
    await auditLogger.logProcessingComplete(feedback.id, {
      sanitized: result.sanitization != null,
      quarantined: false,
      qualityScore: result.qualityScore?.score,
      totalProcessingTime: result.processing_time_ms
    }, options);

    return result;

  } catch (error) {
    console.error('[FeedbackQualityProcessor] Processing failed:', error.message);
    result.status = PROCESSING_STATUS.FAILED;
    result.error = error.message;
    result.processing_time_ms = Date.now() - startTime;

    await auditLogger.log(
      auditLogger.AUDIT_EVENTS.PROCESSING_FAILED,
      feedback.id,
      { error: error.message },
      options
    );

    return result;
  }
}

/**
 * Process feedback asynchronously (fire-and-forget)
 * Returns immediately with acknowledgment, processes in background
 * @param {Object} feedback - Feedback item to process
 * @param {Object} options - Processing options
 * @returns {{ acknowledged: boolean, processId: string }}
 */
export function processQualityAsync(feedback, options = {}) {
  const processId = `fqp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Fire and forget - don't await
  processQuality(feedback, options)
    .then(result => {
      if (result.status === PROCESSING_STATUS.FAILED) {
        console.error(`[FeedbackQualityProcessor] Async process ${processId} failed:`, result.error);
      }
    })
    .catch(error => {
      console.error(`[FeedbackQualityProcessor] Async process ${processId} error:`, error.message);
    });

  return {
    acknowledged: true,
    processId
  };
}

/**
 * Batch process multiple feedback items
 * @param {Array<Object>} feedbackItems - Items to process
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Batch processing results
 */
export async function batchProcessQuality(feedbackItems, options = {}) {
  const startTime = Date.now();
  const results = {
    total: feedbackItems.length,
    success: 0,
    quarantined: 0,
    failed: 0,
    items: []
  };

  for (const feedback of feedbackItems) {
    try {
      const result = await processQuality(feedback, options);
      results.items.push(result);

      switch (result.status) {
        case PROCESSING_STATUS.SUCCESS:
        case PROCESSING_STATUS.ENHANCED:
          results.success++;
          break;
        case PROCESSING_STATUS.QUARANTINED:
          results.quarantined++;
          break;
        case PROCESSING_STATUS.FAILED:
          results.failed++;
          break;
      }
    } catch (error) {
      results.failed++;
      results.items.push({
        status: PROCESSING_STATUS.FAILED,
        error: error.message,
        original: feedback
      });
    }
  }

  results.processing_time_ms = Date.now() - startTime;

  return results;
}

/**
 * Get processing statistics
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Object>} Processing statistics
 */
export async function getProcessingStats(supabase) {
  const { data, error } = await supabase
    .from('feedback')
    .select('metadata, status')
    .not('metadata->sanitization', 'is', null);

  if (error) throw error;

  const stats = {
    totalProcessed: data?.length || 0,
    withRedactions: 0,
    withInjectionDetected: 0,
    quarantined: 0,
    avgQualityScore: 0,
    qualityTiers: { high: 0, medium: 0, low: 0 }
  };

  let totalQualityScore = 0;
  let scoredCount = 0;

  for (const item of data || []) {
    const sanitization = item.metadata?.sanitization;
    const quality = item.metadata?.quality;

    if (sanitization?.redaction_count > 0) stats.withRedactions++;
    if (sanitization?.injection_detected) stats.withInjectionDetected++;
    if (item.status === 'quarantined') stats.quarantined++;

    if (quality?.score != null) {
      totalQualityScore += quality.score;
      scoredCount++;
      if (quality.tier) {
        stats.qualityTiers[quality.tier] = (stats.qualityTiers[quality.tier] || 0) + 1;
      }
    }
  }

  if (scoredCount > 0) {
    stats.avgQualityScore = Math.round(totalQualityScore / scoredCount);
  }

  return stats;
}

// Export default for CommonJS compatibility
export default {
  PROCESSING_STATUS,
  processQuality,
  processQualityAsync,
  batchProcessQuality,
  getProcessingStats
};
