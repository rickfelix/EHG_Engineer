/**
 * Golden Nugget Validator - Stage Configuration Module
 *
 * Loads and manages stages_v2.yaml configuration.
 *
 * @module lib/agents/modules/golden-nugget-validator/stage-config
 */

import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Stages configuration cache
 */
let STAGES_CONFIG = null;
let STAGES_BY_ID = new Map();

/**
 * Load stages_v2.yaml at module load time
 * Parse Golden Nugget requirements for quality validation
 *
 * @returns {boolean} Success status
 */
export function loadStagesConfig() {
  try {
    const yamlPath = path.resolve(__dirname, '../../../../docs/workflow/stages_v2.yaml');
    const yamlContent = fs.readFileSync(yamlPath, 'utf8');
    STAGES_CONFIG = yaml.load(yamlContent);

    // Index stages by ID for fast lookup
    if (STAGES_CONFIG && STAGES_CONFIG.stages) {
      for (const stage of STAGES_CONFIG.stages) {
        STAGES_BY_ID.set(stage.id, stage);
      }
    }

    console.log(`[GoldenNuggetValidator] Loaded stages_v2.yaml: ${STAGES_BY_ID.size} stages indexed`);
    return true;
  } catch (error) {
    console.error(`[GoldenNuggetValidator] Failed to load stages_v2.yaml: ${error.message}`);
    return false;
  }
}

// Load configuration on module initialization
loadStagesConfig();

/**
 * Get stage requirements from stages_v2.yaml
 * Returns required artifacts, gates, and epistemic requirements
 *
 * @param {number} stageId - Stage ID to get requirements for
 * @returns {Object} Stage requirements (artifacts, gates, epistemic)
 */
export function getStageRequirements(stageId) {
  const stage = STAGES_BY_ID.get(stageId);

  if (!stage) {
    console.warn(`   [GoldenNuggetValidator] No stage configuration found for stage ${stageId}`);
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
 * Reload stages configuration from disk
 * Useful for hot-reloading in development or after YAML updates
 *
 * @returns {boolean} Success status
 */
export function reloadStagesConfig() {
  console.log('[GoldenNuggetValidator] Reloading stages_v2.yaml...');
  STAGES_BY_ID.clear();
  return loadStagesConfig();
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
