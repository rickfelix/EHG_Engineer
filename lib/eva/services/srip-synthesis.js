/**
 * SRIP Synthesis Prompt Service
 * SD: SD-LEO-INFRA-SRIP-CORE-PIPELINE-001
 *
 * CRUD operations for the srip_synthesis_prompts table.
 * Provides data access for synthesis prompt records.
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
 * Create a new synthesis prompt record.
 * @param {Object} params
 * @param {string} params.ventureId - Venture UUID
 * @param {string} params.siteDnaId - FK to srip_site_dna
 * @param {string} params.brandInterviewId - FK to srip_brand_interviews
 * @param {string} params.promptText - The generated prompt
 * @param {number} [params.fidelityTarget] - Target fidelity score 0-100
 * @param {number} [params.version] - Prompt version number
 * @param {number} [params.tokenCount] - Estimated token count
 * @param {string} [params.status] - draft | active | superseded
 * @param {string} [params.createdBy] - Creator identifier
 * @returns {Promise<Object>} Created record
 */
export async function createSynthesisPrompt({
  ventureId,
  siteDnaId,
  brandInterviewId,
  promptText,
  fidelityTarget = 85,
  version = 1,
  tokenCount = null,
  status = 'draft',
  createdBy = 'srip-service',
}) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('srip_synthesis_prompts')
    .insert({
      venture_id: ventureId,
      site_dna_id: siteDnaId,
      brand_interview_id: brandInterviewId,
      prompt_text: promptText,
      fidelity_target: fidelityTarget,
      version,
      token_count: tokenCount,
      status,
      created_by: createdBy,
    })
    .select()
    .single();

  if (error) throw new Error(`createSynthesisPrompt failed: ${error.message}`);
  return data;
}

/**
 * Get a synthesis prompt by ID.
 * @param {string} id - Record UUID
 * @returns {Promise<Object|null>}
 */
export async function getSynthesisPrompt(id) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('srip_synthesis_prompts')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;
  return data;
}

/**
 * List synthesis prompts for a venture.
 * @param {string} ventureId - Venture UUID
 * @param {Object} [options]
 * @param {string} [options.status] - Filter by status
 * @returns {Promise<Array>}
 */
export async function listSynthesisPrompts(ventureId, { status } = {}) {
  const supabase = getSupabase();
  let query = supabase
    .from('srip_synthesis_prompts')
    .select('*')
    .eq('venture_id', ventureId)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw new Error(`listSynthesisPrompts failed: ${error.message}`);
  return data || [];
}

/**
 * Update a synthesis prompt record.
 * @param {string} id - Record UUID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated record
 */
export async function updateSynthesisPrompt(id, updates) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('srip_synthesis_prompts')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`updateSynthesisPrompt failed: ${error.message}`);
  return data;
}

/**
 * Get the active synthesis prompt for a venture.
 * @param {string} ventureId - Venture UUID
 * @returns {Promise<Object|null>}
 */
export async function getActiveSynthesisPrompt(ventureId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('srip_synthesis_prompts')
    .select('*')
    .eq('venture_id', ventureId)
    .eq('status', 'active')
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (error) return null;
  return data;
}

/**
 * Supersede all existing prompts for a venture and activate a new one.
 * @param {string} ventureId - Venture UUID
 * @param {string} newPromptId - ID of the prompt to activate
 * @returns {Promise<Object>} The activated prompt
 */
export async function activatePrompt(ventureId, newPromptId) {
  const supabase = getSupabase();

  // Supersede existing active prompts
  await supabase
    .from('srip_synthesis_prompts')
    .update({ status: 'superseded' })
    .eq('venture_id', ventureId)
    .eq('status', 'active');

  // Activate the new one
  const { data, error } = await supabase
    .from('srip_synthesis_prompts')
    .update({ status: 'active' })
    .eq('id', newPromptId)
    .select()
    .single();

  if (error) throw new Error(`activatePrompt failed: ${error.message}`);
  return data;
}
