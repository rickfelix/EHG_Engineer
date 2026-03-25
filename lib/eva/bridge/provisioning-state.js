/**
 * Provisioning State CRUD
 * SD-LEO-INFRA-VENTURE-LEO-BUILD-001-C
 *
 * CRUD operations for the venture_provisioning_state table.
 * Tracks the provisioning lifecycle per venture.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Get provisioning state for a venture. Auto-creates if not found.
 * @param {string} ventureId - Venture UUID
 * @returns {Promise<{ data: object|null, error: string|null }>}
 */
export async function getState(ventureId) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('venture_provisioning_state')
    .select('*')
    .eq('venture_id', ventureId)
    .single();

  if (error?.code === 'PGRST116') {
    // No row found — auto-create with pending status
    const newState = {
      venture_id: ventureId,
      status: 'pending',
      current_step: null,
      steps_completed: [],
      error_details: null,
      retry_count: 0,
    };

    const { data: created, error: createErr } = await supabase
      .from('venture_provisioning_state')
      .insert(newState)
      .select('*')
      .single();

    if (createErr) return { data: null, error: `Failed to create state: ${createErr.message}` };
    return { data: created, error: null };
  }

  if (error) return { data: null, error: `Failed to get state: ${error.message}` };
  return { data, error: null };
}

/**
 * Update the current step and optionally add to steps_completed.
 * @param {string} ventureId
 * @param {string} stepName - Current step being executed
 * @param {string} status - 'in_progress' | 'completed' | 'failed'
 * @param {object} [opts]
 * @param {boolean} [opts.markStepDone=false] - Add step to steps_completed
 * @param {string} [opts.errorMessage] - Error detail if failed
 * @returns {Promise<{ success: boolean, error: string|null }>}
 */
export async function updateStep(ventureId, stepName, status, opts = {}) {
  const supabase = getSupabase();
  const { markStepDone = false, errorMessage = null } = opts;

  // Get current state to merge steps_completed
  const { data: current } = await supabase
    .from('venture_provisioning_state')
    .select('steps_completed')
    .eq('venture_id', ventureId)
    .single();

  const stepsCompleted = current?.steps_completed || [];
  if (markStepDone && !stepsCompleted.includes(stepName)) {
    stepsCompleted.push(stepName);
  }

  const update = {
    status,
    current_step: stepName,
    steps_completed: stepsCompleted,
    updated_at: new Date().toISOString(),
  };

  if (errorMessage) update.error_details = errorMessage;

  const { error } = await supabase
    .from('venture_provisioning_state')
    .update(update)
    .eq('venture_id', ventureId);

  if (error) return { success: false, error: `Update failed: ${error.message}` };
  return { success: true, error: null };
}

/**
 * Mark provisioning as fully completed.
 * @param {string} ventureId
 * @returns {Promise<{ success: boolean, error: string|null }>}
 */
export async function markComplete(ventureId) {
  const supabase = getSupabase();

  const { error } = await supabase
    .from('venture_provisioning_state')
    .update({
      status: 'completed',
      current_step: null,
      error_details: null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('venture_id', ventureId);

  if (error) return { success: false, error: `Mark complete failed: ${error.message}` };
  return { success: true, error: null };
}

/**
 * Mark provisioning as permanently failed.
 * @param {string} ventureId
 * @param {string} errorMessage
 * @returns {Promise<{ success: boolean, error: string|null }>}
 */
export async function markFailed(ventureId, errorMessage) {
  const supabase = getSupabase();

  const { error } = await supabase
    .from('venture_provisioning_state')
    .update({
      status: 'failed',
      error_details: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq('venture_id', ventureId);

  if (error) return { success: false, error: `Mark failed error: ${error.message}` };
  return { success: true, error: null };
}
