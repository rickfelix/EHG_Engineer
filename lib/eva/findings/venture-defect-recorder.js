/**
 * venture-defect-recorder.js
 *
 * SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C (FR-4)
 *
 * Sibling to ./factory-defect-recorder.js for feedback.category='venture_defect' -- findings
 * that indicate the VENTURE's own application is broken (a UAT journey step failed against
 * real app behavior), as opposed to factory_defect (a broken LEO gate/instrument). Reuses
 * ONLY factory-defect-recorder.js's imported computeDedupHash helper; its own dedup lookup is
 * independently scoped to category='venture_defect' so it can never false-hit a
 * corrective_finding or factory_defect row.
 */
import { computeDedupHash } from '../corrective-finding-recorder.js';
import { isRatifiedVentureDefectClass } from './venture-defect-class.js';

/**
 * @param {Object} supabase - Supabase client (service role for INSERT)
 * @param {Object} finding
 * @param {string|null} finding.source_sd_id
 * @param {string|null} finding.venture_id
 * @param {string} finding.venture_defect_class - one of venture-defect-class.js's VENTURE_DEFECT_CLASS values
 * @param {string} finding.title
 * @param {string} [finding.description]
 * @param {Object} [finding.metadata]
 * @returns {Promise<{recorded: boolean, feedbackId: string, dedupHash: string}>}
 */
export async function recordVentureDefect(supabase, finding) {
  if (!finding || typeof finding !== 'object') {
    throw new Error('recordVentureDefect: finding object is required');
  }
  const { source_sd_id = null, venture_id = null, venture_defect_class, title, description = '', metadata: extraMetadata = {} } = finding;

  if (!isRatifiedVentureDefectClass(venture_defect_class)) {
    throw new Error(`recordVentureDefect: venture_defect_class must be one of the ratified VENTURE_DEFECT_CLASS values, got "${venture_defect_class}"`);
  }
  if (!title || typeof title !== 'string') throw new Error('recordVentureDefect: title is required');

  const dedupHash = computeDedupHash(source_sd_id, [venture_defect_class, venture_id || 'no-venture'], null);

  const { data: existing, error: lookupErr } = await supabase
    .from('feedback')
    .select('id')
    .eq('metadata->>dedup_hash', dedupHash)
    .eq('category', 'venture_defect')
    .in('status', ['new', 'in_progress'])
    .limit(1)
    .maybeSingle();

  if (lookupErr) {
    throw new Error(`recordVentureDefect: dedup lookup failed: ${lookupErr.message}`);
  }
  if (existing) {
    return { recorded: false, feedbackId: existing.id, dedupHash };
  }

  const row = {
    type: 'issue',
    source_application: 'EHG',
    source_type: 'auto_capture',
    // TESTING sub-agent finding (EXEC-TO-PLAN evidence row 66749208): 'uat_failure' is a valid
    // source_type value, not a feedback_type -- feedback_feedback_type_check only allows
    // sentry_error|user_bug|user_feature_request|user_usability|user_other|venture_error.
    // Every real insert threw before this fix. 'sentry_error' matches the sibling
    // factory-defect-recorder.js's own convention: feedback_type is a coarse legacy bucket,
    // category is the real discriminator (already correctly 'venture_defect' below).
    feedback_type: 'sentry_error',
    title: title.slice(0, 500),
    description: description.slice(0, 5000),
    category: 'venture_defect',
    status: 'new',
    severity: 'high',
    metadata: {
      ...extraMetadata,
      dedup_hash: dedupHash,
      source_sd_id,
      venture_id,
      venture_defect_class,
      logged_via: 'venture-defect-recorder',
    },
  };

  const { data: inserted, error: insertErr } = await supabase
    .from('feedback')
    .insert(row)
    .select('id')
    .single();

  if (insertErr) {
    throw new Error(`recordVentureDefect: insert failed: ${insertErr.message}`);
  }
  return { recorded: true, feedbackId: inserted.id, dedupHash };
}

export default { recordVentureDefect };
