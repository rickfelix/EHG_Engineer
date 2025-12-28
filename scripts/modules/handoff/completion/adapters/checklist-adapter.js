/**
 * Checklist Adapter
 *
 * SD-REFACTOR-VERIFY-001 Phase 1: Legacy Adapter
 *
 * Adapts validateExecChecklist callers to CompletionValidator.
 * Preserves existing function signature.
 *
 * @module completion/adapters/checklist-adapter
 */

import { validateCompletion } from '../CompletionValidator.js';
import { executeRule } from '../VerificationRules.js';

/**
 * Adapt legacy validateExecChecklist() to CompletionValidator
 *
 * Legacy interface:
 *   const result = await validateExecChecklist(sdId, prd, supabase, options);
 *
 * This adapter preserves the exact same signature.
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} prd - PRD object from database
 * @param {Object} supabase - Supabase client
 * @param {Object} [options] - Options
 * @returns {Promise<Object>} Result in legacy format
 */
export async function validateExecChecklistLegacy(sdId, prd, supabase, options = {}) {
  const {
    silent = false,
    strictMode = false,
    gracePeriod = true
  } = options;

  // Use the new rule engine for just the checklist rule
  const input = {
    sdId,
    handoffType: 'PLAN-TO-EXEC',
    prd,
    supabase,
    options: {
      silent,
      strictMode,
      gracePeriod
    }
  };

  // Execute just the EXEC_CHECKLIST_VALID rule
  const ruleResult = await executeRule('EXEC_CHECKLIST_VALID', input);

  // Transform to legacy format
  const result = {
    passed: ruleResult.passed,
    score: ruleResult.score,
    max_score: ruleResult.maxScore,
    issues: ruleResult.issues || [],
    warnings: ruleResult.warnings || [],
    details: ruleResult.details || {}
  };

  // Add legacy logging if not silent
  if (!silent) {
    console.log('\n🔍 Exec Checklist Validation (via CompletionValidator)');
    console.log('-'.repeat(50));

    if (result.passed) {
      console.log(`   ✅ Checklist validation passed (${result.score}/${result.max_score})`);
    } else {
      console.log('   ❌ Checklist validation failed');
      result.issues.forEach(i => console.log(`      • ${i}`));
    }

    if (result.warnings.length > 0) {
      result.warnings.forEach(w => console.log(`   ⚠️  ${w}`));
    }
  }

  return result;
}

/**
 * Validate exec checklist with full context
 *
 * For callers that have more context available, this provides
 * a richer validation with cross-referencing.
 *
 * @param {Object} context - Full validation context
 * @returns {Promise<Object>} Enhanced validation result
 */
export async function validateExecChecklistEnhanced(context) {
  const { sdId, prd, userStories, supabase, options = {} } = context;

  // Use full CompletionValidator for enhanced validation
  const result = await validateCompletion({
    sdId,
    handoffType: 'PLAN-TO-EXEC',
    prd,
    userStories,
    supabase,
    options
  });

  // Extract just checklist-related results
  const checklistRule = result.ruleResults.find(r => r.ruleId === 'EXEC_CHECKLIST_VALID');

  return {
    passed: checklistRule?.passed ?? false,
    score: checklistRule?.score ?? 0,
    max_score: checklistRule?.maxScore ?? 10,
    issues: checklistRule?.issues || [],
    warnings: checklistRule?.warnings || [],
    details: {
      ...checklistRule?.details,
      userStoryCount: userStories?.length || 0,
      crossReferenced: true
    }
  };
}

export default {
  validateExecChecklistLegacy,
  validateExecChecklistEnhanced
};
