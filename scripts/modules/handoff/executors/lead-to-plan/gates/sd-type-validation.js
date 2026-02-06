/**
 * SD Type Validation Gate for LEAD-TO-PLAN
 * Part of SD-LEO-REFACTOR-LEADTOPLAN-001
 *
 * SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-001: Validate SD type during LEAD-TO-PLAN
 * SD-LEO-INFRA-RENAME-COLUMNS-SELF-001: Use GPT 5.2 classifier, respect type_locked
 *
 * Ensures SD type is explicitly set and matches the work scope.
 * Uses intelligent GPT 5.2 classifier instead of primitive keyword matching.
 * Respects type_locked flag to prevent unwanted auto-correction.
 */

import { sdTypeClassifier } from '../../../../../../lib/sd/type-classifier.js';
import { autoDetectSdType } from '../../../../../../lib/utils/sd-type-validation.js';

// Valid SD types (from LEO Protocol)
const VALID_SD_TYPES = [
  'feature', 'infrastructure', 'bugfix', 'database', 'security',
  'refactor', 'documentation', 'orchestrator', 'performance', 'enhancement',
  'uat',  // Renamed from qa: UAT campaign/test work
  'library', 'fix' // Added from type-classifier profiles
];

/**
 * Check if SD type is locked (should not be auto-corrected)
 * @param {Object} sd - Strategic Directive
 * @returns {boolean} True if type is locked
 */
function isTypeLocked(sd) {
  const govMeta = sd.governance_metadata;
  if (!govMeta) return false;

  // Check type_locked flag
  if (govMeta.type_locked === true) return true;

  // Also respect automation_context bypass flags
  if (govMeta.automation_context?.bypass_governance === true) return true;

  return false;
}

/**
 * Validate SD type - ensures sd_type is explicitly set and matches scope
 *
 * IMPROVEMENTS (SD-LEO-INFRA-RENAME-COLUMNS-SELF-001):
 * 1. Uses GPT 5.2 classifier (sdTypeClassifier) instead of primitive keywords
 * 2. Respects type_locked flag - never auto-corrects locked types
 * 3. Falls back to keyword matching only when GPT fails
 *
 * @param {Object} sd - Strategic Directive
 * @param {Object} supabase - Supabase client
 * @returns {Object} Validation result
 */
export async function validateSdType(sd, supabase) {
  const issues = [];
  const warnings = [];

  const currentType = sd.sd_type;
  const typeLocked = isTypeLocked(sd);

  console.log(`   Current sd_type: ${currentType || '(not set)'}`);
  if (typeLocked) {
    console.log('   🔒 Type is LOCKED - auto-correction disabled');
  }

  // Check if sd_type is set
  if (!currentType) {
    console.log('   ⚠️  sd_type not explicitly set - classifying with GPT 5.2...');

    // Use GPT 5.2 classifier (preferred) with keyword fallback
    let classification;
    try {
      classification = await sdTypeClassifier.classify(
        sd.title || '',
        sd.description || sd.scope || ''
      );
      console.log(`   🤖 GPT 5.2 Classification: ${classification.recommendedType}`);
      console.log(`      Confidence: ${Math.round(classification.confidence * 100)}%`);
      console.log(`      Source: ${classification.source}`);
      console.log(`      Reasoning: ${classification.reasoning}`);
    } catch (error) {
      console.log(`   ⚠️  GPT classification failed: ${error.message}`);
      // Fall back to keyword detection
      const keywordDetection = autoDetectSdType(sd);
      classification = {
        recommendedType: keywordDetection.sd_type,
        confidence: keywordDetection.confidence / 100,
        source: 'keyword_fallback',
        reasoning: keywordDetection.reason
      };
    }

    if (classification.confidence >= 0.70) {
      // Auto-set with high confidence
      console.log(`\n   ⚙️  Auto-setting sd_type to: ${classification.recommendedType}`);

      const { error } = await supabase
        .from('strategic_directives_v2')
        .update({ sd_type: classification.recommendedType })
        .eq('id', sd.id);

      if (error) {
        issues.push(`Could not set sd_type: ${error.message}`);
        return { pass: false, score: 0, issues };
      }

      console.log(`   ✅ sd_type set to: ${classification.recommendedType}`);
      return {
        pass: true,
        score: 90,
        issues: [],
        warnings: [`sd_type auto-set to ${classification.recommendedType} via ${classification.source}`]
      };
    } else {
      // Low confidence - warn but default to infrastructure (safer than feature)
      warnings.push(`sd_type not set and classification has low confidence (${Math.round(classification.confidence * 100)}%)`);
      warnings.push('Consider explicitly setting sd_type for accurate workflow selection');
      console.log('   ⚠️  Low confidence - defaulting to infrastructure');

      const { error } = await supabase
        .from('strategic_directives_v2')
        .update({ sd_type: 'infrastructure' })
        .eq('id', sd.id);

      if (!error) {
        console.log('   ℹ️  Defaulted sd_type to: infrastructure');
      }

      return {
        pass: true,
        score: 70,
        issues: [],
        warnings
      };
    }
  }

  // Validate current type is in valid list
  if (!VALID_SD_TYPES.includes(currentType.toLowerCase())) {
    issues.push(`Invalid sd_type: '${currentType}'. Valid types: ${VALID_SD_TYPES.join(', ')}`);
    console.log(`   ❌ Invalid sd_type: ${currentType}`);
    return { pass: false, score: 0, issues };
  }

  // If type is locked, skip mismatch detection entirely
  if (typeLocked) {
    console.log(`   ✅ sd_type validated (locked): ${currentType}`);
    return {
      pass: true,
      score: 100,
      issues: [],
      warnings: ['Type is locked - auto-correction skipped']
    };
  }

  // Check for potential mismatch using GPT 5.2 classifier
  let classification;
  try {
    classification = await sdTypeClassifier.classify(
      sd.title || '',
      sd.description || sd.scope || ''
    );
  } catch (_error) {
    // Fall back to keyword detection
    const keywordDetection = autoDetectSdType(sd);
    classification = {
      recommendedType: keywordDetection.sd_type,
      confidence: keywordDetection.confidence / 100,
      source: 'keyword_fallback',
      reasoning: keywordDetection.reason
    };
  }

  // Separate thresholds: warn at 65%, auto-correct at 85%
  // Fix: Previously 85% gated BOTH warning and correction, causing silent misclassifications
  const WARN_THRESHOLD = 0.65;
  const AUTO_CORRECT_THRESHOLD = 0.85;

  if (classification.recommendedType !== currentType.toLowerCase() &&
      classification.confidence >= WARN_THRESHOLD) {
    console.log('\n   ⚠️  POTENTIAL MISMATCH DETECTED');
    console.log(`   Current: ${currentType}`);
    console.log(`   Detected: ${classification.recommendedType} (${Math.round(classification.confidence * 100)}% confidence)`);
    console.log(`   Source: ${classification.source}`);
    console.log(`   Reasoning: ${classification.reasoning}`);

    // Only auto-correct if confidence is very high (85%+) and from GPT
    if (classification.source === 'gpt' && classification.confidence >= AUTO_CORRECT_THRESHOLD) {
      console.log(`\n   ⚙️  Auto-correcting sd_type to: ${classification.recommendedType}`);

      const { error } = await supabase
        .from('strategic_directives_v2')
        .update({ sd_type: classification.recommendedType })
        .eq('id', sd.id);

      if (error) {
        warnings.push(`Could not auto-correct sd_type: ${error.message}`);
        console.log(`   ⚠️  Failed to update: ${error.message}`);
      } else {
        console.log(`   ✅ sd_type corrected to: ${classification.recommendedType}`);
        return {
          pass: true,
          score: 85,
          issues: [],
          warnings: [`sd_type corrected from ${currentType} to ${classification.recommendedType} (GPT 5.2)`]
        };
      }
    } else {
      // Below auto-correct threshold - warn but don't auto-correct
      warnings.push(`Potential type mismatch: current '${currentType}', detected '${classification.recommendedType}' (${Math.round(classification.confidence * 100)}% via ${classification.source}). Review and correct if needed.`);
      console.log(`   ℹ️  Mismatch detected but not auto-correcting (confidence ${Math.round(classification.confidence * 100)}% < ${AUTO_CORRECT_THRESHOLD * 100}% threshold)`);
    }
  }

  console.log(`   ✅ sd_type validated: ${currentType}`);
  return {
    pass: true,
    score: 100,
    issues: [],
    warnings
  };
}

/**
 * Create the SD type validation gate
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate configuration
 */
export function createSdTypeValidationGate(supabase) {
  return {
    name: 'SD_TYPE_VALIDATION',
    validator: async (ctx) => {
      console.log('\n📋 GATE: SD Type Validation');
      console.log('-'.repeat(50));
      return validateSdType(ctx.sd, supabase);
    },
    required: true,
    weight: 0.9,
    remediation: 'Set sd_type to match the work scope (feature, infrastructure, bugfix, database, security, refactor, documentation, orchestrator, uat)'
  };
}
