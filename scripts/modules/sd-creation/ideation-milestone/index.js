/**
 * EHG Ideation Milestone SD Data Module
 *
 * Exports all SD data for the Ideation Milestone (Stages 1-6).
 * Used by create-ideation-milestone-sds.js
 */

export { visionParentSD } from './vision-parent-sd.js';
export {
  dataFoundationSD,
  agentsFoundationSD,
  patternsFoundationSD
} from './foundation-sds.js';
export {
  stage1SD,
  stage2SD,
  stage3SD,
  stage4SD,
  stage5SD,
  stage6SD
} from './stage-sds.js';

/**
 * Get all SDs in insertion order (respects parent-child hierarchy)
 * @returns {Array<{sd: object, type: string}>}
 */
export function getAllSDs() {
  const { visionParentSD } = require('./vision-parent-sd.js');
  const { dataFoundationSD, agentsFoundationSD, patternsFoundationSD } = require('./foundation-sds.js');
  const { stage1SD, stage2SD, stage3SD, stage4SD, stage5SD, stage6SD } = require('./stage-sds.js');

  return [
    { sd: visionParentSD, type: 'VISION PARENT' },
    { sd: dataFoundationSD, type: 'FOUNDATION (Data)' },
    { sd: agentsFoundationSD, type: 'FOUNDATION (Agents)' },
    { sd: patternsFoundationSD, type: 'FOUNDATION (Patterns)' },
    { sd: stage1SD, type: 'STAGE 1' },
    { sd: stage2SD, type: 'STAGE 2' },
    { sd: stage3SD, type: 'STAGE 3' },
    { sd: stage4SD, type: 'STAGE 4' },
    { sd: stage5SD, type: 'STAGE 5' },
    { sd: stage6SD, type: 'STAGE 6' }
  ];
}

/**
 * SD hierarchy structure for display
 */
export const HIERARCHY_STRUCTURE = `
SD-IDEATION-VISION-001 (PARENT - Critical)
+-- SD-IDEATION-DATA-001 (Foundation - Critical)
|   +-- SD-IDEATION-STAGE1-001 (Stage 1: Enhanced Ideation)
|   \\-- SD-IDEATION-STAGE5-001 (Stage 5: Profitability Forecasting)
+-- SD-IDEATION-AGENTS-001 (Foundation - Critical)
|   +-- SD-IDEATION-STAGE2-001 (Stage 2: AI Review)
|   +-- SD-IDEATION-STAGE3-001 (Stage 3: Comprehensive Validation)
|   \\-- SD-IDEATION-STAGE4-001 (Stage 4: Competitive Intelligence)
\\-- SD-IDEATION-PATTERNS-001 (Foundation - High)
    \\-- SD-IDEATION-STAGE6-001 (Stage 6: Risk Evaluation)
`;

/**
 * Next steps after creation
 */
export const NEXT_STEPS = [
  'Archive existing SDs that conflict with new vision',
  'Create backlog items in sd_backlog_map for each SD',
  'Begin PLAN phase for Layer 1 SDs (DATA + AGENTS)',
  'Transition VISION SD to approved status after review'
];
