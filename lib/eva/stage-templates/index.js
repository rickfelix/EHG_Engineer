/**
 * Stage Templates - THE TRUTH (Stages 1-5)
 * Part of SD-LEO-FEAT-TMPL-TRUTH-001
 *
 * Registry of all stage templates for Phase 1 of the 25-stage lifecycle.
 *
 * @module lib/eva/stage-templates
 */

export { default as stage01 } from './stage-01.js';
export { default as stage02 } from './stage-02.js';
export { default as stage03, evaluateKillGate as evaluateStage03KillGate } from './stage-03.js';
export { default as stage04 } from './stage-04.js';
export { default as stage05, evaluateKillGate as evaluateStage05KillGate } from './stage-05.js';

import stage01 from './stage-01.js';
import stage02 from './stage-02.js';
import stage03 from './stage-03.js';
import stage04 from './stage-04.js';
import stage05 from './stage-05.js';

/**
 * Get a stage template by stage number (1-5).
 * @param {number} stageNumber
 * @returns {Object|null} Stage template or null if not found
 */
export function getTemplate(stageNumber) {
  const templates = { 1: stage01, 2: stage02, 3: stage03, 4: stage04, 5: stage05 };
  return templates[stageNumber] || null;
}

/**
 * Get all stage templates as an array.
 * @returns {Object[]}
 */
export function getAllTemplates() {
  return [stage01, stage02, stage03, stage04, stage05];
}
