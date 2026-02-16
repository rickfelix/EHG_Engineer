/**
 * EVA Autonomy Model — L0-L4 venture autonomy levels
 *
 * Defines autonomy levels, gate behavior matrix, and the pre-check
 * used by the orchestrator before each gate evaluation.
 *
 * @module autonomy-model
 * @version 1.0.0
 */

import { createLogger } from '../logger.js';

const log = createLogger('AutonomyModel');

// ── Level definitions ──────────────────────────────────────
export const AUTONOMY_LEVELS = {
  L0: { level: 'L0', name: 'Manual',          description: 'All gates require chairman approval' },
  L1: { level: 'L1', name: 'Guided',          description: 'Stage gates auto-approve; reality gates manual' },
  L2: { level: 'L2', name: 'Supervised',       description: 'All gates auto-approve; chairman notified' },
  L3: { level: 'L3', name: 'Autonomous',       description: 'All gates auto-approve; chairman notified on exceptions only' },
  L4: { level: 'L4', name: 'Full Autonomy',    description: 'All gates auto-approve; no notifications' },
};

export const LEVEL_ORDER = ['L0', 'L1', 'L2', 'L3', 'L4'];

// ── Gate behavior matrix ───────────────────────────────────
// Maps (level, gate_type) → action
//   manual       = chairman must approve (existing behavior)
//   auto_approve = gate passes automatically
//   skip         = gate is not evaluated at all
export const GATE_BEHAVIOR_MATRIX = {
  L0: { stage_gate: 'manual',       reality_gate: 'manual',       devils_advocate: 'manual' },
  L1: { stage_gate: 'auto_approve', reality_gate: 'manual',       devils_advocate: 'manual' },
  L2: { stage_gate: 'auto_approve', reality_gate: 'auto_approve', devils_advocate: 'auto_approve' },
  L3: { stage_gate: 'auto_approve', reality_gate: 'auto_approve', devils_advocate: 'skip' },
  L4: { stage_gate: 'auto_approve', reality_gate: 'auto_approve', devils_advocate: 'skip' },
};

/**
 * Check autonomy level for a venture and determine gate action.
 *
 * @param {string} ventureId
 * @param {string} gateType - 'stage_gate' | 'reality_gate' | 'devils_advocate'
 * @param {object} deps - { supabase }
 * @returns {Promise<{action: string, level: string, reason: string}>}
 */
export async function checkAutonomy(ventureId, gateType, { supabase }) {
  const { data, error } = await supabase
    .from('eva_ventures')
    .select('autonomy_level')
    .eq('id', ventureId)
    .single();

  if (error || !data) {
    log.warn('Could not fetch autonomy level, defaulting to L0', { ventureId, error: error?.message });
    return { action: 'manual', level: 'L0', reason: 'Autonomy level not found — defaulting to L0' };
  }

  const level = data.autonomy_level || 'L0';
  const matrix = GATE_BEHAVIOR_MATRIX[level];
  if (!matrix) {
    log.warn('Unknown autonomy level, defaulting to L0', { ventureId, level });
    return { action: 'manual', level: 'L0', reason: `Unknown autonomy level ${level}` };
  }

  const action = matrix[gateType] || 'manual';
  log.info('Autonomy check', { ventureId, autonomyLevel: level, gateType, action });
  return { action, level, reason: `${AUTONOMY_LEVELS[level]?.name} (${level}): ${gateType} → ${action}` };
}

/**
 * Check if a chairman override exists for this venture's autonomy level.
 *
 * @param {string} ventureId
 * @param {object} deps - { chairmanPreferenceStore }
 * @returns {Promise<string|null>} Override level or null
 */
export async function getAutonomyOverride(ventureId, { chairmanPreferenceStore }) {
  if (!chairmanPreferenceStore) return null;
  try {
    const pref = await chairmanPreferenceStore.getPreference(ventureId, 'autonomy_override');
    if (pref && LEVEL_ORDER.includes(pref.value)) {
      log.info('Chairman autonomy override active', { ventureId, override: pref.value });
      return pref.value;
    }
  } catch {
    // No override set — normal path
  }
  return null;
}

/**
 * Full autonomy pre-check: resolves override → venture level → gate action.
 *
 * @param {string} ventureId
 * @param {string} gateType
 * @param {object} deps - { supabase, chairmanPreferenceStore? }
 * @returns {Promise<{action: string, level: string, reason: string, overridden: boolean}>}
 */
export async function autonomyPreCheck(ventureId, gateType, deps) {
  const override = await getAutonomyOverride(ventureId, deps);
  if (override) {
    const matrix = GATE_BEHAVIOR_MATRIX[override];
    const action = matrix?.[gateType] || 'manual';
    return {
      action,
      level: override,
      reason: `Chairman override (${override}): ${gateType} → ${action}`,
      overridden: true,
    };
  }
  const result = await checkAutonomy(ventureId, gateType, deps);
  return { ...result, overridden: false };
}

/**
 * Validate a level transition (can only go up/down by 1).
 *
 * @param {string} currentLevel
 * @param {string} targetLevel
 * @returns {{valid: boolean, reason?: string}}
 */
export function validateLevelTransition(currentLevel, targetLevel) {
  const currentIdx = LEVEL_ORDER.indexOf(currentLevel);
  const targetIdx = LEVEL_ORDER.indexOf(targetLevel);
  if (currentIdx === -1) return { valid: false, reason: `Unknown current level: ${currentLevel}` };
  if (targetIdx === -1) return { valid: false, reason: `Unknown target level: ${targetLevel}` };
  const diff = Math.abs(targetIdx - currentIdx);
  if (diff !== 1) return { valid: false, reason: `Can only change by 1 level at a time (${currentLevel} → ${targetLevel} is ${diff} levels)` };
  return { valid: true };
}

export const MODULE_VERSION = '1.0.0';
