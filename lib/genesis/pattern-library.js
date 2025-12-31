/**
 * Genesis Virtual Bunker - Pattern Library
 *
 * Provides functions for retrieving scaffold patterns from the database.
 * Part of SD-GENESIS-V31-MASON-P1
 *
 * @module lib/genesis/pattern-library
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Pattern type constants (matches database constraint).
 */
export const PatternTypes = {
  COMPONENT: 'component',
  HOOK: 'hook',
  SERVICE: 'service',
  PAGE: 'page',
  LAYOUT: 'layout',
  API_ROUTE: 'api_route',
  DATABASE_TABLE: 'database_table',
  RLS_POLICY: 'rls_policy',
  MIGRATION: 'migration',
};

/**
 * Get all scaffold patterns from the database.
 *
 * @returns {Promise<{ data: Array, error: Error|null }>}
 */
export async function getPatterns() {
  const { data, error } = await supabase
    .from('scaffold_patterns')
    .select('*')
    .order('pattern_type')
    .order('pattern_name');

  return { data: data || [], error };
}

/**
 * Get patterns filtered by type.
 *
 * @param {string} patternType - The pattern type to filter by
 * @returns {Promise<{ data: Array, error: Error|null }>}
 */
export async function getPatternByType(patternType) {
  if (!Object.values(PatternTypes).includes(patternType)) {
    return {
      data: [],
      error: new Error(`Invalid pattern type: ${patternType}. Valid types: ${Object.values(PatternTypes).join(', ')}`),
    };
  }

  const { data, error } = await supabase
    .from('scaffold_patterns')
    .select('*')
    .eq('pattern_type', patternType)
    .order('pattern_name');

  return { data: data || [], error };
}

/**
 * Get a single pattern by ID.
 *
 * @param {string} patternId - The pattern UUID
 * @returns {Promise<{ data: Object|null, error: Error|null }>}
 */
export async function getPatternById(patternId) {
  const { data, error } = await supabase
    .from('scaffold_patterns')
    .select('*')
    .eq('id', patternId)
    .single();

  return { data, error };
}

/**
 * Get a pattern by name.
 *
 * @param {string} patternName - The pattern name
 * @returns {Promise<{ data: Object|null, error: Error|null }>}
 */
export async function getPatternByName(patternName) {
  const { data, error } = await supabase
    .from('scaffold_patterns')
    .select('*')
    .eq('pattern_name', patternName)
    .single();

  return { data, error };
}

/**
 * Search patterns by keyword in name or template.
 *
 * @param {string} keyword - Search keyword
 * @returns {Promise<{ data: Array, error: Error|null }>}
 */
export async function searchPatterns(keyword) {
  const { data, error } = await supabase
    .from('scaffold_patterns')
    .select('*')
    .or(`pattern_name.ilike.%${keyword}%,template_code.ilike.%${keyword}%`)
    .order('pattern_type')
    .order('pattern_name');

  return { data: data || [], error };
}

/**
 * Get pattern statistics by type.
 *
 * @returns {Promise<{ data: Object, error: Error|null }>}
 */
export async function getPatternStats() {
  const { data: allPatterns, error } = await supabase
    .from('scaffold_patterns')
    .select('pattern_type');

  if (error) {
    return { data: null, error };
  }

  const stats = {
    total: allPatterns.length,
    byType: {},
  };

  for (const type of Object.values(PatternTypes)) {
    const typePatterns = allPatterns.filter(p => p.pattern_type === type);
    stats.byType[type] = typePatterns.length;
  }

  return { data: stats, error: null };
}

export default {
  PatternTypes,
  getPatterns,
  getPatternByType,
  getPatternById,
  getPatternByName,
  searchPatterns,
  getPatternStats,
};
