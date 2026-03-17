/**
 * Strategy Objectives Manager
 * CRUD operations for strategy_objectives table.
 *
 * Part of SD-LEO-INFRA-UNIFIED-STRATEGIC-INTELLIGENCE-001-B
 */

import { createSupabaseServiceClient } from '../supabase-client.js';

const supabase = createSupabaseServiceClient();

/**
 * Create a new strategy objective.
 * @param {Object} params - { title, description, time_horizon, target_capabilities, linked_okr_ids }
 * @returns {Object} Created objective
 */
export async function createObjective({ title, description, time_horizon, target_capabilities = [], linked_okr_ids = [] }) {
  const { data, error } = await supabase
    .from('strategy_objectives')
    .insert({ title, description, time_horizon, target_capabilities, linked_okr_ids })
    .select()
    .single();

  if (error) throw new Error(`createObjective failed: ${error.message}`);
  return data;
}

/**
 * Update an existing strategy objective.
 * @param {string} id - Objective UUID
 * @param {Object} updates - Fields to update
 * @returns {Object} Updated objective
 */
export async function updateObjective(id, updates) {
  const allowed = ['title', 'description', 'time_horizon', 'target_capabilities',
    'linked_okr_ids', 'status', 'success_criteria', 'health_indicator'];
  const filtered = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) filtered[key] = updates[key];
  }
  filtered.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('strategy_objectives')
    .update(filtered)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`updateObjective failed: ${error.message}`);
  return data;
}

/**
 * List strategy objectives with optional filters.
 * @param {Object} [filters] - { time_horizon, status }
 * @returns {Array} Objectives
 */
export async function listObjectives(filters = {}) {
  let query = supabase
    .from('strategy_objectives')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters.time_horizon) query = query.eq('time_horizon', filters.time_horizon);
  if (filters.status) query = query.eq('status', filters.status);

  const { data, error } = await query;
  if (error) throw new Error(`listObjectives failed: ${error.message}`);
  return data || [];
}

/**
 * Get a single objective with linked OKR details.
 * @param {string} id - Objective UUID
 * @returns {Object} Objective with OKR details
 */
export async function getObjectiveWithOKRs(id) {
  const { data: objective, error } = await supabase
    .from('strategy_objectives')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(`getObjectiveWithOKRs failed: ${error.message}`);

  let okrs = [];
  if (objective.linked_okr_ids && objective.linked_okr_ids.length > 0) {
    const { data: okrData } = await supabase
      .from('okr_objectives')
      .select('id, title, status, progress')
      .in('id', objective.linked_okr_ids);
    okrs = okrData || [];
  }

  return { ...objective, linked_okrs: okrs };
}

/**
 * Calculate health indicator from linked OKR progress.
 * @param {string} id - Objective UUID
 * @returns {Object} { health_indicator, avg_progress }
 */
export async function calculateHealth(id) {
  const obj = await getObjectiveWithOKRs(id);

  if (!obj.linked_okrs || obj.linked_okrs.length === 0) {
    return { health_indicator: 'gray', avg_progress: 0 };
  }

  const avg = obj.linked_okrs.reduce((sum, o) => sum + (o.progress || 0), 0) / obj.linked_okrs.length;
  const indicator = avg >= 70 ? 'green' : avg >= 40 ? 'yellow' : 'red';

  await supabase
    .from('strategy_objectives')
    .update({ health_indicator: indicator, updated_at: new Date().toISOString() })
    .eq('id', id);

  return { health_indicator: indicator, avg_progress: Math.round(avg) };
}
