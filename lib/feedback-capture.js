/**
 * Feedback Capture Utility
 * SD-QUALITY-INT-001 - Error capture for Node.js runtime errors
 *
 * Captures unhandled exceptions and rejections, logs them to the feedback table
 * with deduplication based on error hash and time window.
 */

const crypto = require('crypto');

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
function generateErrorHash(error) {
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
async function captureError(error, options = {}, supabase) {
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

    // Create new feedback record
    const feedbackRecord = {
      type: 'issue',
      title: error.message?.substring(0, 200) || 'Unknown error',
      description: `${error.message || 'Unknown error'}\n\nStack trace:\n${error.stack || 'No stack trace'}`,
      severity: options.severity || 'medium',
      priority: options.priority || 'P2',
      status: 'open',
      source_type: options.source_type || 'error_capture',
      source_url: options.context || process.cwd(),
      source_application: 'EHG_Engineer',
      error_hash: hash,
      occurrence_count: 1,
      metadata: {
        ...options.metadata,
        error_name: error.name,
        node_version: process.version,
        platform: process.platform,
        captured_at: new Date().toISOString()
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error: insertError } = await supabase
      .from('feedback')
      .insert(feedbackRecord)
      .select('id')
      .single();

    if (insertError) {
      console.error('[FeedbackCapture] Failed to insert feedback:', insertError);
      return { success: false, error: insertError.message };
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
function initializeErrorHandlers(supabase) {
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
        priority: 'P0',
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
        priority: 'P1',
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
  console.log('[FeedbackCapture] Error handlers initialized');
  return true;
}

/**
 * Manual capture function for catching errors in specific code blocks
 * @param {Error} error
 * @param {Object} context
 * @param {Object} supabase
 * @returns {Promise<{ success: boolean, id?: string }>}
 */
async function captureException(error, context = {}, supabase) {
  return captureError(error, {
    source_type: context.source_type || 'manual_capture',
    context: context.location || new Error().stack?.split('\n')[2] || 'unknown',
    severity: context.severity || 'medium',
    priority: context.priority || 'P2',
    metadata: context.metadata || {}
  }, supabase);
}

module.exports = {
  captureError,
  captureException,
  initializeErrorHandlers,
  generateErrorHash,
  // Exposed for testing
  _checkDuplicate: checkDuplicate,
  _cleanupCache: cleanupCache,
  _errorCache: errorCache
};
