/**
 * Design Reference Library Service
 * SD: SD-MAN-INFRA-AWWWARDS-CURATED-DESIGN-001
 *
 * CRUD operations for the design_reference_library table.
 * Provides data access for curated Awwwards design references,
 * categorized by venture archetype for Stage 15 wireframe generation.
 */

import { createSupabaseServiceClient } from '../../supabase-client.js';
import dotenv from 'dotenv';

dotenv.config();

function getSupabase() {
  return createSupabaseServiceClient();
}

/**
 * Create a single design reference record.
 * @param {Object} data
 * @param {string} data.url - Site URL (unique)
 * @param {string} data.site_name - Display name of the site
 * @param {string} data.archetype_category - One of: saas, marketplace, fintech, healthtech, e-commerce, portfolio, corporate
 * @param {number} [data.design_score] - Awwwards design score (0-10)
 * @param {number} [data.usability_score] - Awwwards usability score (0-10)
 * @param {number} [data.creativity_score] - Awwwards creativity score (0-10)
 * @param {number} [data.content_score] - Awwwards content score (0-10)
 * @param {string} [data.tech_stack] - Technology stack description
 * @param {string} [data.agency_name] - Agency/studio that built the site
 * @param {string} [data.country] - Country of origin
 * @param {string} [data.date_awarded] - Date the award was given (ISO date)
 * @param {string} [data.description] - Brief description of the site
 * @param {string} [data.screenshot_url] - URL to a screenshot
 * @param {Object} [data.metadata] - Additional metadata (JSONB)
 * @returns {Promise<Object>} Created record
 */
export async function createDesignReference(data) {
  const supabase = getSupabase();
  const { data: record, error } = await supabase
    .from('design_reference_library')
    .insert({
      url: data.url,
      site_name: data.site_name,
      archetype_category: data.archetype_category,
      design_score: data.design_score ?? null,
      usability_score: data.usability_score ?? null,
      creativity_score: data.creativity_score ?? null,
      content_score: data.content_score ?? null,
      tech_stack: data.tech_stack ?? null,
      agency_name: data.agency_name ?? null,
      country: data.country ?? null,
      date_awarded: data.date_awarded ?? null,
      description: data.description ?? null,
      screenshot_url: data.screenshot_url ?? null,
      metadata: data.metadata ?? {},
    })
    .select()
    .single();

  if (error) throw new Error(`createDesignReference failed: ${error.message}`);
  return record;
}

/**
 * Bulk insert design references with upsert on url.
 * On conflict (duplicate url), updates all fields except id and created_at.
 * @param {Array<Object>} references - Array of reference objects (same shape as createDesignReference)
 * @returns {Promise<Array<Object>>} Inserted/updated records
 */
export async function bulkInsertReferences(references) {
  if (!references || references.length === 0) return [];

  const supabase = getSupabase();
  const rows = references.map((ref) => ({
    url: ref.url,
    site_name: ref.site_name,
    archetype_category: ref.archetype_category,
    design_score: ref.design_score ?? null,
    usability_score: ref.usability_score ?? null,
    creativity_score: ref.creativity_score ?? null,
    content_score: ref.content_score ?? null,
    tech_stack: ref.tech_stack ?? null,
    agency_name: ref.agency_name ?? null,
    country: ref.country ?? null,
    date_awarded: ref.date_awarded ?? null,
    description: ref.description ?? null,
    screenshot_url: ref.screenshot_url ?? null,
    metadata: ref.metadata ?? {},
  }));

  const { data, error } = await supabase
    .from('design_reference_library')
    .upsert(rows, { onConflict: 'url' })
    .select();

  if (error) throw new Error(`bulkInsertReferences failed: ${error.message}`);
  return data || [];
}

/**
 * Get design references by archetype, sorted by combined_score descending.
 * @param {string} archetype - Archetype category to filter by
 * @param {number} [limit=5] - Maximum number of results
 * @returns {Promise<Array<Object>>} Matching references
 */
export async function getDesignReferencesByArchetype(archetype, limit = 5) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('design_reference_library')
    .select('*')
    .eq('archetype_category', archetype)
    .order('combined_score', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw new Error(`getDesignReferencesByArchetype failed: ${error.message}`);
  return data || [];
}

/**
 * Get count of design references per archetype.
 * @returns {Promise<Object>} Map of archetype_category -> count
 */
export async function getDesignReferenceStats() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('design_reference_library')
    .select('archetype_category');

  if (error) throw new Error(`getDesignReferenceStats failed: ${error.message}`);

  const stats = {};
  for (const row of data || []) {
    const cat = row.archetype_category;
    stats[cat] = (stats[cat] || 0) + 1;
  }
  return stats;
}
