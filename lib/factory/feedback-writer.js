/**
 * Feedback Writer
 *
 * Writes sanitized errors to the central feedback table with error_hash
 * deduplication. Links back to Sentry via sentry_issue_id for traceability.
 *
 * SD: SD-LEO-INFRA-SOFTWARE-FACTORY-AUTOMATED-001
 */

import { createHash } from 'crypto';
import { createSupabaseServiceClient } from '../supabase-client.js';
import { sanitize } from './content-sanitizer.js';

/**
 * Write sanitized errors to the feedback table with dedup.
 *
 * @param {string} ventureId - Venture UUID
 * @param {string} ventureName - Venture name (for source_application)
 * @param {object[]} errors - Raw errors from sentry-poller
 * @returns {Promise<{written: number, deduped: number, injectionFlagged: number}>}
 */
export async function writeErrors(ventureId, ventureName, errors) {
  const supabase = createSupabaseServiceClient();
  let written = 0;
  let deduped = 0;
  let injectionFlagged = 0;

  for (const error of errors) {
    const errorHash = computeHash(ventureName, error.title, error.value);

    // Check for existing error with same hash (dedup)
    const { data: existing } = await supabase
      .from('feedback')
      .select('id')
      .eq('error_hash', errorHash)
      .limit(1)
      .single();

    if (existing) {
      deduped++;
      continue;
    }

    // Sanitize for LLM safety
    const safe = sanitize(error);
    if (safe.injectionDetected) {
      injectionFlagged++;
      console.warn(`[FeedbackWriter] Injection detected in error from ${ventureName}: ${error.title}`);
    }

    // Write to feedback table
    const { error: insertError } = await supabase
      .from('feedback')
      .insert({
        source_application: ventureName,
        venture_id: ventureId,
        feedback_type: 'sentry_error',
        error_hash: errorHash,
        severity: error.severity || 'medium',
        content: `${safe.title}\n${safe.value}\n${safe.stacktrace}`.trim(),
        sentry_issue_id: error.sentryIssueId || null,
        sentry_first_seen: error.firstSeen || null,
        auto_correction_status: 'pending',
        metadata: {
          sentry_short_id: error.shortId,
          platform: error.platform,
          occurrence_count: error.count,
          injection_flagged: safe.injectionDetected,
          source: 'software-factory-poller'
        }
      });

    if (insertError) {
      console.error(`[FeedbackWriter] Insert failed for ${ventureName}/${errorHash}: ${insertError.message}`);
    } else {
      written++;
    }
  }

  return { written, deduped, injectionFlagged };
}

/**
 * Compute a stable hash for error deduplication.
 * Uses venture name + error title + error value to create a unique fingerprint.
 */
function computeHash(ventureName, title, value) {
  return createHash('sha256')
    .update(`${ventureName}:${title}:${value}`)
    .digest('hex')
    .slice(0, 32);
}

export { computeHash };
