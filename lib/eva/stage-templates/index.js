/**
 * Stage Templates - Phases 1-2 (Stages 1-9)
 * Part of SD-LEO-FEAT-TMPL-TRUTH-001, SD-LEO-FEAT-TMPL-ENGINE-001
 *
 * Registry of all stage templates for the 25-stage venture lifecycle.
 *
 * @module lib/eva/stage-templates
 */

// Phase 1: THE TRUTH (Stages 1-5)
export { default as stage01 } from './stage-01.js';
export { default as stage02 } from './stage-02.js';
export { default as stage03, evaluateKillGate as evaluateStage03KillGate } from './stage-03.js';
export { default as stage04 } from './stage-04.js';
export { default as stage05, evaluateKillGate as evaluateStage05KillGate } from './stage-05.js';

// Phase 2: THE ENGINE (Stages 6-9)
export { default as stage06 } from './stage-06.js';
export { default as stage07 } from './stage-07.js';
export { default as stage08 } from './stage-08.js';
export { default as stage09, evaluateRealityGate } from './stage-09.js';

import stage01 from './stage-01.js';
import stage02 from './stage-02.js';
import stage03 from './stage-03.js';
import stage04 from './stage-04.js';
import stage05 from './stage-05.js';
import stage06 from './stage-06.js';
import stage07 from './stage-07.js';
import stage08 from './stage-08.js';
import stage09 from './stage-09.js';

/**
 * Get a stage template by stage number (1-9).
 * @param {number} stageNumber
 * @returns {Object|null} Stage template or null if not found
 */
export function getTemplate(stageNumber) {
  const templates = {
    1: stage01, 2: stage02, 3: stage03, 4: stage04, 5: stage05,
    6: stage06, 7: stage07, 8: stage08, 9: stage09,
  };
  return templates[stageNumber] || null;
}

/**
 * Get all stage templates as an array.
 * @returns {Object[]}
 */
export function getAllTemplates() {
  return [stage01, stage02, stage03, stage04, stage05, stage06, stage07, stage08, stage09];
}
