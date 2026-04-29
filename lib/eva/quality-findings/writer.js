/**
 * Writer module for venture_quality_findings.
 *
 * SD: SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001-B
 *
 * Idempotent UPSERT keyed on (venture_id, finding_hash). Re-running the writer
 * with the same finding_hash inputs is a no-op (or updates evidence_pointer +
 * resolved_at if changed) — Components C (per-finding SD generator) and F
 * (aggregator) rely on this idempotency so re-runs do not produce duplicate
 * remediation SDs or double-counted aggregations.
 *
 * @module lib/eva/quality-findings/writer
 */

import { validateFindingShape, computeFindingHash, FINDING_CATEGORIES } from './finding-shape.js';

/**
 * Write one canonical finding to venture_quality_findings.
 * Returns the upserted row id.
 *
 * @param {Object} supabase    - service-role Supabase client
 * @param {Object} finding     - canonical FindingShape (must pass validateFindingShape)
 * @returns {Promise<{id: string, inserted: boolean}>}
 */
export async function writeFinding(supabase, finding) {
  if (!supabase) throw new Error('supabase client required');
  const v = validateFindingShape(finding);
  if (!v.valid) {
    throw new Error('Invalid finding shape: ' + v.errors.join('; '));
  }

  // UPSERT on (venture_id, finding_hash) — defined as UNIQUE constraint in
  // the migration. Use onConflict to ensure idempotency.
  const payload = {
    venture_id: finding.venture_id,
    stage_number: finding.stage_number,
    finding_category: finding.finding_category,
    severity: finding.severity,
    finding_hash: finding.finding_hash,
    evidence_pointer: finding.evidence_pointer || {},
    sd_key: finding.sd_key || null,
    resolved_at: finding.resolved_at || null,
  };

  const { data, error } = await supabase
    .from('venture_quality_findings')
    .upsert(payload, {
      onConflict: 'venture_id,finding_hash',
      ignoreDuplicates: false,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error('writeFinding failed: ' + error.message);
  }

  return { id: data.id, inserted: true };
}

/**
 * Write a batch of findings. Returns counts.
 *
 * Auto-computes finding_hash on entries missing it (using
 * `finding_signature` from the input — required for hash composition).
 *
 * @param {Object} supabase
 * @param {Array<Object>} findings
 * @returns {Promise<{written: number, errors: Array<{finding, error}>}>}
 */
export async function writeFindingsBatch(supabase, findings) {
  if (!Array.isArray(findings)) {
    throw new Error('findings must be an array');
  }

  let written = 0;
  const errors = [];

  for (const f of findings) {
    try {
      // Auto-compute hash if caller provided finding_signature instead.
      if (!f.finding_hash && f.finding_signature) {
        f.finding_hash = computeFindingHash({
          venture_id: f.venture_id,
          stage_number: f.stage_number,
          finding_category: f.finding_category,
          finding_signature: f.finding_signature,
        });
      }
      await writeFinding(supabase, f);
      written += 1;
    } catch (err) {
      errors.push({ finding: f, error: err.message });
    }
  }

  return { written, errors };
}

/**
 * Mark a finding as resolved (sets resolved_at to now).
 *
 * @param {Object} supabase
 * @param {string} venture_id
 * @param {string} finding_hash
 * @returns {Promise<{updated: boolean}>}
 */
export async function resolveFinding(supabase, venture_id, finding_hash) {
  if (!supabase || !venture_id || !finding_hash) {
    throw new Error('supabase, venture_id, finding_hash required');
  }

  const { error, count } = await supabase
    .from('venture_quality_findings')
    .update({ resolved_at: new Date().toISOString() })
    .eq('venture_id', venture_id)
    .eq('finding_hash', finding_hash)
    .is('resolved_at', null);

  if (error) {
    throw new Error('resolveFinding failed: ' + error.message);
  }

  return { updated: (count ?? 0) > 0 };
}

export { FINDING_CATEGORIES };
