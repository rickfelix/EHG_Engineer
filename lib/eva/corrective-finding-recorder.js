/**
 * corrective-finding-recorder.js
 *
 * Single-write entry point for corrective findings detected by EVA gates.
 * Replaces the prior pattern of inserting draft SDs directly into
 * strategic_directives_v2. Findings now persist in the feedback table
 * (category='corrective_finding') and are promoted to SDs deliberately
 * via scripts/corrective-triage.mjs.
 *
 * Part of: SD-LEO-INFRA-CORRECTIVE-FINDING-REDIRECT-001 (PR2 of 5)
 * Pairs with: PR1 schema migration (20260504_feedback_corrective_*.sql)
 */
import { createHash } from 'crypto';

/**
 * Compute the dedup hash for a finding.
 *
 * SD-LEO-INFRA-CORRECTIVE-FINDING-GENERATOR-001 (FR-3): the corrective-sd-generator's
 * OWN findings need a STABLE natural key -- source_sd_id, dimensions, and tier -- not
 * gate_run_id, which is a fresh UUID minted on every scoring pass (scripts/eva/vision-
 * scorer.js's bare .insert()), so hashing it could only ever match a literal re-run of
 * the same score record, never a recurring gap on a later pass. `tier` (not a re-derived
 * score band) is used as the third component because it is already the generator's own
 * required, non-null classification (accept|minor|gap-closure|escalation).
 *
 * This is opt-in via dedupScope='natural_key' -- NOT the default -- because three
 * other callers of recordCorrectiveFinding (lib/venture-deploy/promote.js,
 * lib/apa/standing-assessment-round.mjs x2) pass source_sd_id=null and empty/constant
 * dimensions, relying on gate_run_id as their ONLY discriminator; a prior adversarial
 * review already caught and fixed the exact "all X hash identically" collapse those
 * callers salt gate_run_id specifically to avoid (see their own inline comments).
 * Dropping gate_run_id for them unconditionally would silently re-introduce that bug
 * fleet-wide. The default mode therefore still includes gate_run_id, unchanged.
 *
 * @param {string|null} sourceSdId
 * @param {string[]} dimensions
 * @param {string|null} gateRunIdOrTier - gate_run_id (default mode) or the finding's
 *   tier (natural_key mode) -- the caller (recordCorrectiveFinding) decides which
 *   value to pass based on finding.dedup_scope.
 * @returns {string} 64-char hex sha256
 */
export function computeDedupHash(sourceSdId, dimensions, gateRunIdOrTier) {
  const dims = Array.isArray(dimensions) ? [...dimensions].sort().join(',') : '';
  const payload = `${sourceSdId ?? 'null'}::${dims}::${gateRunIdOrTier ?? 'null'}`;
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Idempotently record a corrective finding to the feedback table.
 *
 * @param {Object} supabase - Supabase client (service role for INSERT)
 * @param {Object} finding
 * @param {string|null} finding.source_sd_id - sd_key of the source SD that scored low
 * @param {string} finding.source_gate - 'eva_vision_score' | 'eva_heal_score' | 's20_code_quality_gate'
 * @param {string|null} finding.gate_run_id - UUID of the run record (e.g., eva_vision_scores.id)
 * @param {string} finding.corrective_class - 'vision_gap' | 'arch_gap' | 'lifecycle_feature' | 'cli_validation' | 'code_quality'
 * @param {string[]} finding.dimensions - dimension codes (e.g., ['V03', 'A02'])
 * @param {string} finding.tier - 'minor' | 'gap-closure' | 'escalation'
 * @param {number|null} finding.score - numeric score 0-100
 * @param {string} finding.title - human-readable summary
 * @param {string} finding.description - detail text
 * @param {Object} [finding.metadata] - extra payload merged into feedback.metadata
 * @param {'gate_run'|'natural_key'} [finding.dedup_scope='gate_run'] - 'natural_key'
 *   opts into hashing (source_sd_id, dimensions, tier) instead of gate_run_id --
 *   SD-LEO-INFRA-CORRECTIVE-FINDING-GENERATOR-001 (FR-3). `tier` (not a re-derived
 *   score band) is used because it is already the generator's own required,
 *   non-null classification (accept|minor|gap-closure|escalation) -- reusing it
 *   avoids inventing a second, redundant banding scheme from the raw score, and
 *   stays well-defined even in the (unlikely) case score is null. Only the
 *   corrective-sd-generator passes this; every other caller keeps the original
 *   gate_run_id-keyed hash so a null-source_sd_id / constant-dimensions caller
 *   doesn't collapse fleet-wide.
 * @returns {Promise<{recorded: boolean, feedbackId: string, dedupHash: string}>}
 */
export async function recordCorrectiveFinding(supabase, finding) {
  if (!finding || typeof finding !== 'object') {
    throw new Error('recordCorrectiveFinding: finding object is required');
  }
  const {
    source_sd_id = null,
    source_gate,
    gate_run_id = null,
    corrective_class,
    dimensions = [],
    tier,
    score = null,
    title,
    description = '',
    metadata: extraMetadata = {},
    dedup_scope = 'gate_run',
  } = finding;

  if (!source_gate) throw new Error('recordCorrectiveFinding: source_gate is required');
  if (!corrective_class) throw new Error('recordCorrectiveFinding: corrective_class is required');
  if (!tier) throw new Error('recordCorrectiveFinding: tier is required');
  if (!title || typeof title !== 'string') throw new Error('recordCorrectiveFinding: title is required');

  const dedupHash = dedup_scope === 'natural_key'
    ? computeDedupHash(source_sd_id, dimensions, tier)
    : computeDedupHash(source_sd_id, dimensions, gate_run_id);

  // SD-LEO-INFRA-CORRECTIVE-FINDING-GENERATOR-001 (FR-3): scoped to OPEN statuses only,
  // so a resolved/wont_fix finding can never permanently suppress a genuine later
  // regression of the same natural key -- a stable hash with no status filter would
  // reproduce the exact class of silent-suppression bug this SD exists to fix.
  const { data: existing, error: lookupErr } = await supabase
    .from('feedback')
    .select('id')
    .eq('metadata->>dedup_hash', dedupHash)
    .eq('category', 'corrective_finding')
    .in('status', ['new', 'in_progress'])
    .limit(1)
    .maybeSingle();

  if (lookupErr) {
    throw new Error(`recordCorrectiveFinding: dedup lookup failed: ${lookupErr.message}`);
  }
  if (existing) {
    return { recorded: false, feedbackId: existing.id, dedupHash };
  }

  const severity = tier === 'escalation' ? 'high' : tier === 'gap-closure' ? 'medium' : 'low';
  const row = {
    type: 'issue',
    source_application: 'EHG_Engineer',
    source_type: 'auto_capture',
    // feedback_type is constrained to the venture user-feedback channel enum
    // (feedback_feedback_type_check). The finding's real classification lives in
    // category='corrective_finding' + corrective_class; use 'sentry_error' to match the
    // auto_capture / harness_backlog internal-feedback convention (QF-20260604-385).
    feedback_type: 'sentry_error',
    title: title.slice(0, 500),
    description: description.slice(0, 5000),
    category: 'corrective_finding',
    status: 'new',
    severity,
    corrective_class,
    source_gate,
    gate_run_id,
    metadata: {
      ...extraMetadata,
      dedup_hash: dedupHash,
      source_sd_id,
      dimensions: [...dimensions].sort(),
      tier,
      score,
      logged_via: 'corrective-finding-recorder',
    },
  };

  const { data: inserted, error: insertErr } = await supabase
    .from('feedback')
    .insert(row)
    .select('id')
    .single();

  if (insertErr) {
    throw new Error(`recordCorrectiveFinding: insert failed: ${insertErr.message}`);
  }
  return { recorded: true, feedbackId: inserted.id, dedupHash };
}
