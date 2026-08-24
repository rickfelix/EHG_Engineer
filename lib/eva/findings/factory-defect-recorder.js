/**
 * factory-defect-recorder.js
 *
 * SD-LEO-INFRA-MINUS-CARGO-INSTRUMENTS-001 (FR-5)
 *
 * Sibling to ../corrective-finding-recorder.js for feedback.category='factory_defect' —
 * findings that indicate a BROKEN INSTRUMENT (a gate/detector that cannot fail, a resolver
 * that lies, an evaluation that bypassed its canonical path), not a corrective-triage gap.
 * corrective-finding-recorder.js hardcodes category='corrective_finding' at both its insert
 * and its dedup lookup and carries 36 live rows today — not safely extensible for a second
 * category. This module reuses ONLY its exported computeDedupHash helper; its own dedup
 * lookup is independently scoped to category='factory_defect' so it can never false-hit an
 * existing corrective_finding row.
 *
 * Matches the existing writer's real dedup behavior: a hit on an OPEN row (status in
 * new|in_progress) is a no-op (`recorded:false`), not an occurrence-count increment — the
 * feedback table has no occurrence_count column, and inventing one here would diverge from
 * the sibling writer's actual, already-shipped contract.
 */
import { computeDedupHash } from '../corrective-finding-recorder.js';
import { isRatifiedGapClass } from './gap-class.js';

/**
 * @param {Object} supabase - Supabase client (service role for INSERT)
 * @param {Object} finding
 * @param {string|null} finding.source_sd_id
 * @param {string} finding.gap_class - one of gap-class.js's GAP_CLASS values
 * @param {string} finding.title
 * @param {string} [finding.description]
 * @param {Object} [finding.metadata]
 * @returns {Promise<{recorded: boolean, feedbackId: string, dedupHash: string}>}
 */
export async function recordFactoryDefect(supabase, finding) {
  if (!finding || typeof finding !== 'object') {
    throw new Error('recordFactoryDefect: finding object is required');
  }
  const { source_sd_id = null, gap_class, title, description = '', metadata: extraMetadata = {} } = finding;

  if (!isRatifiedGapClass(gap_class)) {
    throw new Error(`recordFactoryDefect: gap_class must be one of the ratified GAP_CLASS values, got "${gap_class}"`);
  }
  if (!title || typeof title !== 'string') throw new Error('recordFactoryDefect: title is required');

  const dedupHash = computeDedupHash(source_sd_id, [gap_class], null);

  const { data: existing, error: lookupErr } = await supabase
    .from('feedback')
    .select('id')
    .eq('metadata->>dedup_hash', dedupHash)
    .eq('category', 'factory_defect')
    .in('status', ['new', 'in_progress'])
    .limit(1)
    .maybeSingle();

  if (lookupErr) {
    throw new Error(`recordFactoryDefect: dedup lookup failed: ${lookupErr.message}`);
  }
  if (existing) {
    return { recorded: false, feedbackId: existing.id, dedupHash };
  }

  const row = {
    type: 'issue',
    source_application: 'EHG_Engineer',
    source_type: 'auto_capture',
    feedback_type: 'sentry_error',
    title: title.slice(0, 500),
    description: description.slice(0, 5000),
    category: 'factory_defect',
    status: 'new',
    severity: 'high',
    metadata: {
      ...extraMetadata,
      dedup_hash: dedupHash,
      source_sd_id,
      gap_class,
      logged_via: 'factory-defect-recorder',
    },
  };

  const { data: inserted, error: insertErr } = await supabase
    .from('feedback')
    .insert(row)
    .select('id')
    .single();

  if (insertErr) {
    throw new Error(`recordFactoryDefect: insert failed: ${insertErr.message}`);
  }
  return { recorded: true, feedbackId: inserted.id, dedupHash };
}

export default { recordFactoryDefect };
