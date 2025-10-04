/**
 * Strategic Directive Helper Functions
 *
 * Provides consistent ID lookups and conversions for SD/PRD operations
 * after ID schema migration.
 *
 * Usage:
 *   import { getSDUuid, getSDByKey, createPRDLink } from './lib/sd-helpers.js';
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Get SD UUID from sd_key
 *
 * @param {string} sdKey - SD key (e.g., "SD-QUALITY-002")
 * @returns {Promise<string|null>} UUID or null if not found
 *
 * @example
 * const uuid = await getSDUuid('SD-QUALITY-002');
 * // Returns: "d79779f5-3fb4-4745-a45b-2690033716bf"
 */
export async function getSDUuid(sdKey) {
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id')
    .eq('sd_key', sdKey)
    .single();

  if (error || !sd) {
    console.warn(`⚠️  SD not found: ${sdKey}`);
    return null;
  }

  return sd.uuid_id;
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
 * Get full SD record by uuid_id
 *
 * @param {string} uuid - SD UUID
 * @returns {Promise<Object|null>} SD record or null
 *
 * @example
 * const sd = await getSDByUuid('d79779f5-3fb4-4745-a45b-2690033716bf');
 */
export async function getSDByUuid(uuid) {
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('uuid_id', uuid)
    .single();

  if (error || !sd) {
    console.warn(`⚠️  SD not found: ${uuid}`);
    return null;
  }

  return sd;
}

/**
 * Create proper PRD linkage to SD
 *
 * Returns object with both old and new field formats for backward compatibility
 *
 * @param {string} sdKey - SD key (e.g., "SD-QUALITY-002")
 * @returns {Promise<Object>} { directive_id, sd_uuid }
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
  const uuid = await getSDUuid(sdKey);

  if (!uuid) {
    throw new Error(`Cannot create PRD link: SD "${sdKey}" not found`);
  }

  return {
    directive_id: uuid,  // Use UUID for new standard (backward compatible)
    sd_uuid: uuid        // Explicit new column
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
  if (!prd.sd_uuid && !prd.directive_id) {
    return {
      valid: false,
      message: 'PRD has no SD linkage (both sd_uuid and directive_id are null)',
      sd: null
    };
  }

  const sdUuid = prd.sd_uuid || prd.directive_id;
  const sd = await getSDByUuid(sdUuid);

  if (!sd) {
    return {
      valid: false,
      message: `PRD links to non-existent SD (uuid: ${sdUuid})`,
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
  const uuid = await getSDUuid(sdKey);

  if (!uuid) {
    return [];
  }

  const { data: prds, error } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('sd_uuid', uuid);

  if (error) {
    console.warn(`⚠️  Error fetching PRDs for ${sdKey}:`, error.message);
    return [];
  }

  return prds || [];
}

/**
 * Convert old-style directive_id to new sd_uuid
 *
 * Helper for migration scripts
 *
 * @param {string} directiveId - Old directive_id (could be UUID or sd_key)
 * @returns {Promise<string|null>} Standard UUID
 */
export async function normalizeDirectiveId(directiveId) {
  if (!directiveId) return null;

  // Check if it's already a UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (uuidRegex.test(directiveId)) {
    // It's a UUID, verify it exists
    const sd = await getSDByUuid(directiveId);
    return sd ? sd.uuid_id : null;
  }

  // It's an sd_key, look it up
  return await getSDUuid(directiveId);
}

/**
 * Bulk update PRD directive_id to sd_uuid
 *
 * Migration helper to fix PRDs with old-style directive_id
 *
 * @param {Array<string>} prdIds - Array of PRD IDs to fix
 * @returns {Promise<Object>} { updated, failed, errors }
 */
export async function bulkFixPRDLinks(prdIds) {
  const results = {
    updated: 0,
    failed: 0,
    errors: []
  };

  for (const prdId of prdIds) {
    try {
      // Get PRD
      const { data: prd } = await supabase
        .from('product_requirements_v2')
        .select('id, directive_id, sd_uuid')
        .eq('id', prdId)
        .single();

      if (!prd) {
        results.failed++;
        results.errors.push({ prdId, error: 'PRD not found' });
        continue;
      }

      // Skip if already has sd_uuid
      if (prd.sd_uuid) {
        continue;
      }

      // Convert directive_id to sd_uuid
      const uuid = await normalizeDirectiveId(prd.directive_id);

      if (!uuid) {
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
        .update({ sd_uuid: uuid })
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
  getSDUuid,
  getSDByKey,
  getSDByUuid,
  createPRDLink,
  validatePRDLink,
  getPRDsForSD,
  normalizeDirectiveId,
  bulkFixPRDLinks
};
