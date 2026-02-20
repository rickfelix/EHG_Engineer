/**
 * Feedback Capture Utility
 * SD-QUALITY-INT-001 - Error capture for Node.js runtime errors
 * SD-QUALITY-TRIAGE-001 - Integrated with priority-calculator and burst-detector
 *
 * Captures unhandled exceptions and rejections, logs them to the feedback table
 * with deduplication based on error hash and time window.
 * Uses priority-calculator for dynamic priority assignment.
 * Uses burst-detector to group rapid similar errors.
 */

import crypto from 'crypto';
import { calculatePriority } from './quality/priority-calculator.js';
import { findExistingBurstGroup, addToBurstGroup } from './quality/burst-detector.js';
// generateFingerprint available in ./quality/burst-detector.js if needed
import { matchesIgnorePattern } from './quality/ignore-patterns.js';
import { notifyHighSeverityFeedback } from './uat/risk-router.js';
// SD-LEO-SELF-IMPROVE-001C: Feedback Quality Layer
import { processQuality, PROCESSING_STATUS } from './quality/feedback-quality-processor.js';
// SD-EHG-ORCH-INTELLIGENCE-INTEGRATION-001-E: Vision dimension classification
import { classifyFeedback } from './eva/feedback-dimension-classifier.js';
import { publishVisionEvent, VISION_EVENTS } from './eva/event-bus/vision-events.js';

// Cache for deduplication
const errorCache = new Map();
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// Track if handlers are already attached
let isInitialized = false;

/**
 * Generate a hash for error deduplication
 * @param {Error} error
 * @returns {string}
 */
export function generateErrorHash(error) {
  const content = `${error.message || ''}|${error.stack?.split('\n').slice(0, 3).join('|') || ''}`;
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Check if error is a duplicate within the time window
 * @param {string} hash
 * @returns {{ isDuplicate: boolean, count: number }}
 */
function checkDuplicate(hash) {
  const cached = errorCache.get(hash);
  const now = Date.now();

  if (cached && (now - cached.firstSeen) < DEDUP_WINDOW_MS) {
    cached.count++;
    return { isDuplicate: true, count: cached.count };
  }

  // New error or outside window
  errorCache.set(hash, { firstSeen: now, count: 1 });
  return { isDuplicate: false, count: 1 };
}

/**
 * Clean up old entries from cache
 */
function cleanupCache() {
  const now = Date.now();
  for (const [hash, data] of errorCache.entries()) {
    if (now - data.firstSeen >= DEDUP_WINDOW_MS) {
      errorCache.delete(hash);
    }
  }
}

/**
 * Capture an error and log it to the feedback table
 * @param {Error} error - The error to capture
 * @param {Object} options - Additional options
 * @param {string} options.source_type - Type of error source (default: 'error_capture')
 * @param {string} options.context - Additional context about where the error occurred
 * @param {Object} options.metadata - Additional metadata to attach
 * @param {Object} supabase - Supabase client instance
 * @returns {Promise<{ success: boolean, id?: string, deduplicated?: boolean, error?: string }>}
 */
export async function captureError(error, options = {}, supabase) {
  try {
    // Validate inputs
    if (!error) {
      return { success: false, error: 'No error provided' };
    }

    if (!supabase) {
      console.error('[FeedbackCapture] No Supabase client provided');
      return { success: false, error: 'No database client' };
    }

    const hash = generateErrorHash(error);
    const { isDuplicate, count } = checkDuplicate(hash);

    if (isDuplicate) {
      // Update occurrence count instead of creating new record
      const { error: updateError } = await supabase
        .from('feedback')
        .update({
          occurrence_count: count,
          updated_at: new Date().toISOString()
        })
        .eq('error_hash', hash)
        .order('created_at', { ascending: false })
        .limit(1);

      if (updateError) {
        console.error('[FeedbackCapture] Failed to update occurrence count:', updateError);
        // Don't fail - this is non-critical
      }

      return { success: true, deduplicated: true, count };
    }

    // Build preliminary feedback record for priority calculation and ignore check
    const preliminaryRecord = {
      type: 'issue',
      title: error.message?.substring(0, 200) || 'Unknown error',
      error_type: error.name || 'Error',
      severity: options.severity || 'medium',
      source_type: options.source_type || 'error_capture',
      source_application: 'EHG_Engineer'
    };

    // SD-QUALITY-TRIAGE-001: Check ignore patterns before proceeding
    try {
      const matchedPattern = await matchesIgnorePattern(preliminaryRecord);
      if (matchedPattern) {
        console.log(`[FeedbackCapture] Ignored by pattern: ${matchedPattern.pattern_value}`);
        return {
          success: true,
          ignored: true,
          pattern: matchedPattern.id,
          reason: matchedPattern.reason || 'Matched ignore pattern'
        };
      }
    } catch (ignoreError) {
      // Ignore pattern check is non-critical, continue
      console.log('[FeedbackCapture] Ignore pattern check skipped:', ignoreError.message);
    }

    // SD-QUALITY-TRIAGE-001: Use priority-calculator instead of hardcoded values
    const priorityResult = calculatePriority(preliminaryRecord);

    // SD-LEO-SELF-IMPROVE-001C: Apply quality processing (sanitization, scoring, quarantine)
    let qualityResult = null;
    try {
      qualityResult = await processQuality({
        title: error.message?.substring(0, 200) || 'Unknown error',
        description: `${error.message || 'Unknown error'}\n\nStack trace:\n${error.stack || 'No stack trace'}`,
        source_url: options.context || process.cwd(),
        error_type: error.name || 'Error'
      }, {
        supabase,
        skipAudit: true // Audit after insert when we have ID
      });

      // If quarantined, mark the record accordingly
      if (qualityResult.status === PROCESSING_STATUS.QUARANTINED) {
        console.log('[FeedbackCapture] Feedback quarantined - high risk content detected');
      }
    } catch (qualityError) {
      // Quality processing is non-critical, continue with capture
      console.log('[FeedbackCapture] Quality processing skipped:', qualityError.message);
    }

    // Create new feedback record with calculated priority
    // SD-LEO-SELF-IMPROVE-001C: Use sanitized content if available
    const sanitizedTitle = qualityResult?.processed?.title ||
      error.message?.substring(0, 200) || 'Unknown error';
    const sanitizedDescription = qualityResult?.processed?.description ||
      `${error.message || 'Unknown error'}\n\nStack trace:\n${error.stack || 'No stack trace'}`;

    const feedbackRecord = {
      type: 'issue',
      title: sanitizedTitle,
      description: sanitizedDescription,
      severity: options.severity || 'medium',
      priority: priorityResult.priority,
      priority_reasoning: priorityResult.reasoning,
      status: qualityResult?.status === PROCESSING_STATUS.QUARANTINED ? 'quarantined' : 'new',
      source_type: options.source_type || 'error_capture',
      source_url: options.context || process.cwd(),
      source_application: 'EHG_Engineer',
      error_hash: hash,
      error_type: error.name || 'Error',
      occurrence_count: 1,
      // SD-FDBK-ENH-ADD-QUALITY-SCORING-001: Persist quality scores to dedicated columns
      rubric_score: qualityResult?.qualityScore?.score ?? null,
      quality_assessment: qualityResult?.processed?.metadata?.quality ? {
        score: qualityResult.processed.metadata.quality.score,
        tier: qualityResult.processed.metadata.quality.tier,
        dimensions: qualityResult.processed.metadata.quality.dimensions,
        suggestions: qualityResult.processed.metadata.quality.suggestions || null
      } : null,
      metadata: {
        ...options.metadata,
        error_name: error.name,
        node_version: process.version,
        platform: process.platform,
        captured_at: new Date().toISOString(),
        priority_calculation: priorityResult,
        // SD-LEO-SELF-IMPROVE-001C: Quality layer metadata
        ...(qualityResult?.processed?.metadata || {}),
        quality_processing: qualityResult ? {
          status: qualityResult.status,
          processing_time_ms: qualityResult.processing_time_ms,
          quarantine: qualityResult.quarantine
        } : null
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // SD-QUALITY-TRIAGE-001: Check for existing burst group before inserting
    try {
      const existingBurstGroup = await findExistingBurstGroup(feedbackRecord);
      if (existingBurstGroup) {
        // Insert the record first, then add to burst group
        const { data: insertedData, error: insertError } = await supabase
          .from('feedback')
          .insert(feedbackRecord)
          .select('id')
          .single();

        if (!insertError && insertedData) {
          await addToBurstGroup({ id: insertedData.id, ...feedbackRecord }, existingBurstGroup);
          return {
            success: true,
            id: insertedData.id,
            deduplicated: false,
            burstGrouped: true,
            burstGroupId: existingBurstGroup.id
          };
        }
      }
    } catch (burstError) {
      // Burst detection is non-critical, continue with normal insert
      console.log('[FeedbackCapture] Burst detection skipped:', burstError.message);
    }

    const { data, error: insertError } = await supabase
      .from('feedback')
      .insert(feedbackRecord)
      .select('id')
      .single();

    if (insertError) {
      console.error('[FeedbackCapture] Failed to insert feedback:', insertError);
      return { success: false, error: insertError.message };
    }

    // SD-EHG-ORCH-INTELLIGENCE-INTEGRATION-001-E: Classify feedback against vision dimensions
    // and publish event for aggregation. Non-blocking — never fail the capture.
    try {
      const dimensionMatches = await classifyFeedback(
        sanitizedTitle,
        sanitizedDescription,
        supabase
      );

      if (dimensionMatches.length > 0) {
        publishVisionEvent(VISION_EVENTS.FEEDBACK_QUALITY_UPDATED, {
          feedbackId: data?.id,
          title: sanitizedTitle,
          dimensionMatches,
          rubricScore: feedbackRecord.rubric_score,
          supabase,
        });
      }
    } catch (classifyError) {
      console.log('[FeedbackCapture] Dimension classification skipped:', classifyError.message);
    }

    // SD-QUALITY-INT-001: Notify Risk Router for high-severity feedback (P0/P1)
    if (['P0', 'P1'].includes(priorityResult.priority)) {
      try {
        const riskNotification = await notifyHighSeverityFeedback({
          id: data?.id,
          ...feedbackRecord
        });
        if (riskNotification.processed) {
          console.log(`[FeedbackCapture] Risk Router notified: ${riskNotification.routing?.recommendation || 'assessed'}`);
        }
      } catch (riskError) {
        // Risk notification is non-critical, don't fail the capture
        console.log('[FeedbackCapture] Risk notification skipped:', riskError.message);
      }
    }

    return { success: true, id: data?.id, deduplicated: false };

  } catch (captureErr) {
    // Fail-safe: never crash the application
    console.error('[FeedbackCapture] Capture failed safely:', captureErr.message);
    return { success: false, error: captureErr.message };
  }
}

/**
 * Initialize global error handlers
 * @param {Object} supabase - Supabase client instance
 * @returns {boolean} Whether initialization was successful
 */
export function initializeErrorHandlers(supabase) {
  if (isInitialized) {
    console.log('[FeedbackCapture] Already initialized');
    return true;
  }

  if (!supabase) {
    console.error('[FeedbackCapture] No Supabase client provided for initialization');
    return false;
  }

  // Handle uncaught exceptions
  process.on('uncaughtException', async (error, origin) => {
    try {
      await captureError(error, {
        source_type: 'uncaught_exception',
        context: origin,
        severity: 'critical',
        // Priority will be calculated by priority-calculator
        metadata: { origin }
      }, supabase);
    } catch {
      // Fail-safe
    }
    // Re-throw to maintain default behavior (process exit)
    // Comment out next line if you want the process to continue
    // throw error;
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', async (reason, _promise) => {
    try {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      await captureError(error, {
        source_type: 'unhandled_rejection',
        context: 'Promise rejection',
        severity: 'high',
        // Priority will be calculated by priority-calculator
        metadata: { type: 'unhandled_rejection' }
      }, supabase);
    } catch {
      // Fail-safe
    }
  });

  // Cleanup cache periodically
  const cleanupInterval = setInterval(cleanupCache, DEDUP_WINDOW_MS);
  cleanupInterval.unref(); // Don't keep process alive

  isInitialized = true;
  console.log('[FeedbackCapture] Error handlers initialized (with triage integration)');
  return true;
}

/**
 * Manual capture function for catching errors in specific code blocks
 * @param {Error} error
 * @param {Object} context
 * @param {Object} supabase
 * @returns {Promise<{ success: boolean, id?: string }>}
 */
export async function captureException(error, context = {}, supabase) {
  return captureError(error, {
    source_type: context.source_type || 'manual_capture',
    context: context.location || new Error().stack?.split('\n')[2] || 'unknown',
    severity: context.severity || 'medium',
    // Priority will be calculated by priority-calculator
    metadata: context.metadata || {}
  }, supabase);
}

// Exposed for testing
export const _checkDuplicate = checkDuplicate;
export const _cleanupCache = cleanupCache;
export const _errorCache = errorCache;

// Default export for CommonJS compatibility
export default {
  captureError,
  captureException,
  initializeErrorHandlers,
  generateErrorHash,
  _checkDuplicate: checkDuplicate,
  _cleanupCache: cleanupCache,
  _errorCache: errorCache
};
