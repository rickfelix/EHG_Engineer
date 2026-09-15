// lib/eva/vision-promote.js
/**
 * Gated promotion (draft -> active/chairman_approved) for eva_vision_documents, distinct
 * from the auto-approve flow in lib/eva/stage-execution-worker.js's _autoApproveCloneVision.
 * SD-LEO-INFRA-GOVERNANCE-ARTIFACTS-RECORD-001 (FR-3).
 *
 * Modeled directly on lib/eva/archplan-promote.js's promoteArchPlan() -- same shape, same
 * constraints, same reasoning:
 *   - Self-approval guard (ratification a588adba): refuses when promotedBy === the row's own
 *     created_by. A provenance PLACEHOLDER (a literal same-label comparison), not a strong
 *     identity check -- the same limitation promoteArchPlan documents.
 *   - The UPDATE never writes created_by: doing so would destroy the original author's
 *     identity and corrupt this guard's own comparison on any future promotion attempt.
 *   - The UPDATE never touches content/sections/extracted_dimensions: eva_vision_documents
 *     has its own quality-advancement trigger (trg_enforce_vision_quality_advancement,
 *     referenced by _autoApproveCloneVision) that this function relies on rather than
 *     duplicates -- touching content could silently re-trigger quality recalculation.
 *   - Writes approved_by/approved_by_at (additive columns from this SD's FR-1) so the
 *     approver this guard verifies is actually persisted, not discarded.
 *
 * @module lib/eva/vision-promote
 */

import { createLogger } from '../logger.js';

const logger = createLogger('VisionPromote');

/**
 * @param {Object} params
 * @param {Object} params.supabase - Supabase service client
 * @param {string} params.visionKey - eva_vision_documents.vision_key of the row to promote
 * @param {string} params.promotedBy - identity of the promoting (reviewing) seat
 * @returns {Promise<{promoted: boolean, reason?: string, error?: string, data?: Object}>}
 */
export async function promoteVisionDocument({ supabase, visionKey, promotedBy }) {
  if (!supabase) throw new Error('supabase client is required');
  if (!visionKey) throw new Error('visionKey is required');
  if (!promotedBy) throw new Error('promotedBy is required');

  const { data: row, error: readErr } = await supabase
    .from('eva_vision_documents')
    .select('id, vision_key, status, chairman_approved, created_by')
    .eq('vision_key', visionKey)
    .maybeSingle();

  if (readErr) {
    logger.error('Pre-promotion read failed', { visionKey, error: readErr.message });
    return { promoted: false, reason: 'read_failed', error: readErr.message };
  }
  if (!row) {
    logger.warn('Promotion target not found', { visionKey });
    return { promoted: false, reason: 'not_found' };
  }
  if (row.chairman_approved === true) {
    // Promoting an already-active row is a no-op, never a silent overwrite of its existing
    // chairman_approved_at -- that timestamp is the original approval's provenance.
    logger.debug('Promotion no-op: already approved', { visionKey });
    return { promoted: false, reason: 'already_approved' };
  }
  if (promotedBy === row.created_by) {
    logger.warn('Self-approval refused', { visionKey, promotedBy, createdBy: row.created_by });
    return { promoted: false, reason: 'self_approval_refused' };
  }

  // FAIL-SOFT ON THE NEW COLUMNS -- see lib/eva/archplan-promote.js's identical fix for the
  // full rationale (SD-LEO-INFRA-GOVERNANCE-ARTIFACTS-RECORD-001 FR-3, adversarial /ship
  // review finding, HIGH): approved_by/approved_by_at ship as a TIER-1 additive migration
  // that may not yet be live when this code runs; a 42703 must never regress previously-
  // working promotion behavior.
  // CONCURRENCY GUARD (adversarial /ship review finding, MEDIUM -- TOCTOU) -- see
  // lib/eva/archplan-promote.js's identical fix for the full rationale: `.eq('chairman_approved',
  // false)` makes the write a compare-and-swap so a race between two concurrent promotions can
  // never silently overwrite each other.
  const nowIso = new Date().toISOString();
  let { data, error } = await supabase
    .from('eva_vision_documents')
    .update({
      status: 'active',
      chairman_approved: true,
      chairman_approved_at: nowIso,
      approved_by: promotedBy,
      approved_by_at: nowIso,
    })
    .eq('vision_key', visionKey)
    .eq('chairman_approved', false)
    .select('id, vision_key, status, chairman_approved, chairman_approved_at, approved_by, approved_by_at')
    .single();

  let columnsApplied = true;
  if (error && error.code === '42703') {
    logger.warn('approved_by/approved_by_at columns not yet live -- retrying without them', { visionKey, error: error.message });
    columnsApplied = false;
    const fallback = await supabase
      .from('eva_vision_documents')
      .update({ status: 'active', chairman_approved: true, chairman_approved_at: nowIso })
      .eq('vision_key', visionKey)
      .eq('chairman_approved', false)
      .select('id, vision_key, status, chairman_approved, chairman_approved_at')
      .single();
    data = fallback.data;
    error = fallback.error;
  }

  if (error && error.code === 'PGRST116') {
    logger.debug('Promotion lost a concurrent race (row no longer chairman_approved=false)', { visionKey });
    return { promoted: false, reason: 'already_approved' };
  }
  if (error) {
    logger.warn('Promotion UPDATE rejected', { visionKey, error: error.message });
    return { promoted: false, reason: 'update_failed', error: error.message };
  }

  logger.log('Vision document promoted', { visionKey, promotedBy, columnsApplied });
  return { promoted: true, data, columnsApplied };
}
