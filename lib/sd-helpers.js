/**
 * Strategic Directive Helper Functions
 *
 * Provides consistent ID lookups and conversions for SD/PRD operations.
 *
 * SD ID SCHEMA CLEANUP (2025-12-12):
 * - strategic_directives_v2.id is now the canonical identifier
 * - uuid_id column is DEPRECATED - do not use for FK relationships
 * - product_requirements_v2.sd_id references SD.id (not uuid_id)
 *
 * SD-LEO-ID-NORMALIZE-001 (2025-12-30):
 * - Added normalizeSDId for update operations to prevent silent failures
 * - All SD updates should use normalizeSDId before .eq('id', ...) queries
 * - See scripts/modules/sd-id-normalizer.js for comprehensive normalization
 *
 * Usage:
 *   import { getSDId, getSDByKey, createPRDLink, normalizeSDId } from './lib/sd-helpers.js';
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Get SD ID from sd_key
 *
 * @param {string} sdKey - SD key (e.g., "SD-QUALITY-002")
 * @returns {Promise<string|null>} SD.id or null if not found
 *
 * @example
 * const id = await getSDId('SD-QUALITY-002');
 * // Returns: "SD-QUALITY-002" or UUID depending on SD
 */
export async function getSDId(sdKey) {
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', sdKey)
    .single();

  if (error || !sd) {
    console.warn(`⚠️  SD not found: ${sdKey}`);
    return null;
  }

  return sd.id;
}

/**
 * Get SD UUID from sd_key (deprecated - use getSDId instead)
 *
 * @deprecated Use getSDId() instead. uuid_id column is deprecated.
 * @param {string} sdKey - SD key
 * @returns {Promise<string|null>} SD.id (NOT uuid_id) or null
 */
export async function getSDUuid(sdKey) {
  console.warn('DEPRECATED: getSDUuid() - use getSDId() instead. Returning SD.id for compatibility.');
  return getSDId(sdKey);
}

/**
 * Get full SD record by sd_key
 *
 * @param {string} sdKey - SD key (e.g., "SD-QUALITY-002")
 * @returns {Promise<Object|null>} SD record or null
 *
 * @example
 * const sd = await getSDByKey('SD-QUALITY-002');
 * // Returns: { id, uuid_id, sd_key, title, ... }
 */
export async function getSDByKey(sdKey) {
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('sd_key', sdKey)
    .single();

  if (error || !sd) {
    console.warn(`⚠️  SD not found: ${sdKey}`);
    return null;
  }

  return sd;
}

/**
 * Get full SD record by id
 *
 * @param {string} id - SD ID (primary key)
 * @returns {Promise<Object|null>} SD record or null
 *
 * @example
 * const sd = await getSDById('SD-QUALITY-002');
 */
export async function getSDById(id) {
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !sd) {
    console.warn(`⚠️  SD not found: ${id}`);
    return null;
  }

  return sd;
}

/**
 * Get full SD record by uuid_id (deprecated - use getSDById instead)
 *
 * @deprecated Use getSDById() instead. uuid_id column is deprecated.
 * @param {string} uuid - UUID (will look up by id instead)
 * @returns {Promise<Object|null>} SD record or null
 */
export async function getSDByUuid(uuid) {
  console.warn('DEPRECATED: getSDByUuid() - use getSDById() instead');
  return getSDById(uuid);
}

/**
 * Create proper PRD linkage to SD
 *
 * Returns object with sd_id for the new standardized schema
 *
 * @param {string} sdKey - SD key (e.g., "SD-QUALITY-002")
 * @returns {Promise<Object>} { directive_id, sd_id }
 *
 * @example
 * const prd = {
 *   id: `PRD-${crypto.randomUUID()}`,
 *   title: 'My PRD',
 *   ...await createPRDLink('SD-QUALITY-002'),
 *   // ... rest of PRD
 * };
 */
export async function createPRDLink(sdKey) {
  const id = await getSDId(sdKey);

  if (!id) {
    throw new Error(`Cannot create PRD link: SD "${sdKey}" not found`);
  }

  return {
    directive_id: id,  // Legacy column (backward compatible)
    sd_id: id          // New standardized column (references SD.id)
  };
}

/**
 * Validate PRD-SD linkage
 *
 * Checks if a PRD is properly linked to its SD
 *
 * @param {Object} prd - PRD object
 * @returns {Promise<Object>} { valid, message, sd }
 *
 * @example
 * const validation = await validatePRDLink(prd);
 * if (!validation.valid) {
 *   console.error('PRD linkage invalid:', validation.message);
 * }
 */
export async function validatePRDLink(prd) {
  if (!prd.sd_id && !prd.directive_id) {
    return {
      valid: false,
      message: 'PRD has no SD linkage (both sd_id and directive_id are null)',
      sd: null
    };
  }

  const sdId = prd.sd_id || prd.directive_id;
  const sd = await getSDById(sdId);

  if (!sd) {
    return {
      valid: false,
      message: `PRD links to non-existent SD (id: ${sdId})`,
      sd: null
    };
  }

  return {
    valid: true,
    message: 'PRD properly linked to SD',
    sd
  };
}

/**
 * Get all PRDs for an SD
 *
 * @param {string} sdKey - SD key
 * @returns {Promise<Array>} Array of PRD records
 *
 * @example
 * const prds = await getPRDsForSD('SD-QUALITY-002');
 * console.log(`Found ${prds.length} PRDs for this SD`);
 */
export async function getPRDsForSD(sdKey) {
  const id = await getSDId(sdKey);

  if (!id) {
    return [];
  }

  const { data: prds, error } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('sd_id', id);

  if (error) {
    console.warn(`⚠️  Error fetching PRDs for ${sdKey}:`, error.message);
    return [];
  }

  return prds || [];
}

/**
 * Convert directive_id to normalized SD.id
 *
 * Helper for migration scripts and lookups
 * SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id references (column dropped 2026-01-24)
 *
 * @param {string} directiveId - directive_id (could be SD.id or sd_key)
 * @returns {Promise<string|null>} Canonical SD.id
 */
export async function normalizeDirectiveId(directiveId) {
  if (!directiveId) return null;

  // First, try direct lookup by id
  const { data: byId } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('id', directiveId)
    .single();

  if (byId) return byId.id;

  // Try by sd_key
  const { data: byKey } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', directiveId)
    .single();

  if (byKey) return byKey.id;

  return null;
}

/**
 * Normalize SD identifier for update operations (SD-LEO-ID-NORMALIZE-001)
 *
 * CRITICAL: Use this before any SD update to prevent silent failures.
 * The strategic_directives_v2 table uses a VARCHAR id column that can contain
 * either UUID format or string format. When the input format doesn't match
 * the actual id value, updates silently match zero rows.
 *
 * @param {string} sdId - SD identifier in any format (uuid or sd_key)
 * @returns {Promise<string|null>} Canonical SD.id for use in .eq('id', ...)
 *
 * @example
 * // Before update, always normalize:
 * const canonicalId = await normalizeSDId(sdId);
 * if (!canonicalId) throw new Error('SD not found');
 * await supabase.from('strategic_directives_v2')
 *   .update({ status: 'completed' })
 *   .eq('id', canonicalId);
 */
export async function normalizeSDId(sdId) {
  if (!sdId || typeof sdId !== 'string') {
    console.warn('[normalizeSDId] Invalid sdId provided:', sdId);
    return null;
  }

  const trimmedId = sdId.trim();

  // Query using OR to check all possible identifier columns efficiently
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .or(`id.eq.${trimmedId},sd_key.eq.${trimmedId}`)
    .maybeSingle();

  if (error) {
    console.error('[normalizeSDId] Query error:', error.message);
    return null;
  }

  if (!sd) {
    console.warn(`[normalizeSDId] SD not found for identifier: ${trimmedId}`);
    return null;
  }

  // Log normalization for debugging silent update issues
  if (sd.id !== trimmedId) {
    console.log(`[normalizeSDId] Normalized: "${trimmedId}" -> "${sd.id}"`);
  }

  return sd.id;
}

/**
 * Bulk update PRD directive_id to sd_id (deprecated - migration complete)
 *
 * @deprecated Migration from sd_uuid to sd_id is complete (2025-12-12).
 * @param {Array<string>} prdIds - Array of PRD IDs to fix
 * @returns {Promise<Object>} { updated, failed, errors }
 */
export async function bulkFixPRDLinks(prdIds) {
  console.warn('DEPRECATED: bulkFixPRDLinks() - PRD schema migration is complete');

  const results = {
    updated: 0,
    failed: 0,
    errors: [],
    message: 'Migration complete - sd_id column is now the standard'
  };

  for (const prdId of prdIds) {
    try {
      const { data: prd } = await supabase
        .from('product_requirements_v2')
        .select('id, directive_id, sd_id')
        .eq('id', prdId)
        .single();

      if (!prd) {
        results.failed++;
        results.errors.push({ prdId, error: 'PRD not found' });
        continue;
      }

      // Skip if already has sd_id
      if (prd.sd_id) {
        continue;
      }

      // Convert directive_id to sd_id
      const sdId = await normalizeDirectiveId(prd.directive_id);

      if (!sdId) {
        results.failed++;
        results.errors.push({
          prdId,
          error: `Cannot resolve directive_id: ${prd.directive_id}`
        });
        continue;
      }

      // Update PRD
      const { error } = await supabase
        .from('product_requirements_v2')
        .update({ sd_id: sdId })
        .eq('id', prdId);

      if (error) {
        results.failed++;
        results.errors.push({ prdId, error: error.message });
      } else {
        results.updated++;
      }
    } catch (err) {
      results.failed++;
      results.errors.push({ prdId, error: err.message });
    }
  }

  return results;
}

export default {
  getSDId,
  getSDUuid,  // deprecated
  getSDByKey,
  getSDById,
  getSDByUuid,  // deprecated
  createPRDLink,
  validatePRDLink,
  getPRDsForSD,
  normalizeDirectiveId,
  normalizeSDId,  // SD-LEO-ID-NORMALIZE-001: Critical for update operations
  bulkFixPRDLinks  // deprecated
};
