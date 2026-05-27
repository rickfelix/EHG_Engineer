/**
 * Vision readiness audit helper
 *
 * SD-LEO-INFRA-VISION-DOCUMENT-READINESS-001 FR-2: writes a row to vision_readiness_blocked
 * every time scripts/eva/vision-scorer.js short-circuits with a graceful-failure verdict
 * (human_review_floor_dims / reason=vision_not_ready). Operators query the audit table to
 * prioritize Stage-4 enrichment campaigns for the 56 legacy unready vision docs.
 *
 * 60-second dedup window prevents audit storm when scorer is invoked in tight loops
 * (e.g., batch-rescore jobs against the same unready vision).
 *
 * Complementary to SD-LEO-INFRA-UNIFY-VENTURE-NON-001:
 *   - UNIFY prevents NEW unready-doc generation at writer/bridge layers
 *   - This audit tracks consumer-side graceful failures for the 56 LEGACY unready docs
 *     that UNIFY does not retroactively repair
 *
 * @module lib/eva/audit-vision-readiness
 */

import { createSupabaseServiceClient } from '../supabase-client.js';

// 60-second dedup window — collapses repeated audit writes for the same (vision_key, reason)
const DEDUP_WINDOW_MS = 60 * 1000;

// Module-scope dedup cache: Map<visionKey:reason, timestamp>
const _dedupCache = new Map();

/**
 * Clear the dedup cache. For tests only.
 */
export function _clearDedupCache() {
  _dedupCache.clear();
}

/**
 * Reason taxonomy (must match vision_readiness_blocked.reason CHECK constraint)
 */
export const VISION_READINESS_REASONS = Object.freeze([
  'vision_not_found',
  'vision_query_error',
  'extracted_dimensions_null',
  'content_too_short',
  'status_inactive',
  'level_below_minimum',
  'venture_id_missing',
]);

/**
 * Write a vision_readiness_blocked audit row.
 *
 * @param {Object} args
 * @param {string} args.visionKey - Required. The vision_key that failed readiness check.
 * @param {string|null} [args.ventureId] - Optional venture UUID (FK SET NULL on venture delete).
 * @param {string} args.reason - Required. One of VISION_READINESS_REASONS (CHECK-constrained).
 * @param {Object} [args.evidence={}] - Optional jsonb snapshot of what was checked.
 * @param {'WARNING'|'BLOCKING'} [args.mode='WARNING'] - Audit mode (CHECK-constrained).
 * @param {string} [args.attemptedBy] - Optional caller identifier (sdKey, script name, etc.).
 * @param {Object} [args.supabase] - Optional Supabase client; defaults to service client.
 * @returns {Promise<{id: string|null, dedup: boolean, error?: string}>}
 *   - {id, dedup:false} when a new row is inserted
 *   - {id:null, dedup:true} when collapsed by 60s dedup window
 *   - {id:null, dedup:false, error} when insert fails (caller may log; should NOT throw)
 */
export async function writeVisionReadinessBlocked({
  visionKey,
  ventureId = null,
  reason,
  evidence = {},
  mode = 'WARNING',
  attemptedBy = null,
  supabase: supabaseOverride,
} = {}) {
  if (!visionKey) {
    return { id: null, dedup: false, error: 'visionKey is required' };
  }
  if (!reason || !VISION_READINESS_REASONS.includes(reason)) {
    return {
      id: null,
      dedup: false,
      error: `reason must be one of: ${VISION_READINESS_REASONS.join(', ')}; got: ${reason}`,
    };
  }

  // Dedup check: same (vision_key, reason) within 60s window → collapse
  const dedupKey = `${visionKey}:${reason}`;
  const now = Date.now();
  const lastWrite = _dedupCache.get(dedupKey);
  if (lastWrite && now - lastWrite < DEDUP_WINDOW_MS) {
    return { id: null, dedup: true };
  }

  const supabase = supabaseOverride || createSupabaseServiceClient();

  try {
    const { data, error } = await supabase
      .from('vision_readiness_blocked')
      .insert({
        vision_key: visionKey,
        venture_id: ventureId,
        reason,
        evidence,
        mode,
        attempted_by: attemptedBy,
      })
      .select('id')
      .single();

    if (error) {
      return { id: null, dedup: false, error: error.message };
    }

    // Update dedup cache only on successful insert
    _dedupCache.set(dedupKey, now);
    return { id: data.id, dedup: false };
  } catch (err) {
    return { id: null, dedup: false, error: err.message };
  }
}
