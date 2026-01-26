/**
 * SD Type Guard - Pre-Update Validation for Strategic Directive Types
 *
 * PURPOSE: Prevent sd_type misclassification by running AI classification
 * BEFORE the type is committed to the database.
 *
 * ROOT CAUSE FIX: This addresses the issue where SD-REFACTOR-SCRIPTS-001
 * was incorrectly set to 'infrastructure' when it should have been 'refactor'.
 * The AI classifier existed but only ran during handoff validation (too late).
 *
 * WHEN THIS RUNS: Before any SD update that changes sd_type
 *
 * ENFORCEMENT: If AI detects mismatch with >80% confidence:
 *   - Log warning with detailed reasoning
 *   - Return corrected type for caller to use
 *   - Store classification metadata for audit trail
 *
 * @module sd-type-guard
 * @version 1.0.0 - LEO v4.3.3 Root Cause Fix
 */

import { SDTypeClassifier } from '../../scripts/modules/sd-type-classifier.js';
import { detectIntensityForSD } from '../../scripts/modules/intensity-detector.js';
import { getSupabaseClient } from '../factories/client-factory.js';

// Mismatch confidence threshold - above this, we override the declared type
const MISMATCH_CONFIDENCE_THRESHOLD = 80;

// High confidence threshold - above this, we auto-correct without warning
const AUTO_CORRECT_THRESHOLD = 90;

/**
 * Validate and potentially correct SD type before database update
 *
 * @param {Object} sd - Strategic Directive data
 * @param {string} sd.title - SD title
 * @param {string} sd.description - SD description
 * @param {string} sd.scope - SD scope
 * @param {string} declaredType - The sd_type being set
 * @param {Object} options - Options
 * @param {boolean} options.enforceCorrection - If true, returns corrected type; if false, just warns
 * @param {boolean} options.requireIntensity - If true and type is 'refactor', also detect intensity
 * @returns {Promise<Object>} Validation result with correctedType, intensity, and metadata
 */
export async function validateSDType(sd, declaredType, options = {}) {
  const { enforceCorrection = true, requireIntensity = true } = options;

  const classifier = new SDTypeClassifier();

  console.log(`\n🔍 SD TYPE GUARD: Validating sd_type='${declaredType}'`);
  console.log(`   Title: ${sd.title}`);

  // Run AI classification
  const classification = await classifier.classify({
    title: sd.title,
    description: sd.description,
    scope: sd.scope,
    sd_type: declaredType
  });

  const result = {
    declaredType,
    detectedType: classification.detectedType,
    confidence: classification.confidence,
    reasoning: classification.reasoning,
    mismatch: false,
    correctedType: declaredType,
    intensity: null,
    metadata: {
      validated_at: new Date().toISOString(),
      classifier_version: '1.0.0',
      classification
    }
  };

  // Check for mismatch
  if (classification.detectedType !== declaredType) {
    result.mismatch = true;

    if (classification.confidence >= AUTO_CORRECT_THRESHOLD) {
      // High confidence - auto-correct
      console.log('\n⚠️  SD TYPE MISMATCH DETECTED (AUTO-CORRECTING)');
      console.log(`   Declared: ${declaredType}`);
      console.log(`   Detected: ${classification.detectedType} (${classification.confidence}% confidence)`);
      console.log(`   Reason: ${classification.reasoning}`);
      console.log(`   Action: Auto-correcting to '${classification.detectedType}'`);

      if (enforceCorrection) {
        result.correctedType = classification.detectedType;
      }
    } else if (classification.confidence >= MISMATCH_CONFIDENCE_THRESHOLD) {
      // Medium-high confidence - warn and suggest
      console.log('\n⚠️  SD TYPE MISMATCH WARNING');
      console.log(`   Declared: ${declaredType}`);
      console.log(`   Detected: ${classification.detectedType} (${classification.confidence}% confidence)`);
      console.log(`   Reason: ${classification.reasoning}`);
      console.log(`   Suggestion: Consider using '${classification.detectedType}' instead`);

      if (enforceCorrection) {
        result.correctedType = classification.detectedType;
      }
    } else {
      // Low confidence - just log
      console.log(`   ℹ️  AI detected '${classification.detectedType}' but confidence (${classification.confidence}%) below threshold`);
    }
  } else {
    console.log(`   ✅ SD type '${declaredType}' validated (${classification.confidence}% confidence)`);
  }

  // If final type is 'refactor', detect intensity
  const finalType = result.correctedType;
  if (finalType === 'refactor' && requireIntensity) {
    console.log('\n📊 Detecting refactoring intensity...');

    const intensityResult = await detectIntensityForSD({
      title: sd.title,
      description: sd.description,
      scope: sd.scope
    });

    result.intensity = {
      level: intensityResult.suggestedIntensity,
      confidence: intensityResult.confidence,
      keywords: intensityResult.keywords,
      reasoning: intensityResult.reasoning
    };

    console.log(`   Intensity: ${result.intensity.level} (${result.intensity.confidence}% confidence)`);
    console.log(`   Keywords: ${result.intensity.keywords.join(', ')}`);
  }

  return result;
}

/**
 * Update SD with validated type and store classification metadata
 *
 * @param {string} sdId - SD sd_key (e.g., 'SD-REFACTOR-SCRIPTS-001')
 * @param {string} newType - The sd_type to set
 * @param {Object} options - Options
 * @returns {Promise<Object>} Update result
 */
export async function updateSDTypeWithValidation(sdId, newType, options = {}) {
  const supabase = await getSupabaseClient();

  // SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-002: Use sd_key instead of legacy_id (column dropped 2026-01-24)
  // Fetch current SD data
  const { data: sd, error: fetchError } = await supabase
    .from('strategic_directives_v2')
    .select('title, description, scope, sd_type, intensity_level')
    .eq('sd_key', sdId)
    .single();

  if (fetchError || !sd) {
    throw new Error(`Failed to fetch SD ${sdId}: ${fetchError?.message}`);
  }

  // Validate the new type
  const validation = await validateSDType(sd, newType, options);

  // Prepare update data
  const updateData = {
    sd_type: validation.correctedType,
    metadata: {
      ...(sd.metadata || {}),
      type_classification: validation.metadata
    }
  };

  // Add intensity if detected
  if (validation.intensity) {
    updateData.intensity_level = validation.intensity.level;
  }

  // SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-002: Use sd_key instead of legacy_id (column dropped 2026-01-24)
  // Update SD
  const { data: updated, error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update(updateData)
    .eq('sd_key', sdId)
    .select('sd_key, sd_type, intensity_level');

  if (updateError) {
    throw new Error(`Failed to update SD ${sdId}: ${updateError.message}`);
  }

  console.log(`\n✅ SD ${sdId} updated:`);
  console.log(`   sd_type: ${updated[0].sd_type}`);
  if (updated[0].intensity_level) {
    console.log(`   intensity_level: ${updated[0].intensity_level}`);
  }

  return {
    sd: updated[0],
    validation
  };
}

/**
 * Batch validate all SDs with potential type mismatches
 * Useful for auditing existing SDs
 *
 * @param {Object} options - Options
 * @param {boolean} options.dryRun - If true, don't update, just report
 * @returns {Promise<Array>} Array of mismatches found
 */
export async function auditSDTypes(options = {}) {
  const { dryRun = true } = options;
  const supabase = await getSupabaseClient();

  console.log(`\n📋 SD TYPE AUDIT ${dryRun ? '(DRY RUN)' : ''}`);
  console.log('='.repeat(60));

  // SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-002: Use sd_key instead of legacy_id (column dropped 2026-01-24)
  // Fetch all active SDs with types that could be misclassified
  const { data: sds, error } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, description, scope, sd_type, intensity_level')
    .in('status', ['draft', 'active', 'in_progress'])
    .not('sd_type', 'is', null);

  if (error) {
    throw new Error(`Failed to fetch SDs: ${error.message}`);
  }

  console.log(`Found ${sds.length} SDs to audit\n`);

  const mismatches = [];
  const classifier = new SDTypeClassifier();

  for (const sd of sds) {
    const classification = await classifier.classify(sd);

    if (classification.detectedType !== sd.sd_type &&
        classification.confidence >= MISMATCH_CONFIDENCE_THRESHOLD) {

      // SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-002: Use sd_key instead of legacy_id (column dropped 2026-01-24)
      mismatches.push({
        sdId: sd.sd_key,
        title: sd.title,
        declaredType: sd.sd_type,
        detectedType: classification.detectedType,
        confidence: classification.confidence,
        reasoning: classification.reasoning
      });

      console.log(`⚠️  ${sd.sd_key}`);
      console.log(`   Declared: ${sd.sd_type} → Detected: ${classification.detectedType} (${classification.confidence}%)`);

      if (!dryRun) {
        await updateSDTypeWithValidation(sd.sd_key, classification.detectedType);
      }
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Audit complete: ${mismatches.length} mismatches found`);

  return mismatches;
}

export default {
  validateSDType,
  updateSDTypeWithValidation,
  auditSDTypes,
  MISMATCH_CONFIDENCE_THRESHOLD,
  AUTO_CORRECT_THRESHOLD
};
