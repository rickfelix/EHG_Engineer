/**
 * SD Workflow Functions
 *
 * Functions for determining and displaying SD workflow recommendations.
 *
 * Extracted from scripts/handoff.js for maintainability.
 * Part of SD-LEO-REFACTOR-HANDOFF-001
 */

import { createClient } from '@supabase/supabase-js';
import { shouldSkipCodeValidation, getValidationRequirements } from '../../../../lib/utils/sd-type-validation.js';
import { WORKFLOW_BY_SD_TYPE } from './workflow-definitions.js';

/**
 * Get SD details and determine workflow
 *
 * @param {string} sdId - SD identifier (UUID, legacy_id, or sd_key)
 * @returns {Promise<Object>} - Workflow info or error
 */
export async function getSDWorkflow(sdId) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  // Support UUID, legacy_id, and sd_key lookups
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, legacy_id, sd_key, title, sd_type, intensity_level, category, current_phase, status')
    .or(`id.eq.${sdId},legacy_id.eq.${sdId},sd_key.eq.${sdId}`)
    .single();

  if (error || !sd) {
    return { error: `SD not found: ${sdId}` };
  }

  // Determine effective SD type
  const skipValidation = shouldSkipCodeValidation(sd);
  const validationReqs = getValidationRequirements(sd);
  const effectiveType = sd.sd_type || (skipValidation ? 'infrastructure' : 'feature');
  let workflow = WORKFLOW_BY_SD_TYPE[effectiveType] || WORKFLOW_BY_SD_TYPE.feature;

  // SD-LEO-PROTOCOL-V435-001 US-005: Activate refactor intensity overrides
  // If refactor type with intensity_level, apply the appropriate overrides
  if (effectiveType === 'refactor' && sd.intensity_level && workflow.intensityOverrides) {
    const intensityLevel = sd.intensity_level.toLowerCase();
    const overrides = workflow.intensityOverrides[intensityLevel];

    if (overrides) {
      // Apply intensity-specific overrides
      workflow = {
        ...workflow,
        required: overrides.required || workflow.required,
        skippedValidation: overrides.skippedValidation || workflow.skippedValidation,
        _intensityApplied: intensityLevel
      };
      console.log(`   Refactor intensity: ${intensityLevel} - workflow adjusted`);
    }
  }

  return {
    sd,
    effectiveType,
    workflow,
    skipValidation,
    validationReason: validationReqs.reason
  };
}

/**
 * Display workflow recommendation
 *
 * @param {Object} workflowInfo - Result from getSDWorkflow
 * @param {string|null} currentHandoff - Current handoff type being executed
 */
export function displayWorkflowRecommendation(workflowInfo, currentHandoff = null) {
  const { sd, effectiveType, workflow, skipValidation, validationReason } = workflowInfo;

  console.log('');
  console.log('SD WORKFLOW RECOMMENDATION');
  console.log('='.repeat(60));
  console.log(`   SD: ${sd.id}`);
  console.log(`   Title: ${sd.title}`);
  console.log(`   Type: ${effectiveType} | Phase: ${sd.current_phase} | Status: ${sd.status}`);
  console.log('');
  console.log(`   ${workflow.name}`);
  console.log(`   ${workflow.description}`);
  console.log('');

  // Show required handoffs
  console.log('   REQUIRED HANDOFFS:');
  workflow.required.forEach((h, i) => {
    const isCurrent = currentHandoff && h === currentHandoff.toUpperCase();
    const marker = isCurrent ? '-> ' : '   ';
    console.log(`   ${marker}${i + 1}. ${h}${isCurrent ? ' <- CURRENT' : ''}`);
  });

  // Show optional handoffs
  if (workflow.optional.length > 0) {
    console.log('');
    console.log('   OPTIONAL HANDOFFS (can be skipped):');
    workflow.optional.forEach(h => {
      console.log(`      * ${h}`);
    });
  }

  // Show skipped validation
  if (workflow.skippedValidation.length > 0) {
    console.log('');
    console.log('   SKIPPED VALIDATION:');
    workflow.skippedValidation.forEach(v => {
      console.log(`      [x] ${v}`);
    });
  }

  // Show note and reason
  if (workflow.note) {
    console.log('');
    console.log(`   Note: ${workflow.note}`);
  }

  if (skipValidation && validationReason) {
    console.log(`   Reason: ${validationReason}`);
  }

  console.log('='.repeat(60));
  console.log('');
}
