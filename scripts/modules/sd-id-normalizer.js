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
 * - legacy_id: "SD-STAGE-ARCH-001"
 * - id: Could be UUID or string depending on when the SD was created
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
 * @returns {string} Format type: 'uuid', 'sd_key', 'legacy_id', or 'unknown'
 */
export function detectIdFormat(sdId) {
  if (!sdId || typeof sdId !== 'string') {
    return 'unknown';
  }

  if (UUID_REGEX.test(sdId)) {
    return 'uuid';
  }

  if (SD_KEY_REGEX.test(sdId)) {
    // Could be sd_key or legacy_id - both use same format
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
 * This function resolves any form of SD identifier (uuid, legacy_id, sd_key)
 * to the canonical `id` value from the strategic_directives_v2 table.
 *
 * CRITICAL: Always use this before any update operation to prevent silent failures.
 *
 * @param {Object} supabase - Supabase client instance
 * @param {string} sdId - SD identifier in any format (uuid, legacy_id, sd_key)
 * @returns {Promise<string|null>} Canonical SD.id or null if not found
 *
 * @example
 * // All these will return the same canonical ID
 * await normalizeSDId(supabase, 'SD-STAGE-ARCH-001');     // sd_key format
 * await normalizeSDId(supabase, 'e1c8cc23-...');          // uuid format
 * await normalizeSDId(supabase, 'SD-STAGE-ARCH-001');     // legacy_id format
 */
export async function normalizeSDId(supabase, sdId) {
  if (!sdId || typeof sdId !== 'string') {
    console.warn('[SD-ID-NORMALIZER] Invalid sdId provided:', sdId);
    return null;
  }

  const trimmedId = sdId.trim();
  const format = detectIdFormat(trimmedId);

  // Strategy: Query using OR to check all possible identifier columns
  // This is more efficient than multiple sequential queries
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .or(`id.eq.${trimmedId},legacy_id.eq.${trimmedId},sd_key.eq.${trimmedId}`)
    .maybeSingle();

  if (error) {
    console.error('[SD-ID-NORMALIZER] Query error:', error.message);
    return null;
  }

  if (!sd) {
    console.warn(`[SD-ID-NORMALIZER] SD not found for identifier: ${trimmedId} (format: ${format})`);
    return null;
  }

  // Log normalization for debugging silent update issues
  if (sd.id !== trimmedId) {
    console.log(`[SD-ID-NORMALIZER] Normalized: "${trimmedId}" -> "${sd.id}"`);
  }

  return sd.id;
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
    .select('id, legacy_id, sd_key, title, status, current_phase')
    .or(`id.eq.${trimmedId},legacy_id.eq.${trimmedId},sd_key.eq.${trimmedId}`)
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
  const { data, error, count } = await supabase
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
    .select('id, legacy_id, sd_key');

  if (error || !sds) {
    console.error('[SD-ID-NORMALIZER] Batch query failed:', error?.message);
    return results;
  }

  // Build lookup maps
  const byId = new Map(sds.map(sd => [sd.id, sd.id]));
  const byLegacyId = new Map(sds.filter(sd => sd.legacy_id).map(sd => [sd.legacy_id, sd.id]));
  const bySdKey = new Map(sds.filter(sd => sd.sd_key).map(sd => [sd.sd_key, sd.id]));

  // Resolve each input
  for (const inputId of uniqueIds) {
    const trimmed = inputId.trim();
    const canonical = byId.get(trimmed) || byLegacyId.get(trimmed) || bySdKey.get(trimmed);

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
