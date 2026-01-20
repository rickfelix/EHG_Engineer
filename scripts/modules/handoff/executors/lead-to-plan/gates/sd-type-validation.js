/**
 * SD Type Validation Gate for LEAD-TO-PLAN
 * Part of SD-LEO-REFACTOR-LEADTOPLAN-001
 *
 * SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-001: Validate SD type during LEAD-TO-PLAN
 * Ensures SD type is explicitly set and matches the work scope
 * Auto-corrects mismatches when confidence is high (>80%)
 */

import { autoDetectSdType } from '../../../../../../lib/utils/sd-type-validation.js';

// Valid SD types (from LEO Protocol)
const VALID_SD_TYPES = [
  'feature', 'infrastructure', 'bugfix', 'database', 'security',
  'refactor', 'documentation', 'orchestrator', 'performance', 'enhancement'
];

/**
 * Validate SD type - ensures sd_type is explicitly set and matches scope
 *
 * This catches common issues like:
 * - sd_type not set (defaults to 'feature' inappropriately)
 * - sd_type mismatch (infrastructure work marked as feature)
 *
 * @param {Object} sd - Strategic Directive
 * @param {Object} supabase - Supabase client
 * @returns {Object} Validation result
 */
export async function validateSdType(sd, supabase) {
  const issues = [];
  const warnings = [];

  const currentType = sd.sd_type;
  console.log(`   Current sd_type: ${currentType || '(not set)'}`);

  // Check if sd_type is set
  if (!currentType) {
    console.log('   ⚠️  sd_type not explicitly set - auto-detecting...');

    // Use auto-detection from sd-type-validation.js
    const detection = autoDetectSdType(sd);

    console.log(`   Detected type: ${detection.sd_type} (${detection.confidence}% confidence)`);
    console.log(`   Reason: ${detection.reason}`);

    if (detection.confidence >= 70) {
      // Auto-set with high confidence
      console.log(`\n   ⚙️  Auto-setting sd_type to: ${detection.sd_type}`);

      const { error } = await supabase
        .from('strategic_directives_v2')
        .update({ sd_type: detection.sd_type })
        .eq('id', sd.id);

      if (error) {
        issues.push(`Could not set sd_type: ${error.message}`);
        return { pass: false, score: 0, issues };
      }

      console.log(`   ✅ sd_type set to: ${detection.sd_type}`);
      return {
        pass: true,
        score: 90,
        issues: [],
        warnings: [`sd_type auto-set to ${detection.sd_type} based on scope analysis`]
      };
    } else {
      // Low confidence - warn but don't auto-set
      warnings.push(`sd_type not set and auto-detection has low confidence (${detection.confidence}%)`);
      warnings.push('Consider explicitly setting sd_type for accurate workflow selection');
      console.log('   ⚠️  Low confidence - defaulting to feature but recommend explicit setting');

      // Default to feature
      const { error } = await supabase
        .from('strategic_directives_v2')
        .update({ sd_type: 'feature' })
        .eq('id', sd.id);

      if (!error) {
        console.log('   ℹ️  Defaulted sd_type to: feature');
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

  // Check for potential mismatch using auto-detection
  const detection = autoDetectSdType(sd);

  if (detection.detected &&
      detection.sd_type !== currentType.toLowerCase() &&
      detection.confidence >= 80) {
    console.log('\n   ⚠️  POTENTIAL MISMATCH DETECTED');
    console.log(`   Current: ${currentType}`);
    console.log(`   Detected: ${detection.sd_type} (${detection.confidence}% confidence)`);
    console.log(`   Reason: ${detection.reason}`);

    // Auto-correct high confidence mismatches
    console.log(`\n   ⚙️  Auto-correcting sd_type to: ${detection.sd_type}`);

    const { error } = await supabase
      .from('strategic_directives_v2')
      .update({ sd_type: detection.sd_type })
      .eq('id', sd.id);

    if (error) {
      warnings.push(`Could not auto-correct sd_type: ${error.message}`);
      console.log(`   ⚠️  Failed to update: ${error.message}`);
    } else {
      console.log(`   ✅ sd_type corrected to: ${detection.sd_type}`);
      return {
        pass: true,
        score: 85,
        issues: [],
        warnings: [`sd_type corrected from ${currentType} to ${detection.sd_type}`]
      };
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
    remediation: 'Set sd_type to match the work scope (feature, infrastructure, bugfix, database, security, refactor, documentation, orchestrator)'
  };
}
