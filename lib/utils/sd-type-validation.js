/**
 * SD Type-Aware Validation Utilities
 *
 * Purpose: Provide conditional validation logic based on sd_type
 * to handle documentation-only, infrastructure, and other non-code SDs appropriately.
 *
 * This module bridges the gap between:
 * - sd_type column (already exists in strategic_directives_v2)
 * - Sub-agent orchestration (currently always requires TESTING/GITHUB)
 * - Handoff validation gates (currently code-centric)
 *
 * Pattern: Similar to shouldValidateDesignDatabase() in design-database-gates-validation.js
 *
 * Created: 2025-11-28
 * SD: SD-TECH-DEBT-DOCS-001 (resilience improvement)
 * Issue: PAT-QF-MULTI-001 (documentation-only SD blocked by code-centric validation)
 */

import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';
// Import centralized SD type categories for consistency
import { SD_TYPE_CATEGORIES } from '../../scripts/modules/sd-type-checker.js';

/**
 * SD types that do NOT require code-centric validation
 * These types skip TESTING and GITHUB sub-agents
 * REFACTORED: Now uses centralized SD_TYPE_CATEGORIES.NON_CODE
 */
const NON_CODE_SD_TYPES = SD_TYPE_CATEGORIES.NON_CODE;

/**
 * SD types that require full code validation (TESTING, GITHUB, etc.)
 * REFACTORED: Now uses centralized SD_TYPE_CATEGORIES.CODE_PRODUCING
 */
const CODE_SD_TYPES = SD_TYPE_CATEGORIES.CODE_PRODUCING;

/**
 * Keywords that indicate documentation-only work
 * Used for auto-detection when sd_type is not explicitly set
 */
const DOCUMENTATION_KEYWORDS = [
  'documentation',
  'cleanup',
  'migrate markdown',
  'archive',
  'readme',
  'audit',
  'report',
  'analysis',
  'review docs',
  'consolidate',
  'legacy files'
];

/**
 * Keywords that indicate no code changes expected
 */
const NO_CODE_KEYWORDS = [
  'no code changes',
  'documentation only',
  'verification only',
  'audit only',
  'migration script',  // Scripts that migrate content, not production code
  'cleanup script'
];

/**
 * Check if an SD should skip code-centric validation (TESTING, GITHUB)
 *
 * This is the main entry point for conditional validation.
 * Uses the same pattern as shouldValidateDesignDatabase().
 *
 * @param {Object} sd - Strategic Directive object
 * @returns {boolean} True if code validation should be SKIPPED
 */
export function shouldSkipCodeValidation(sd) {
  if (!sd) return false;

  // Priority 1: Explicit sd_type (most reliable)
  if (sd.sd_type && NON_CODE_SD_TYPES.includes(sd.sd_type)) {
    console.log(`   ℹ️  sd_type='${sd.sd_type}' - skipping code validation`);
    return true;
  }

  // Priority 2: Category-based detection
  const category = (sd.category || '').toLowerCase();

  // Infrastructure category often indicates integration/wiring work that doesn't need traditional code validation
  // Even if sd_type is 'feature', the category is a strong signal
  if (category === 'infrastructure') {
    // Check if sd_type mismatches - this suggests the SD was miscategorized
    if (sd.sd_type && sd.sd_type !== 'infrastructure') {
      console.log(`   ⚠️  Category='infrastructure' but sd_type='${sd.sd_type}' - mismatch detected`);
      console.log('   ℹ️  Using category=\'infrastructure\' as override - skipping code validation');
    } else {
      console.log('   ℹ️  Category=\'infrastructure\' - skipping code validation');
    }
    return true;
  }

  if (category.includes('documentation') || category === 'technical debt') {
    // Technical debt could be either code or docs - check scope
    const scope = (sd.scope || '').toLowerCase();
    if (DOCUMENTATION_KEYWORDS.some(kw => scope.includes(kw))) {
      console.log(`   ℹ️  Category '${sd.category}' with documentation scope - skipping code validation`);
      return true;
    }
  }

  // Priority 3: Scope/description keyword detection
  const scope = (sd.scope || '').toLowerCase();
  const description = (sd.description || '').toLowerCase();
  const title = (sd.title || '').toLowerCase();
  const combinedText = `${title} ${scope} ${description}`;

  if (NO_CODE_KEYWORDS.some(kw => combinedText.includes(kw))) {
    console.log('   ℹ️  Detected "no code changes" keywords - skipping code validation');
    return true;
  }

  // Priority 4: PRD analysis (if metadata available)
  if (sd.prd_metadata) {
    const hasApiSpecs = sd.prd_metadata.api_specifications?.length > 0;
    const hasUiReqs = sd.prd_metadata.ui_ux_requirements?.length > 0;
    const hasDbChanges = sd.prd_metadata.data_model?.tables?.some(t => !t.name?.startsWith('TODO'));

    if (!hasApiSpecs && !hasUiReqs && !hasDbChanges) {
      console.log('   ℹ️  PRD has no code-impacting requirements - skipping code validation');
      return true;
    }
  }

  return false;
}

/**
 * Check if an SD requires code-centric validation (TESTING, GITHUB)
 * Inverse of shouldSkipCodeValidation for clarity
 *
 * @param {Object} sd - Strategic Directive object
 * @returns {boolean} True if code validation IS required
 */
export function requiresCodeValidation(sd) {
  return !shouldSkipCodeValidation(sd);
}

/**
 * Get the validation requirements for an SD based on its type
 *
 * @param {Object} sd - Strategic Directive object
 * @returns {Object} Validation requirements
 */
export function getValidationRequirements(sd) {
  const skipCode = shouldSkipCodeValidation(sd);

  return {
    // Always required
    requiresRetrospective: true,
    requiresDocmon: true,
    requiresStories: true,

    // Conditional based on sd_type
    requiresTesting: !skipCode,
    requiresGithub: !skipCode,
    requiresE2ETests: !skipCode,
    requiresUnitTests: !skipCode,

    // Database validation still required for database SDs
    requiresDatabase: sd.sd_type === 'database' || (sd.scope || '').toLowerCase().includes('schema'),

    // Design validation for feature SDs with UI
    requiresDesign: sd.sd_type === 'feature' && ((sd.scope || '').toLowerCase().includes('ui') ||
                                                  (sd.scope || '').toLowerCase().includes('component')),

    // Metadata
    sd_type: sd.sd_type || 'feature',
    skipCodeValidation: skipCode,
    reason: skipCode
      ? `SD type '${sd.sd_type || 'detected as documentation'}' does not require code validation`
      : `SD type '${sd.sd_type || 'feature'}' requires full code validation`
  };
}

/**
 * Get filtered sub-agent list for PLAN_VERIFY phase based on sd_type
 *
 * @param {Object} sd - Strategic Directive object
 * @returns {string[]} List of required sub-agent codes
 */
export function getPlanVerifySubAgents(sd) {
  const skipCode = shouldSkipCodeValidation(sd);

  if (skipCode) {
    // Documentation-only SDs: Skip TESTING and GITHUB
    return ['DOCMON', 'STORIES'];
  }

  // Full validation for code-impacting SDs
  return ['TESTING', 'GITHUB', 'DOCMON', 'STORIES', 'DATABASE'];
}

/**
 * Auto-detect sd_type based on SD content
 * Returns suggested sd_type if auto-detection is confident
 *
 * @param {Object} sd - Strategic Directive object
 * @returns {Object} { detected: boolean, sd_type: string, confidence: number, reason: string }
 */
export function autoDetectSdType(sd) {
  const title = (sd.title || '').toLowerCase();
  const scope = (sd.scope || '').toLowerCase();
  const category = (sd.category || '').toLowerCase();
  const combinedText = `${title} ${scope} ${category}`;

  // Check for documentation type
  const docKeywordMatches = DOCUMENTATION_KEYWORDS.filter(kw => combinedText.includes(kw));
  if (docKeywordMatches.length >= 2) {
    return {
      detected: true,
      sd_type: 'documentation',
      confidence: Math.min(90, 50 + docKeywordMatches.length * 15),
      reason: `Matched documentation keywords: ${docKeywordMatches.slice(0, 3).join(', ')}`
    };
  }

  // Check for no-code patterns
  const noCodeMatches = NO_CODE_KEYWORDS.filter(kw => combinedText.includes(kw));
  if (noCodeMatches.length > 0) {
    return {
      detected: true,
      sd_type: 'documentation',
      confidence: 85,
      reason: `Matched no-code keywords: ${noCodeMatches.join(', ')}`
    };
  }

  // Check for verification/testing SDs (these are infrastructure, not features)
  // These SDs verify existing implementations rather than build new features
  const verificationKeywords = [
    'integration verification', 'release readiness', 'verification & release',
    'e2e verification', 'smoke test', 'integration test', 'release validation',
    'system verification', 'end-to-end verification', 'qa verification'
  ];
  const verificationMatches = verificationKeywords.filter(kw => combinedText.includes(kw));
  if (verificationMatches.length >= 1) {
    return {
      detected: true,
      sd_type: 'infrastructure',
      confidence: 85,
      reason: `Matched verification/testing keywords: ${verificationMatches.join(', ')} - verification SDs are infrastructure type`
    };
  }

  // Check for infrastructure type
  const infraKeywords = ['ci/cd', 'pipeline', 'workflow', 'tooling', 'protocol', 'script setup'];
  const infraMatches = infraKeywords.filter(kw => combinedText.includes(kw));
  if (infraMatches.length >= 1 && !combinedText.includes('feature')) {
    return {
      detected: true,
      sd_type: 'infrastructure',
      confidence: 70,
      reason: `Matched infrastructure keywords: ${infraMatches.join(', ')}`
    };
  }

  // Check for database type
  if (combinedText.includes('migration') && combinedText.includes('schema')) {
    return {
      detected: true,
      sd_type: 'database',
      confidence: 80,
      reason: 'Contains migration and schema keywords'
    };
  }

  // Check for security type
  if (combinedText.includes('auth') || combinedText.includes('rls') || combinedText.includes('security')) {
    return {
      detected: true,
      sd_type: 'security',
      confidence: 75,
      reason: 'Contains security/auth keywords'
    };
  }

  // Default to feature if no clear detection
  return {
    detected: false,
    sd_type: 'feature',
    confidence: 50,
    reason: 'No clear type indicators - defaulting to feature'
  };
}

/**
 * Validate and optionally update SD's sd_type in database
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} options - { updateIfMismatch: boolean, supabase: Object }
 * @returns {Promise<Object>} Validation result
 */
export async function validateSdType(sdId, options = {}) {
  const supabase = options.supabase || await createSupabaseServiceClient('engineer', { verbose: false });

  // Fetch SD
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', sdId)
    .single();

  if (error || !sd) {
    return {
      valid: false,
      error: `Failed to fetch SD: ${error?.message || 'Not found'}`
    };
  }

  const currentType = sd.sd_type || 'feature';
  const detection = autoDetectSdType(sd);

  const result = {
    sdId,
    currentType,
    detectedType: detection.sd_type,
    confidence: detection.confidence,
    reason: detection.reason,
    mismatch: currentType !== detection.sd_type && detection.confidence >= 70,
    shouldSkipCodeValidation: shouldSkipCodeValidation(sd),
    validationRequirements: getValidationRequirements(sd)
  };

  // Optionally update if mismatch detected
  if (result.mismatch && options.updateIfMismatch && detection.confidence >= 80) {
    console.log(`   ⚠️  SD type mismatch detected: '${currentType}' → '${detection.sd_type}'`);
    console.log(`      Confidence: ${detection.confidence}%`);
    console.log(`      Reason: ${detection.reason}`);

    const { error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update({ sd_type: detection.sd_type })
      .eq('id', sdId);

    if (updateError) {
      result.updateError = updateError.message;
      console.log(`   ❌ Failed to update sd_type: ${updateError.message}`);
    } else {
      result.updated = true;
      console.log(`   ✅ Updated sd_type to '${detection.sd_type}'`);
    }
  }

  return result;
}

/**
 * Log validation mode for an SD
 * Helper for consistent logging across sub-agents
 *
 * @param {string} agentCode - Sub-agent code (e.g., 'TESTING')
 * @param {Object} sd - Strategic Directive object
 * @param {Object} requirements - From getValidationRequirements()
 */
export function logSdTypeValidationMode(agentCode, sd, requirements) {
  const sdType = sd.sd_type || 'feature';
  const skipCode = requirements?.skipCodeValidation || shouldSkipCodeValidation(sd);

  console.log(`\n   📋 SD Type Validation Mode for ${agentCode}:`);
  console.log(`      SD Type: ${sdType}`);
  console.log(`      Skip Code Validation: ${skipCode ? 'YES' : 'NO'}`);

  if (skipCode) {
    console.log(`      Reason: ${requirements?.reason || 'Documentation/infrastructure SD detected'}`);
    console.log('      Action: TESTING/GITHUB validation will be SKIPPED');
  } else {
    console.log('      Action: Full code validation required');
  }
}

// Export all functions
export default {
  shouldSkipCodeValidation,
  requiresCodeValidation,
  getValidationRequirements,
  getPlanVerifySubAgents,
  autoDetectSdType,
  validateSdType,
  logSdTypeValidationMode,
  NON_CODE_SD_TYPES,
  CODE_SD_TYPES
};
