/**
 * SRIP Site DNA Service
 * SD: SD-LEO-INFRA-SRIP-CORE-PIPELINE-001
 *
 * CRUD operations for the srip_site_dna table.
 * Provides data access for Site DNA extraction records.
 */

import { createSupabaseServiceClient } from '../../supabase-client.js';
import dotenv from 'dotenv';

dotenv.config();

function getSupabase() {
  return createSupabaseServiceClient();
}

/**
 * Create a new Site DNA record.
 * @param {Object} params
 * @param {string} params.ventureId - Venture UUID
 * @param {string} params.referenceUrl - Source URL
 * @param {string} [params.screenshotPath] - Optional screenshot path
 * @param {Object} [params.dnaJson] - Extracted DNA data
 * @param {Array} [params.extractionSteps] - Step-by-step extraction log
 * @param {number} [params.qualityScore] - Quality score 0-100
 * @param {string} [params.status] - draft | processing | completed | failed
 * @param {string} [params.createdBy] - Creator identifier
 * @returns {Promise<Object>} Created record
 */
export async function createSiteDna({
  ventureId,
  referenceUrl,
  screenshotPath = null,
  dnaJson = null,
  extractionSteps = null,
  qualityScore = null,
  status = 'draft',
  createdBy = 'srip-service',
}) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('srip_site_dna')
    .insert({
      venture_id: ventureId,
      reference_url: referenceUrl,
      screenshot_path: screenshotPath,
      dna_json: dnaJson,
      extraction_steps: extractionSteps,
      quality_score: qualityScore,
      status,
      created_by: createdBy,
    })
    .select()
    .single();

  if (error) throw new Error(`createSiteDna failed: ${error.message}`);
  return data;
}

/**
 * Get a Site DNA record by ID.
 * @param {string} id - Record UUID
 * @returns {Promise<Object|null>}
 */
export async function getSiteDna(id) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('srip_site_dna')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;
  return data;
}

/**
 * List Site DNA records for a venture.
 * @param {string} ventureId - Venture UUID
 * @param {Object} [options]
 * @param {string} [options.status] - Filter by status
 * @param {number} [options.limit] - Max results
 * @returns {Promise<Array>}
 */
export async function listSiteDna(ventureId, { status, limit = 50 } = {}) {
  const supabase = getSupabase();
  let query = supabase
    .from('srip_site_dna')
    .select('*')
    .eq('venture_id', ventureId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw new Error(`listSiteDna failed: ${error.message}`);
  return data || [];
}

/**
 * Update a Site DNA record.
 * @param {string} id - Record UUID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated record
 */
export async function updateSiteDna(id, updates) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('srip_site_dna')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`updateSiteDna failed: ${error.message}`);
  return data;
}

/**
 * Get the latest completed Site DNA for a venture.
 * @param {string} ventureId - Venture UUID
 * @returns {Promise<Object|null>}
 */
export async function getLatestCompletedDna(ventureId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('srip_site_dna')
    .select('*')
    .eq('venture_id', ventureId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) return null;
  return data;
}
