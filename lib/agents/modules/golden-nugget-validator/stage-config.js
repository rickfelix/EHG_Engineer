/**
 * Golden Nugget Validator - Stage Configuration Module
 *
 * SD-LEO-INFRA-EVA-STAGE-PIPELINE-002E: DB Migration
 * Loads stage configuration from lifecycle_stage_config DB table
 * instead of stages_v2.yaml file.
 *
 * @module lib/agents/modules/golden-nugget-validator/stage-config
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Stages configuration cache
 */
let STAGES_CONFIG = null;
let STAGES_BY_ID = new Map();
let _configLoaded = false;
let _supabaseClient = null;

/**
 * Get or create a Supabase client for DB queries.
 */
function getSupabase(supabase) {
  if (supabase) return supabase;
  if (_supabaseClient) return _supabaseClient;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _supabaseClient = createClient(url, key);
  return _supabaseClient;
}

/**
 * Load stage configuration from lifecycle_stage_config DB table.
 *
 * @param {Object} [supabase] - Optional Supabase client (creates one from env if not provided)
 * @returns {Promise<boolean>} Success status
 */
export async function loadStagesConfig(supabase) {
  const client = getSupabase(supabase);
  if (!client) {
    console.error('[GoldenNuggetValidator] No Supabase client available — cannot load stage config from DB');
    return false;
  }

  try {
    const { data, error } = await client
      .from('lifecycle_stage_config')
      .select('stage_number, stage_name, required_artifacts, metadata')
      .order('stage_number');

    if (error) throw error;
    if (!data || data.length === 0) {
      console.warn('[GoldenNuggetValidator] lifecycle_stage_config returned 0 rows');
      return false;
    }

    // Build config from DB rows
    STAGES_BY_ID.clear();
    const stages = [];
    for (const row of data) {
      const stage = {
        id: row.stage_number,
        title: row.stage_name,
        artifacts: row.required_artifacts || [],
        gates: row.metadata?.gates || {},
        epistemic_classification: row.metadata?.epistemic_classification || {},
        assumption_set: row.metadata?.assumption_set || {},
      };
      stages.push(stage);
      STAGES_BY_ID.set(stage.id, stage);
    }
    STAGES_CONFIG = { stages };
    _configLoaded = true;

    console.log(`[GoldenNuggetValidator] Loaded lifecycle_stage_config: ${STAGES_BY_ID.size} stages indexed`);
    return true;
  } catch (error) {
    console.error(`[GoldenNuggetValidator] Failed to load lifecycle_stage_config: ${error.message}`);
    return false;
  }
}

/**
 * Get stage requirements from lifecycle_stage_config.
 * Returns required artifacts, gates, and epistemic requirements.
 *
 * If config hasn't been loaded yet (lazy init), returns defaults.
 * Call loadStagesConfig() first for DB-backed results.
 *
 * @param {number} stageId - Stage ID to get requirements for
 * @returns {Object} Stage requirements (artifacts, gates, epistemic)
 */
export function getStageRequirements(stageId) {
  const stage = STAGES_BY_ID.get(stageId);

  if (!stage) {
    if (!_configLoaded) {
      console.warn(`   [GoldenNuggetValidator] Config not loaded yet — call loadStagesConfig() first (stage ${stageId})`);
    } else {
      console.warn(`   [GoldenNuggetValidator] No stage configuration found for stage ${stageId}`);
    }
    return {
      required_outputs: [],
      exit_gates: [],
      epistemic_required: false,
      assumption_set_action: null
    };
  }

  return {
    required_outputs: stage.artifacts || [],
    exit_gates: stage.gates?.exit || [],
    epistemic_required: stage.epistemic_classification?.required || false,
    assumption_set_action: stage.assumption_set?.action || null,
    stage_title: stage.title
  };
}

/**
 * Reload stages configuration from DB.
 *
 * @param {Object} [supabase] - Optional Supabase client
 * @returns {Promise<boolean>} Success status
 */
export async function reloadStagesConfig(supabase) {
  console.log('[GoldenNuggetValidator] Reloading lifecycle_stage_config...');
  STAGES_BY_ID.clear();
  _configLoaded = false;
  return loadStagesConfig(supabase);
}

/**
 * Get loaded stages configuration (for debugging/introspection)
 *
 * @returns {Object} Full stages configuration
 */
export function getStagesConfig() {
  return STAGES_CONFIG;
}

/**
 * Get all indexed stages (for debugging/introspection)
 *
 * @returns {Map} Stages indexed by ID
 */
export function getStagesById() {
  return STAGES_BY_ID;
}
