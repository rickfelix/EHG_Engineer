/**
 * Shared SD database operations
 * Handles upsert, batch insert, and query operations for strategic_directives_v2
 */

import { getSupabaseClient } from './supabase-client.js';

const TABLE_NAME = 'strategic_directives_v2';

/**
 * Check if an SD exists by ID
 * @param {string} sdId - The SD ID to check
 * @returns {Promise<boolean>}
 */
export async function sdExists(sdId) {
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from(TABLE_NAME)
    .select('id')
    .eq('id', sdId)
    .single();

  return !!data;
}

/**
 * Get an SD by ID
 * @param {string} sdId - The SD ID to retrieve
 * @returns {Promise<object|null>}
 */
export async function getSD(sdId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('id', sdId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }
  return data;
}

/**
 * Upsert a single SD (insert or update)
 * @param {object} sdData - The SD data to upsert
 * @returns {Promise<{action: 'created'|'updated', data: object}>}
 */
export async function upsertSD(sdData) {
  const supabase = getSupabaseClient();

  // Ensure updated_at is set
  const dataWithTimestamp = {
    ...sdData,
    updated_at: new Date().toISOString()
  };

  // Check if exists
  const exists = await sdExists(sdData.id);

  if (exists) {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update(dataWithTimestamp)
      .eq('id', sdData.id)
      .select()
      .single();

    if (error) throw error;
    return { action: 'updated', data };
  }

  // Ensure created_at is set for new records
  if (!dataWithTimestamp.created_at) {
    dataWithTimestamp.created_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert(dataWithTimestamp)
    .select()
    .single();

  if (error) throw error;
  return { action: 'created', data };
}

/**
 * Upsert multiple SDs in order (respecting parent-child hierarchy)
 * @param {Array<object>} sdList - Array of SD data objects
 * @returns {Promise<{created: string[], updated: string[], failed: Array<{id: string, error: string}>}>}
 */
export async function upsertSDs(sdList) {
  const results = {
    created: [],
    updated: [],
    failed: []
  };

  for (const sd of sdList) {
    try {
      const { action, data } = await upsertSD(sd);
      if (action === 'created') {
        results.created.push(data.id);
      } else {
        results.updated.push(data.id);
      }
    } catch (error) {
      results.failed.push({
        id: sd.id,
        error: error.message
      });
    }
  }

  return results;
}

/**
 * Batch upsert SDs using Supabase's upsert
 * Note: Use upsertSDs for hierarchy-ordered insertion
 * @param {Array<object>} sdList - Array of SD data objects
 * @returns {Promise<{success: boolean, count: number, error?: string}>}
 */
export async function batchUpsertSDs(sdList) {
  const supabase = getSupabaseClient();

  const dataWithTimestamps = sdList.map(sd => ({
    ...sd,
    updated_at: new Date().toISOString(),
    created_at: sd.created_at || new Date().toISOString()
  }));

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .upsert(dataWithTimestamps, { onConflict: 'id' })
    .select();

  if (error) {
    return { success: false, count: 0, error: error.message };
  }

  return { success: true, count: data.length };
}

/**
 * Delete an SD by ID
 * @param {string} sdId - The SD ID to delete
 * @returns {Promise<boolean>}
 */
export async function deleteSD(sdId) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from(TABLE_NAME)
    .delete()
    .eq('id', sdId);

  if (error) throw error;
  return true;
}

/**
 * Get all child SDs for a parent
 * @param {string} parentSdId - The parent SD ID
 * @returns {Promise<Array<object>>}
 */
export async function getChildSDs(parentSdId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('parent_sd_id', parentSdId)
    .order('sequence_rank', { ascending: true });

  if (error) throw error;
  return data || [];
}
