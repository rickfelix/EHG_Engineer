/**
 * SD ID Normalizer - Root Cause Fix for SD-LEO-ID-NORMALIZE-001
 *
 * PURPOSE:
 * This module provides consistent SD identifier normalization to prevent
 * silent update failures caused by ID format mismatches.
 *
 * PROBLEM STATEMENT:
 * The strategic_directives_v2 table uses a VARCHAR `id` column that can contain
 * either UUID format (e.g., "e1c8cc23-...") or string format (e.g., "SD-STAGE-ARCH-001").
 * Different parts of the codebase pass identifiers in different formats:
 * - sd_key: "SD-STAGE-ARCH-001"
 * - id: Could be UUID or string depending on when the SD was created
 *
 * SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id references (column dropped 2026-01-24)
 *
 * When an update uses .eq('id', sdId) with a mismatched format, the query
 * silently matches zero rows and returns success, causing data loss.
 *
 * SOLUTION:
 * All SD operations must first resolve the input ID to the canonical `id` value
 * from the database before performing updates or queries.
 *
 * @module sd-id-normalizer
 */

/**
 * UUID regex pattern for format detection
 * Matches standard UUID v4 format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * SD Key pattern for format detection
 * Matches SD-XXX-001 format variations
 */
const SD_KEY_REGEX = /^SD-[A-Z0-9-]+$/i;

/**
 * Detect the format of an SD identifier
 * @param {string} sdId - The identifier to analyze
 * @returns {string} Format type: 'uuid', 'sd_key', or 'unknown'
 */
export function detectIdFormat(sdId) {
  if (!sdId || typeof sdId !== 'string') {
    return 'unknown';
  }

  if (UUID_REGEX.test(sdId)) {
    return 'uuid';
  }

  if (SD_KEY_REGEX.test(sdId)) {
    return 'sd_key';
  }

  return 'unknown';
}

/**
 * Check if an ID looks like a UUID
 * @param {string} sdId - The identifier to check
 * @returns {boolean} True if UUID format
 */
export function isUUID(sdId) {
  return sdId && typeof sdId === 'string' && UUID_REGEX.test(sdId);
}

/**
 * Normalize an SD identifier to the canonical database ID
 *
 * This function resolves any form of SD identifier (uuid or sd_key)
 * to the canonical `id` value from the strategic_directives_v2 table.
 *
 * CRITICAL: Always use this before any update operation to prevent silent failures.
 *
 * @param {Object} supabase - Supabase client instance
 * @param {string} sdId - SD identifier in any format (uuid or sd_key)
 * @returns {Promise<string|null>} Canonical SD.id or null if not found
 *
 * @example
 * // All these will return the same canonical ID
 * await normalizeSDId(supabase, 'SD-STAGE-ARCH-001');     // sd_key format
 * await normalizeSDId(supabase, 'e1c8cc23-...');          // uuid format
 */
// SD-LEO-REFAC-CONSOLIDATE-KEY-RESOLUTION-001 Phase 2: delegate to canonical resolver.
// Module-scoped flag ensures deprecation warn fires exactly once per Node.js process.
let _shimDeprecationWarned = false;
function _emitShimDeprecation() {
  if (_shimDeprecationWarned) return;
  if (process.env.LEO_SDID_DEPRECATION_WARN === 'off') return;
  _shimDeprecationWarned = true;
  console.warn('[SD-ID-NORMALIZER] normalizeSDId is now a shim over scripts/lib/sd-id-resolver.js::resolveSdInput. New code should call resolveSdInput directly.');
}

export async function normalizeSDId(supabase, sdId) {
  _emitShimDeprecation();
  if (!sdId || typeof sdId !== 'string') {
    console.warn('[SD-ID-NORMALIZER] Invalid sdId provided:', sdId);
    return null;
  }
  const trimmedId = sdId.trim();
  const format = detectIdFormat(trimmedId);
  // b6256a28 (QF-20260529-533): fail-soft when scripts/lib/sd-id-resolver.js is
  // absent (worktrees provisioned before that file existed). The dynamic import
  // otherwise rejects with ERR_MODULE_NOT_FOUND in the LEAD-FINAL post-completion
  // path — after the DB completion write — misleading the session and aborting
  // /learn + parent rollup. Degrade to an inline id-or-key lookup.
  let resolveSdInput;
  try {
    ({ resolveSdInput } = await import('../lib/sd-id-resolver.js'));
  } catch (importErr) {
    const code = importErr && importErr.code;
    if (code === 'ERR_MODULE_NOT_FOUND' || /Cannot find (module|package)/i.test((importErr && importErr.message) || '')) {
      console.warn(`[SD-ID-NORMALIZER] resolver module unavailable (${code || 'not found'}); inline fallback for "${trimmedId}"`);
      return await _normalizeViaDirectQuery(supabase, trimmedId, format);
    }
    throw importErr;
  }
  try {
    const { sdId: canonical } = await resolveSdInput(trimmedId, supabase);
    if (canonical !== trimmedId) {
      console.log(`[SD-ID-NORMALIZER] Normalized: "${trimmedId}" -> "${canonical}"`);
    }
    return canonical;
  } catch (err) {
    // Translate Error→null to preserve legacy silent-zero contract.
    if (/SD not found/.test(err.message)) {
      console.warn(`[SD-ID-NORMALIZER] SD not found for identifier: ${trimmedId} (format: ${format})`);
    } else if (/DB error/.test(err.message)) {
      console.error('[SD-ID-NORMALIZER] Query error:', err.message);
    } else {
      console.warn('[SD-ID-NORMALIZER] Resolver error:', err.message);
    }
    return null;
  }
}

/**
 * b6256a28 (QF-20260529-533): inline fallback resolution used when
 * scripts/lib/sd-id-resolver.js cannot be imported (stale worktree). Mirrors
 * resolveSdInput's core OR-query but returns null on not-found/error to preserve
 * normalizeSDId's legacy silent-zero contract. Exported for unit testing.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} trimmedId - already-trimmed identifier
 * @param {string} format - precomputed detectIdFormat(trimmedId)
 * @returns {Promise<string|null>} canonical id, or null on not-found/error
 */
export async function _normalizeViaDirectQuery(supabase, trimmedId, format) {
  // Restrict the .or() filter to validated UUID/sd_key shapes (resolveSdInput
  // gates the same way) so a malformed identifier can't perturb the PostgREST filter.
  if (format !== 'uuid' && format !== 'sd_key') {
    console.warn(`[SD-ID-NORMALIZER] Unrecognized identifier format (fallback): ${trimmedId}`);
    return null;
  }
  try {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key')
      .or(`id.eq.${trimmedId},sd_key.eq.${trimmedId}`)
      .maybeSingle();
    if (error) {
      console.error('[SD-ID-NORMALIZER] Fallback query error:', error.message);
      return null;
    }
    if (!data) {
      console.warn(`[SD-ID-NORMALIZER] SD not found (fallback) for identifier: ${trimmedId} (format: ${format})`);
      return null;
    }
    if (data.id !== trimmedId) {
      console.log(`[SD-ID-NORMALIZER] Normalized (fallback): "${trimmedId}" -> "${data.id}"`);
    }
    return data.id;
  } catch (e) {
    console.warn('[SD-ID-NORMALIZER] Fallback resolution failed:', e.message);
    return null;
  }
}

/**
 * Normalize and validate SD identifier with detailed result
 *
 * Extended version that provides more context for debugging and error handling.
 *
 * @param {Object} supabase - Supabase client instance
 * @param {string} sdId - SD identifier in any format
 * @returns {Promise<Object>} Result object with normalized ID and metadata
 *
 * @example
 * const result = await normalizeSDIdWithDetails(supabase, 'SD-STAGE-ARCH-001');
 * // Returns: {
 * //   success: true,
 * //   canonicalId: 'e1c8cc23-...',
 * //   inputId: 'SD-STAGE-ARCH-001',
 * //   inputFormat: 'sd_key',
 * //   wasNormalized: true,
 * //   sd: { id, title, status, ... }
 * // }
 */
export async function normalizeSDIdWithDetails(supabase, sdId) {
  const result = {
    success: false,
    canonicalId: null,
    inputId: sdId,
    inputFormat: detectIdFormat(sdId),
    wasNormalized: false,
    sd: null,
    error: null
  };

  if (!sdId || typeof sdId !== 'string') {
    result.error = 'Invalid sdId: must be a non-empty string';
    return result;
  }

  const trimmedId = sdId.trim();

  // Query with essential fields for context
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status, current_phase')
    .or(`id.eq.${trimmedId},sd_key.eq.${trimmedId}`)
    .maybeSingle();

  if (error) {
    result.error = `Database error: ${error.message}`;
    return result;
  }

  if (!sd) {
    result.error = `SD not found for identifier: ${trimmedId}`;
    return result;
  }

  result.success = true;
  result.canonicalId = sd.id;
  result.wasNormalized = sd.id !== trimmedId;
  result.sd = sd;

  return result;
}

/**
 * Create a safe update operation with automatic ID normalization
 *
 * This helper ensures updates always use the canonical ID, preventing
 * the "zero rows matched" silent failure issue.
 *
 * @param {Object} supabase - Supabase client instance
 * @param {string} sdId - SD identifier in any format
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Result object with success/failure details
 *
 * @example
 * const result = await safeSDUpdate(supabase, 'SD-STAGE-ARCH-001', {
 *   status: 'completed',
 *   progress_percentage: 100
 * });
 *
 * if (!result.success) {
 *   console.error('Update failed:', result.error);
 * }
 */
export async function safeSDUpdate(supabase, sdId, updateData) {
  // First, normalize the ID
  const normalization = await normalizeSDIdWithDetails(supabase, sdId);

  if (!normalization.success) {
    return {
      success: false,
      error: `ID normalization failed: ${normalization.error}`,
      rowsAffected: 0,
      originalId: sdId,
      normalizedId: null
    };
  }

  // Add updated_at timestamp
  const dataWithTimestamp = {
    ...updateData,
    updated_at: new Date().toISOString()
  };

  // Perform update with canonical ID
  const { data, error, count: _count } = await supabase
    .from('strategic_directives_v2')
    .update(dataWithTimestamp)
    .eq('id', normalization.canonicalId)
    .select('id')
    .single();

  if (error) {
    return {
      success: false,
      error: `Update failed: ${error.message}`,
      rowsAffected: 0,
      originalId: sdId,
      normalizedId: normalization.canonicalId
    };
  }

  // Verify the update actually happened
  if (!data) {
    return {
      success: false,
      error: 'Update returned no data - possible silent failure',
      rowsAffected: 0,
      originalId: sdId,
      normalizedId: normalization.canonicalId
    };
  }

  return {
    success: true,
    error: null,
    rowsAffected: 1,
    originalId: sdId,
    normalizedId: normalization.canonicalId,
    wasNormalized: normalization.wasNormalized,
    updatedData: dataWithTimestamp
  };
}

/**
 * Batch normalize multiple SD identifiers
 *
 * Useful for operations that need to work with multiple SDs.
 *
 * @param {Object} supabase - Supabase client instance
 * @param {string[]} sdIds - Array of SD identifiers
 * @returns {Promise<Map<string, string>>} Map of input ID -> canonical ID
 */
export async function normalizeSDIdBatch(supabase, sdIds) {
  const results = new Map();

  // De-duplicate inputs
  const uniqueIds = [...new Set(sdIds.filter(id => id && typeof id === 'string'))];

  // Query all at once for efficiency
  const { data: sds, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key');

  if (error || !sds) {
    console.error('[SD-ID-NORMALIZER] Batch query failed:', error?.message);
    return results;
  }

  // Build lookup maps
  const byId = new Map(sds.map(sd => [sd.id, sd.id]));
  const bySdKey = new Map(sds.filter(sd => sd.sd_key).map(sd => [sd.sd_key, sd.id]));

  // Resolve each input
  for (const inputId of uniqueIds) {
    const trimmed = inputId.trim();
    const canonical = byId.get(trimmed) || bySdKey.get(trimmed);

    if (canonical) {
      results.set(inputId, canonical);
    } else {
      console.warn(`[SD-ID-NORMALIZER] Could not normalize: ${inputId}`);
    }
  }

  return results;
}

/**
 * Validate that an SD exists and return consistent ID
 *
 * Convenience wrapper that combines existence check with normalization.
 * Throws if SD not found (unlike normalizeSDId which returns null).
 *
 * @param {Object} supabase - Supabase client instance
 * @param {string} sdId - SD identifier in any format
 * @returns {Promise<string>} Canonical SD.id
 * @throws {Error} If SD not found
 */
export async function requireSDId(supabase, sdId) {
  const normalized = await normalizeSDId(supabase, sdId);

  if (!normalized) {
    throw new Error(
      `[SD-ID-NORMALIZER] SD not found: "${sdId}". ` +
      'Ensure the SD exists in strategic_directives_v2 before performing operations.'
    );
  }

  return normalized;
}

export default {
  detectIdFormat,
  isUUID,
  normalizeSDId,
  normalizeSDIdWithDetails,
  safeSDUpdate,
  normalizeSDIdBatch,
  requireSDId
};
