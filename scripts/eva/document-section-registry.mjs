/**
 * Document Section Registry
 * SD-LEO-INFRA-DATABASE-FIRST-VISION-001
 *
 * Queries document_section_schemas for section definitions.
 * Provides validation and key-mapping utilities for vision
 * and architecture_plan document types.
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import dotenv from 'dotenv';
dotenv.config();

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createSupabaseServiceClient();
  }
  return _supabase;
}

/**
 * Get section schema definitions for a document type.
 *
 * @param {string} documentType - 'vision' or 'architecture_plan'
 * @param {Object} [options]
 * @param {Object} [options.supabase] - Supabase client override
 * @param {boolean} [options.activeOnly=true] - Only return active sections
 * @returns {Promise<Array>} Ordered array of section schema objects
 */
export async function getSectionSchema(documentType, options = {}) {
  const { supabase: sbOverride, activeOnly = true } = options;
  const supabase = sbOverride || getSupabase();

  let query = supabase
    .from('document_section_schemas')
    .select('*')
    .eq('document_type', documentType)
    .order('section_order', { ascending: true });

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load section schema for ${documentType}: ${error.message}`);
  return data || [];
}

/**
 * Validate a sections object against the schema for a document type.
 *
 * @param {Object} sections - Object with section_key → content pairs
 * @param {string} documentType - 'vision' or 'architecture_plan'
 * @param {Object} [options]
 * @param {Object} [options.supabase] - Supabase client override
 * @returns {Promise<{valid: boolean, errors: string[], warnings: string[]}>}
 */
export async function validateSections(sections, documentType, options = {}) {
  const schema = await getSectionSchema(documentType, options);
  const errors = [];
  const warnings = [];

  for (const def of schema) {
    const content = sections[def.section_key];

    if (def.is_required && (!content || content.trim().length === 0)) {
      errors.push(`Missing required section: ${def.section_name} (${def.section_key})`);
      continue;
    }

    if (content && def.min_content_length && content.trim().length < def.min_content_length) {
      warnings.push(
        `Section "${def.section_name}" is short (${content.trim().length} chars, minimum ${def.min_content_length})`
      );
    }
  }

  // Check for unknown sections
  const knownKeys = new Set(schema.map(s => s.section_key));
  for (const key of Object.keys(sections)) {
    if (!knownKeys.has(key)) {
      warnings.push(`Unknown section key: ${key} (not in schema for ${documentType})`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Build a mapping from section heading names to section keys.
 * Used by the markdown parser to map "## Executive Summary" → "executive_summary".
 *
 * @param {string} documentType - 'vision' or 'architecture_plan'
 * @param {Object} [options]
 * @param {Object} [options.supabase] - Supabase client override
 * @returns {Promise<Map<string, string>>} Map of lowercase heading → section_key
 */
export async function buildSectionKeyMapping(documentType, options = {}) {
  const schema = await getSectionSchema(documentType, options);
  const mapping = new Map();

  for (const def of schema) {
    // Map exact name (lowercase)
    mapping.set(def.section_name.toLowerCase(), def.section_key);

    // Map key with spaces (e.g., "executive summary" → "executive_summary")
    mapping.set(def.section_key.replace(/_/g, ' '), def.section_key);

    // Map key as-is
    mapping.set(def.section_key, def.section_key);
  }

  return mapping;
}
