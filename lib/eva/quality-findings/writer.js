/**
 * Writer module for venture_quality_findings.
 *
 * SD: SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001-B
 * Updated: SD-LEO-FEAT-STAGE-CODE-QUALITY-001 FR-2 (sync sd-generator path).
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
 * SD-LEO-FEAT-STAGE-CODE-QUALITY-001 FR-2 (severity floor): only high/critical
 * findings produce remediation SDs synchronously. Medium/low/info findings are
 * stored without auto-SD creation to prevent queue-spam.
 *
 * Severity floor matches SEVERITIES_REQUIRING_SYNC_SD_GENERATION below; the
 * cron (FR_C_REMEDIATION_SEVERITIES in sd-generator.js) historically also
 * included 'medium' for batch backfill. Sync path is intentionally narrower.
 */
const SEVERITIES_REQUIRING_SYNC_SD_GENERATION = new Set(['critical', 'high']);

/**
 * Kill switch for the sync sd-generator path. Set
 * LEO_FR_C_SYNC_GENERATION_ENABLED=off (case-insensitive) to fall back to
 * cron-only SD generation. Default ON.
 */
function isSyncSdGenerationEnabled() {
  const raw = process.env.LEO_FR_C_SYNC_GENERATION_ENABLED;
  if (typeof raw !== 'string') return true;
  const v = raw.trim().toLowerCase();
  return v !== 'off' && v !== 'false' && v !== '0' && v !== 'no';
}

/**
 * Maybe invoke the FR-C remediation-SD generator inline for a freshly-written
 * finding. Failures here MUST NOT throw — sd-generator failure is observable
 * in audit_log but should never block finding persistence.
 *
 * @param {Object} supabase
 * @param {Object} finding - canonical finding (already persisted)
 * @param {string} findingId - id returned by writeFinding upsert
 * @returns {Promise<{generated: boolean, sd_key?: string, skipped_reason?: string}>}
 */
async function maybeGenerateSdForFinding(supabase, finding, findingId) {
  if (!isSyncSdGenerationEnabled()) {
    return { generated: false, skipped_reason: 'kill_switch_off' };
  }
  if (!SEVERITIES_REQUIRING_SYNC_SD_GENERATION.has(finding.severity)) {
    return { generated: false, skipped_reason: 'severity_floor' };
  }
  if (!finding.venture_id || !finding.finding_category) {
    return { generated: false, skipped_reason: 'missing_required_fields' };
  }

  try {
    const { findOpenSdForCompositeKey, insertDraftRemediationSd, appendFindingToSdMetadata, transitionFindingToSdFiled } =
      await import('./sd-generator.js');

    // Composite-key dedupe: open SD already covering (venture_id, category, severity)?
    const existing = await findOpenSdForCompositeKey(
      supabase,
      finding.venture_id,
      finding.finding_category,
      finding.severity
    );

    if (existing?.id) {
      // Append this finding id to the existing SD's metadata, mark finding as filed
      await appendFindingToSdMetadata(supabase, existing.id, findingId).catch(() => {});
      await transitionFindingToSdFiled(supabase, findingId, existing.sd_key).catch(() => {});
      return { generated: false, sd_key: existing.sd_key, skipped_reason: 'dedupe_hit' };
    }

    // No open SD — create a fresh draft remediation SD.
    const newSd = await insertDraftRemediationSd(supabase, {
      ventureId: finding.venture_id,
      findingCategory: finding.finding_category,
      severity: finding.severity,
      findingIds: [findingId],
      sampleFinding: finding,
    });
    await transitionFindingToSdFiled(supabase, findingId, newSd.sd_key).catch(() => {});
    return { generated: true, sd_key: newSd.sd_key };
  } catch (err) {
    // Best-effort observability: record but never re-throw.
    try {
      await supabase.from('audit_log').insert({
        event_type: 'fr_c_sync_generator.error',
        entity_type: 'venture_quality_finding',
        entity_id: findingId,
        severity: 'warning',
        created_by: 'fr-c-sync-generator',
        metadata: {
          venture_id: finding.venture_id,
          finding_category: finding.finding_category,
          finding_severity: finding.severity,
          error: err?.message || String(err),
        },
      });
    } catch { /* observability failure is silent */ }
    return { generated: false, skipped_reason: 'sd_generator_threw' };
  }
}

/**
 * Write one canonical finding to venture_quality_findings.
 * Returns the upserted row id.
 *
 * If the finding's severity is high or critical AND the sync sd-generator
 * kill-switch is on (default), invoke sd-generator.insertDraftRemediationSd
 * inline before returning. Sync invocation result is exposed on the response
 * for caller-side telemetry.
 *
 * @param {Object} supabase    - service-role Supabase client
 * @param {Object} finding     - canonical FindingShape (must pass validateFindingShape)
 * @returns {Promise<{id: string, inserted: boolean, sd_generation?: Object}>}
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

  // FR-2: sync FR-C SD generation for high/critical findings.
  const sdGeneration = await maybeGenerateSdForFinding(supabase, finding, data.id);

  return { id: data.id, inserted: true, sd_generation: sdGeneration };
}

/**
 * Write a batch of findings. Returns counts.
 *
 * Auto-computes finding_hash on entries missing it (using
 * `finding_signature` from the input — required for hash composition).
 *
 * @param {Object} supabase
 * @param {Array<Object>} findings
 * @returns {Promise<{written: number, errors: Array<{finding, error}>, sd_generated: number, sd_dedupe_hit: number}>}
 */
export async function writeFindingsBatch(supabase, findings) {
  if (!Array.isArray(findings)) {
    throw new Error('findings must be an array');
  }

  let written = 0;
  let sd_generated = 0;
  let sd_dedupe_hit = 0;
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
      const r = await writeFinding(supabase, f);
      written += 1;
      if (r.sd_generation?.generated) sd_generated += 1;
      else if (r.sd_generation?.skipped_reason === 'dedupe_hit') sd_dedupe_hit += 1;
    } catch (err) {
      errors.push({ finding: f, error: err.message });
    }
  }

  return { written, errors, sd_generated, sd_dedupe_hit };
}

// FR-2 hooks exported for tests + observability tooling.
export const __fr2 = {
  SEVERITIES_REQUIRING_SYNC_SD_GENERATION,
  isSyncSdGenerationEnabled,
  maybeGenerateSdForFinding,
};

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
