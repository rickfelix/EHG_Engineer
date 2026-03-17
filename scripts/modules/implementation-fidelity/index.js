/**
 * Implementation Fidelity Validation Module
 * Part of SD-LEO-REFACTOR-IMPL-FIDELITY-001
 *
 * DESIGN→DATABASE Validation Gates - Gate 2 (EXEC→PLAN)
 * Validates that EXEC actually implemented the DESIGN and DATABASE recommendations
 * before PLAN verification begins.
 *
 * Refactored from 1,559 LOC monolithic file into focused modules.
 */

import { calculateAdaptiveThreshold, checkGatePassed, YELLOW_BAND_WIDTH } from '../adaptive-threshold-calculator.js';
import { getPatternStats } from '../pattern-tracking.js';
import {
  shouldSkipCodeValidation,
  getValidationRequirements
} from '../../../lib/utils/sd-type-validation.js';
// SD-LEO-FIX-COMPLETION-WORKFLOW-001: Use centralized SD type policy
import { isLightweightSDType } from '../handoff/validation/sd-type-applicability-policy.js';

import { runPreflightChecks } from './preflight/index.js';
import {
  validateDesignFidelity,
  validateDatabaseFidelity,
  validateDataFlowAlignment,
  validateEnhancedTesting
} from './sections/index.js';

/**
 * Validate implementation fidelity for EXEC→PLAN handoff
 * Phase-Aware Weighting System (Correctness Focus)
 *
 * Checks:
 * A. Design Implementation Fidelity (20 points) - MAJOR
 * B. Database Implementation Fidelity (35 points) - CRITICAL
 * C. Data Flow Alignment (20 points) - MAJOR
 * D. Enhanced Testing (25 points) - CRITICAL
 *
 * Total: 100 points
 *
 * @param {string} sd_id - Strategic Directive ID
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Object>} Validation result
 */
export async function validateGate2ExecToPlan(sd_id, supabase, options = {}) {
  console.log('\n🚪 GATE 2: Implementation Fidelity Validation (EXEC→PLAN)');
  console.log('='.repeat(60));

  const validation = {
    passed: true,
    score: 0,
    max_score: 100,
    issues: [],
    warnings: [],
    details: {},
    failed_gates: [],
    gate_scores: {}
  };

  // Check if this is a documentation-only SD
  // SD-LEO-FIX-GATE-QUERY-DEDUPLICATION-001: Use pre-fetched SD when available
  try {
    const sd = options.prefetched?.sd || (await supabase
      .from('strategic_directives_v2')
      .select('id, title, sd_type, scope, category')
      .eq('id', sd_id)
      .single()).data;

    if (sd && shouldSkipCodeValidation(sd)) {
      const validationReqs = getValidationRequirements(sd);
      console.log(`\n   ✅ DOCUMENTATION-ONLY SD DETECTED (sd_type=${sd.sd_type || 'detected'})`);
      console.log(`      Reason: ${validationReqs.reason}`);
      console.log('      SKIPPING implementation fidelity validation\n');

      validation.passed = true;
      validation.score = 100;
      validation.details.sd_type_bypass = {
        sd_type: sd.sd_type,
        reason: 'Documentation-only SD - no code implementation to validate',
        skipped_checks: ['testing', 'server_restart', 'code_quality', 'design_fidelity', 'database_fidelity']
      };
      validation.warnings.push('Gate 2 validation skipped for documentation-only SD');

      const bypassSection = {
        score: 100,
        passed: true,
        issues: [],
        warnings: [`Skipped for ${sd.sd_type} SD`]
      };
      validation.sections = {
        A: bypassSection,
        B: bypassSection,
        C: bypassSection,
        D: bypassSection
      };
      validation.sectionScores = {
        A: bypassSection,
        B: bypassSection,
        C: bypassSection,
        D: bypassSection
      };

      return validation;
    }
  } catch (error) {
    console.log(`   ⚠️  Could not check sd_type: ${error.message}`);
  }

  // Resolve SD ID and check for special modes
  // SD-LEO-FIX-COMPLETION-WORKFLOW-001: Fixed SD lookup to not use deprecated legacy_id
  let resolvedSdUuid = sd_id;
  try {
    // SD-LEO-FIX-GATE-QUERY-DEDUPLICATION-001: Use pre-fetched SD when available
    let sd = options.prefetched?.sd || null;

    if (!sd) {
      // Try direct ID lookup first (works for both UUID and SD-KEY format IDs)
      const result = await supabase
        .from('strategic_directives_v2')
        .select('id, title, sd_type, scope, category, intensity_level, target_application')
        .eq('id', sd_id)
        .single();
      sd = result.data;
    }
    if (sd?.id) {
      resolvedSdUuid = sd.id;
    }

    const sdType = (sd?.sd_type || '').toLowerCase();
    const intensityLevel = (sd?.intensity_level || '').toLowerCase();
    validation.details.sd_type = sdType;
    validation.details.target_application = sd?.target_application || '';

    console.log(`   🔍 SD Type check: sd_type=${sdType}, intensity_level=${intensityLevel}, target=${sd?.target_application || 'unknown'}`);

    // Fetch Gate 2 exempt sections
    try {
      const { data: typeProfile } = await supabase
        .from('sd_type_validation_profiles')
        .select('gate2_exempt_sections')
        .eq('sd_type', sdType)
        .single();

      if (typeProfile?.gate2_exempt_sections?.length > 0) {
        validation.details.gate2_exempt_sections = typeProfile.gate2_exempt_sections;
        console.log(`   📋 Gate 2 exempt sections for ${sdType}: ${typeProfile.gate2_exempt_sections.join(', ')}`);
      }
    } catch (_e) {
      // No exemptions configured
    }

    // Set special modes
    if (sdType === 'frontend') {
      console.log(`\n   ℹ️  FRONTEND SD DETECTED (sd_type=${sdType})`);
      validation.details.frontend_mode = true;
    }

    // SD-LEO-FIX-COMPLETION-WORKFLOW-001: Use centralized SD type policy for lightweight SDs
    if (isLightweightSDType(sdType)) {
      console.log(`\n   ℹ️  LIGHTWEIGHT SD DETECTED (sd_type=${sdType})`);
      validation.details.bugfix_mode = true;  // Reuse bugfix_mode to skip server validation
      validation.details.lightweight_sd = true;
      validation.details.testing_requirement = 'relaxed';
    } else if (sdType === 'refactor' && intensityLevel === 'cosmetic') {
      console.log(`\n   ℹ️  COSMETIC REFACTOR SD DETECTED (intensity=${intensityLevel})`);
      validation.details.cosmetic_refactor_mode = true;
      validation.details.testing_requirement = 'unit_tests_only';
    }
  } catch (_error) {
    // Continue with standard validation
  }

  // Run preflight checks
  const preflightPassed = await runPreflightChecks(sd_id, validation, supabase);
  if (!preflightPassed) {
    return validation;
  }

  // Phase 2: Weighted Scoring
  console.log('\n[PHASE 2] Weighted Scoring...');
  console.log('-'.repeat(60));

  try {
    // Fetch PRD metadata
    // SD-LEO-FIX-GATE-QUERY-DEDUPLICATION-001: Use pre-fetched PRD when available
    let prdData = options.prefetched?.prd || null;
    let prdError = null;
    if (!prdData) {
      // SD-LEO-FIX-PRD-FETCH-001: Use sd_id column (UUID) instead of directive_id (SD key string)
      ({ data: prdData, error: prdError } = await supabase
        .from('product_requirements_v2')
        .select('metadata, directive_id, sd_id, title')
        .eq('sd_id', resolvedSdUuid)
        .single());
    }

    if (prdError) {
      console.log(`   ⚠️  PRD fetch error: ${prdError.message}`);
      validation.issues.push(`Failed to fetch PRD: ${prdError.message}`);
      validation.failed_gates.push('PRD_FETCH');
      validation.passed = false;
      return validation;
    }

    const designAnalysis = prdData?.metadata?.design_analysis;
    const databaseAnalysis = prdData?.metadata?.database_analysis;

    if (!designAnalysis && !databaseAnalysis) {
      validation.warnings.push('No DESIGN or DATABASE analysis found - skipping Gate 2');
      validation.score = 100;
      validation.passed = true;
      return validation;
    }

    // Section A: Design Implementation Fidelity
    console.log('\n[A] Design Implementation Fidelity');
    console.log('-'.repeat(60));
    await validateDesignFidelity(sd_id, designAnalysis, validation, supabase);

    // Section B: Database Implementation Fidelity
    console.log('\n[B] Database Implementation Fidelity');
    console.log('-'.repeat(60));
    await validateDatabaseFidelity(sd_id, databaseAnalysis, validation, supabase);

    // Section C: Data Flow Alignment
    console.log('\n[C] Data Flow Alignment');
    console.log('-'.repeat(60));
    await validateDataFlowAlignment(sd_id, designAnalysis, databaseAnalysis, validation, supabase);

    // Section D: Enhanced Testing
    console.log('\n[D] Enhanced Testing');
    console.log('-'.repeat(60));
    await validateEnhancedTesting(sd_id, designAnalysis, databaseAnalysis, validation, supabase);

    // Calculate adaptive threshold
    console.log('\n' + '='.repeat(60));
    console.log(`GATE 2 SCORE: ${validation.score}/${validation.max_score} points`);

    // SD-LEO-FIX-GATE-QUERY-DEDUPLICATION-001: Use pre-fetched handoff/SD data when available
    let gate1Handoff;
    const handoffHistory = options.prefetched?.handoffHistory;
    if (handoffHistory) {
      gate1Handoff = handoffHistory.find(h => h.handoff_type === 'PLAN-TO-EXEC') || null;
    } else {
      const { data } = await supabase
        .from('sd_phase_handoffs')
        .select('metadata')
        .eq('sd_id', sd_id)
        .eq('handoff_type', 'PLAN-TO-EXEC')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      gate1Handoff = data;
    }

    const priorGateScores = gate1Handoff?.metadata?.gate1_validation?.score
      ? [gate1Handoff.metadata.gate1_validation.score]
      : [];

    const sdData = options.prefetched?.sd || (await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sd_id)
      .single()).data;

    const patternStats = await getPatternStats(sdData, supabase);

    const thresholdResult = calculateAdaptiveThreshold({
      sd: sdData,
      priorGateScores,
      patternStats,
      gateNumber: 2
    });

    validation.details.adaptive_threshold = thresholdResult;
    const requiredThreshold = thresholdResult.finalThreshold;

    console.log(`\nAdaptive Threshold: ${requiredThreshold.toFixed(1)}%`);
    console.log(`Reasoning: ${thresholdResult.reasoning}`);

    const gateResult = checkGatePassed(validation.score, thresholdResult);
    validation.passed = gateResult.passed;
    validation.zone = gateResult.zone;

    if (gateResult.zone === 'GREEN') {
      console.log(`✅ GATE 2: PASSED (${validation.score} >= ${requiredThreshold.toFixed(1)} | GREEN)`);
    } else if (gateResult.zone === 'YELLOW') {
      console.log(`🟡 GATE 2: PASSED (${validation.score} >= ${gateResult.yellowThreshold} | YELLOW — within ${YELLOW_BAND_WIDTH}pt tolerance of ${requiredThreshold.toFixed(1)})`);
      validation.warnings.push(`Score ${validation.score} is in YELLOW zone (${gateResult.yellowThreshold}-${requiredThreshold.toFixed(0)}). Passed with advisory.`);
    } else {
      console.log(`🔴 GATE 2: FAILED (${validation.score} < ${gateResult.yellowThreshold} | RED)`);
    }

    if (validation.issues.length > 0) {
      console.log(`\nBlocking Issues (${validation.issues.length}):`);
      validation.issues.forEach(issue => console.log(`  ❌ ${issue}`));
    }

    if (validation.warnings.length > 0) {
      console.log(`\nWarnings (${validation.warnings.length}):`);
      validation.warnings.forEach(warning => console.log(`  ⚠️  ${warning}`));
    }

    console.log('='.repeat(60));

    return validation;

  } catch (error) {
    console.error('\n❌ GATE 2 Validation Error:', error.message);
    validation.passed = false;
    validation.issues.push(`Validation error: ${error.message}`);
    validation.details.error = error.message;
    return validation;
  }
}

// Re-export all modules for direct access
export * from './utils/index.js';
export * from './preflight/index.js';
export * from './sections/index.js';
