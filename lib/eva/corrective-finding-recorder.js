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
 * Compute the natural-key dedup hash for a finding.
 * Stable across re-invocations of the same gate run targeting the same source SD.
 *
 * @param {string|null} sourceSdId
 * @param {string[]} dimensions
 * @param {string|null} gateRunId
 * @returns {string} 64-char hex sha256
 */
export function computeDedupHash(sourceSdId, dimensions, gateRunId) {
  const dims = Array.isArray(dimensions) ? [...dimensions].sort().join(',') : '';
  const payload = `${sourceSdId ?? 'null'}::${dims}::${gateRunId ?? 'null'}`;
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
  } = finding;

  if (!source_gate) throw new Error('recordCorrectiveFinding: source_gate is required');
  if (!corrective_class) throw new Error('recordCorrectiveFinding: corrective_class is required');
  if (!tier) throw new Error('recordCorrectiveFinding: tier is required');
  if (!title || typeof title !== 'string') throw new Error('recordCorrectiveFinding: title is required');

  const dedupHash = computeDedupHash(source_sd_id, dimensions, gate_run_id);

  const { data: existing, error: lookupErr } = await supabase
    .from('feedback')
    .select('id')
    .eq('metadata->>dedup_hash', dedupHash)
    .eq('category', 'corrective_finding')
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
    feedback_type: 'corrective_finding',
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
