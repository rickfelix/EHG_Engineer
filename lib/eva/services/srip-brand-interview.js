/**
 * SRIP Brand Interview Service
 * SD: SD-LEO-INFRA-SRIP-CORE-PIPELINE-001
 *
 * CRUD operations for the srip_brand_interviews table.
 * Provides data access for brand interview records.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Create a new brand interview record.
 * @param {Object} params
 * @param {string} params.ventureId - Venture UUID
 * @param {string} params.siteDnaId - FK to srip_site_dna
 * @param {Object} params.answers - JSONB answers keyed by question key
 * @param {number} [params.prePopulatedCount] - Number of auto-filled answers
 * @param {number} [params.manualInputCount] - Number of manually entered answers
 * @param {string} [params.status] - draft | in_progress | completed
 * @param {string} [params.createdBy] - Creator identifier
 * @returns {Promise<Object>} Created record
 */
export async function createBrandInterview({
  ventureId,
  siteDnaId,
  answers,
  prePopulatedCount = 0,
  manualInputCount = 0,
  status = 'draft',
  createdBy = 'srip-service',
}) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('srip_brand_interviews')
    .insert({
      venture_id: ventureId,
      site_dna_id: siteDnaId,
      answers,
      pre_populated_count: prePopulatedCount,
      manual_input_count: manualInputCount,
      status,
      created_by: createdBy,
    })
    .select()
    .single();

  if (error) throw new Error(`createBrandInterview failed: ${error.message}`);
  return data;
}

/**
 * Get a brand interview by ID.
 * @param {string} id - Record UUID
 * @returns {Promise<Object|null>}
 */
export async function getBrandInterview(id) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('srip_brand_interviews')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;
  return data;
}

/**
 * List brand interviews for a venture.
 * @param {string} ventureId - Venture UUID
 * @param {Object} [options]
 * @param {string} [options.status] - Filter by status
 * @param {string} [options.siteDnaId] - Filter by DNA record
 * @returns {Promise<Array>}
 */
export async function listBrandInterviews(ventureId, { status, siteDnaId } = {}) {
  const supabase = getSupabase();
  let query = supabase
    .from('srip_brand_interviews')
    .select('*')
    .eq('venture_id', ventureId)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);
  if (siteDnaId) query = query.eq('site_dna_id', siteDnaId);

  const { data, error } = await query;
  if (error) throw new Error(`listBrandInterviews failed: ${error.message}`);
  return data || [];
}

/**
 * Update a brand interview record.
 * @param {string} id - Record UUID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated record
 */
export async function updateBrandInterview(id, updates) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('srip_brand_interviews')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`updateBrandInterview failed: ${error.message}`);
  return data;
}

/**
 * Get the latest completed interview for a DNA record.
 * @param {string} siteDnaId - Site DNA UUID
 * @returns {Promise<Object|null>}
 */
export async function getLatestCompletedInterview(siteDnaId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('srip_brand_interviews')
    .select('*')
    .eq('site_dna_id', siteDnaId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) return null;
  return data;
}
