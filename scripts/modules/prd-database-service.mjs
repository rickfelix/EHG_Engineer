/**
 * PRD Database Service Module
 * Extracted from add-prd-to-database.js for modularity
 *
 * Part of SD-REFACTOR-2025-001-P2-001: add-prd-to-database Refactoring
 *
 * Contains database operations for PRD management.
 * @module PRDDatabaseService
 * @version 1.0.0
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// =============================================================================
// DATABASE CLIENT
// =============================================================================

let supabaseClient = null;

/**
 * Get or create Supabase client
 */
export function getSupabaseClient() {
  if (!supabaseClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      throw new Error('Supabase credentials not configured');
    }

    supabaseClient = createClient(url, key);
  }
  return supabaseClient;
}

// =============================================================================
// SD OPERATIONS
// =============================================================================

/**
 * Fetch Strategic Directive by ID
 * @param {string} sdId - SD ID
 * @returns {Promise<object|null>} SD data or null
 */
export async function getStrategicDirective(sdId) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', sdId)
    .single();

  if (error) {
    console.error(`❌ Failed to fetch SD ${sdId}:`, error.message);
    return null;
  }

  return data;
}

/**
 * Update SD status
 * @param {string} sdId - SD ID
 * @param {string} status - New status
 * @returns {Promise<boolean>} Success
 */
export async function updateSDStatus(sdId, status) {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', sdId);

  if (error) {
    console.error(`❌ Failed to update SD status:`, error.message);
    return false;
  }

  return true;
}

// =============================================================================
// PRD OPERATIONS
// =============================================================================

/**
 * Check if PRD exists
 * @param {string} prdId - PRD ID
 * @returns {Promise<object|null>} Existing PRD or null
 */
export async function checkPRDExists(prdId) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .select('id, status, created_at')
    .eq('id', prdId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error checking PRD:', error.message);
  }

  return data || null;
}

/**
 * Create PRD in database
 * @param {object} prdData - PRD data object
 * @returns {Promise<object|null>} Created PRD or null
 */
export async function createPRD(prdData) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .insert(prdData)
    .select()
    .single();

  if (error) {
    console.error('❌ Failed to create PRD:', error.message);
    console.error('   Code:', error.code);
    console.error('   Details:', error.details);
    return null;
  }

  return data;
}

/**
 * Update PRD in database
 * @param {string} prdId - PRD ID
 * @param {object} updates - Fields to update
 * @returns {Promise<object|null>} Updated PRD or null
 */
export async function updatePRD(prdId, updates) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', prdId)
    .select()
    .single();

  if (error) {
    console.error('❌ Failed to update PRD:', error.message);
    return null;
  }

  return data;
}

/**
 * Get PRD by ID
 * @param {string} prdId - PRD ID
 * @returns {Promise<object|null>} PRD data or null
 */
export async function getPRD(prdId) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('id', prdId)
    .single();

  if (error) {
    console.error(`❌ Failed to fetch PRD ${prdId}:`, error.message);
    return null;
  }

  return data;
}

/**
 * Get PRD by SD ID
 * @param {string} sdId - SD ID
 * @returns {Promise<object|null>} PRD data or null
 */
export async function getPRDBySdId(sdId) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('sd_id', sdId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error(`Error fetching PRD for SD ${sdId}:`, error.message);
  }

  return data || null;
}

/**
 * Delete PRD
 * @param {string} prdId - PRD ID
 * @returns {Promise<boolean>} Success
 */
export async function deletePRD(prdId) {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from('product_requirements_v2')
    .delete()
    .eq('id', prdId);

  if (error) {
    console.error('❌ Failed to delete PRD:', error.message);
    return false;
  }

  return true;
}

// =============================================================================
// USER STORIES OPERATIONS
// =============================================================================

/**
 * Get user stories for SD
 * @param {string} sdId - SD ID
 * @returns {Promise<Array>} User stories
 */
export async function getUserStoriesBySdId(sdId) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('user_stories')
    .select('*')
    .eq('sd_id', sdId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error(`Error fetching stories for SD ${sdId}:`, error.message);
    return [];
  }

  return data || [];
}

/**
 * Create user story
 * @param {object} storyData - Story data
 * @returns {Promise<object|null>} Created story or null
 */
export async function createUserStory(storyData) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('user_stories')
    .insert(storyData)
    .select()
    .single();

  if (error) {
    console.error('❌ Failed to create user story:', error.message);
    return null;
  }

  return data;
}

export default {
  getSupabaseClient,
  getStrategicDirective,
  updateSDStatus,
  checkPRDExists,
  createPRD,
  updatePRD,
  getPRD,
  getPRDBySdId,
  deletePRD,
  getUserStoriesBySdId,
  createUserStory
};
