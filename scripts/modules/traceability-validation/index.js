/**
 * DESIGN->DATABASE Validation Gates - Gate 3 (PLAN->LEAD)
 *
 * REFACTORED: SD-LEO-REFACTOR-TRACEABILITY-001
 * Original 993 LOC monolith refactored into focused modules.
 *
 * Validates end-to-end traceability and recommendation adherence
 * before LEAD final approval.
 *
 * Integration: unified-handoff-system.js (PLAN->LEAD handoff)
 * Created: 2025-10-28
 * Part of: SD-DESIGN-DATABASE-VALIDATION-001
 */

import { calculateAdaptiveThreshold } from '../adaptive-threshold-calculator.js';
import { getPatternStats } from '../pattern-tracking.js';
import { resolveSDContext } from './utils.js';
import { runPreflightChecks } from './preflight/index.js';
import {
  validateRecommendationAdherence,
  validateImplementationQuality,
  validateTraceabilityMapping,
  validateSubAgentEffectiveness,
  validateLessonsCaptured
} from './sections/index.js';

/**
 * Validate end-to-end traceability for PLAN->LEAD handoff
 * Phase-Aware Weighting System (Fidelity Focus)
 *
 * Checks (CRITICAL = 60pts, MAJOR = 25pts, MINOR = 15pts):
 * A. Recommendation Adherence (30 points) - CRITICAL
 * B. Implementation Quality (30 points) - CRITICAL
 * C. Traceability Mapping (25 points) - MAJOR
 * D. Sub-Agent Effectiveness (10 points) - MINOR
 * E. Lessons Captured (5 points) - MINOR
 *
 * Total: 100 points
 *
 * @param {string} sd_id - Strategic Directive ID
 * @param {Object} supabase - Supabase client
 * @param {Object} gate2Results - Results from Gate 2 validation (optional)
 * @returns {Promise<Object>} Validation result
 */
export async function validateGate3PlanToLead(sd_id, supabase, gate2Results = null) {
  console.log('\n GATE 3: End-to-End Traceability Validation (PLAN->LEAD)');
  console.log('='.repeat(60));

  // Resolve SD context (UUID, key, category, type, repo path)
  const { sdUuid, sdKey, sdCategory, sdType, gitRepoPath } = await resolveSDContext(sd_id, supabase);

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

  // Phase 1: Preflight checks
  const { passed: preflightPassed, gate2Data } = await runPreflightChecks(sdUuid, validation, supabase);
  if (!preflightPassed) {
    return validation;
  }

  // Phase 2: Weighted Scoring
  console.log('\n[PHASE 2] Weighted Scoring...');
  console.log('-'.repeat(60));

  try {
    // Fetch PRD metadata (use sdKey for directive_id, which stores sd_key not UUID)
    const { data: prdData, error: prdError } = await supabase
      .from('product_requirements_v2')
      .select('metadata, directive_id, title')
      .eq('directive_id', sdKey)
      .single();

    if (prdError) {
      validation.issues.push(`Failed to fetch PRD: ${prdError.message}`);
      validation.failed_gates.push('PRD_FETCH');
      return validation;
    }

    const designAnalysis = prdData?.metadata?.design_analysis;
    const databaseAnalysis = prdData?.metadata?.database_analysis;

    if (!designAnalysis && !databaseAnalysis) {
      console.log('   [DEBUG] No design/database analysis - returning skip with full section scores');
      validation.warnings.push('No DESIGN or DATABASE analysis found - skipping Gate 3');
      validation.score = 100;
      validation.passed = true;
      // Populate section scores so sub-gate validators get proper skip scores
      validation.gate_scores = {
        recommendation_adherence: 30,
        implementation_quality: 30,
        traceability_mapping: 25,
        sub_agent_effectiveness: 10,
        lessons_captured: 5
      };
      validation.sections = {
        A: { score: 30, max: 30, passed: true },
        B: { score: 30, max: 30, passed: true },
        C: { score: 25, max: 25, passed: true },
        D: { score: 10, max: 10, passed: true },
        E: { score: 5, max: 5, passed: true }
      };
      return validation;
    }

    // Use provided gate2Results or fetched gate2Data
    const effectiveGate2Data = gate2Results || gate2Data;

    // Section A: Recommendation Adherence
    console.log('\n[A] Recommendation Adherence');
    console.log('-'.repeat(60));
    await validateRecommendationAdherence(sd_id, designAnalysis, databaseAnalysis, effectiveGate2Data, validation, supabase, sdCategory, sdType);

    // Section B: Implementation Quality
    console.log('\n[B] Implementation Quality');
    console.log('-'.repeat(60));
    await validateImplementationQuality(sd_id, sdUuid, effectiveGate2Data, validation, supabase);

    // Section C: Traceability Mapping
    console.log('\n[C] Traceability Mapping');
    console.log('-'.repeat(60));
    await validateTraceabilityMapping(sd_id, sdUuid, designAnalysis, databaseAnalysis, validation, supabase, sdCategory, gitRepoPath, sdType);

    // Section D: Sub-Agent Effectiveness
    console.log('\n[D] Sub-Agent Effectiveness');
    console.log('-'.repeat(60));
    await validateSubAgentEffectiveness(sd_id, sdUuid, validation, supabase);

    // Section E: Lessons Captured
    console.log('\n[E] Lessons Captured');
    console.log('-'.repeat(60));
    await validateLessonsCaptured(sd_id, sdUuid, designAnalysis, databaseAnalysis, validation, supabase);

    // Calculate adaptive threshold
    console.log('\n' + '='.repeat(60));
    console.log(`GATE 3 SCORE: ${validation.score}/${validation.max_score} points`);

    const { data: handoffs } = await supabase
      .from('sd_phase_handoffs')
      .select('handoff_type, metadata')
      .eq('sd_id', sdUuid)
      .in('handoff_type', ['PLAN-TO-EXEC', 'EXEC-TO-PLAN'])
      .order('created_at', { ascending: false });

    const priorGateScores = [];
    if (handoffs) {
      const gate1 = handoffs.find(h => h.handoff_type === 'PLAN-TO-EXEC')?.metadata?.gate1_validation?.score;
      const gate2 = handoffs.find(h => h.handoff_type === 'EXEC-TO-PLAN')?.metadata?.gate2_validation?.score;
      if (gate1) priorGateScores.push(gate1);
      if (gate2) priorGateScores.push(gate2);
    }

    const { data: sdData } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sd_id)
      .single();

    const patternStats = await getPatternStats(sdData, supabase);

    const thresholdResult = calculateAdaptiveThreshold({
      sd: sdData,
      priorGateScores,
      patternStats,
      gateNumber: 3
    });

    validation.details.adaptive_threshold = thresholdResult;
    const requiredThreshold = thresholdResult.finalThreshold;

    console.log(`\nAdaptive Threshold: ${requiredThreshold.toFixed(1)}%`);
    console.log(`Reasoning: ${thresholdResult.reasoning}`);

    if (validation.score >= requiredThreshold) {
      validation.passed = true;
      console.log(`OK GATE 3: PASSED (${validation.score} >= ${requiredThreshold.toFixed(1)} points)`);
    } else {
      validation.passed = false;
      console.log(`FAIL GATE 3: FAILED (${validation.score} < ${requiredThreshold.toFixed(1)} points)`);
    }

    if (validation.issues.length > 0) {
      console.log(`\nBlocking Issues (${validation.issues.length}):`);
      validation.issues.forEach(issue => console.log(`  FAIL ${issue}`));
    }

    if (validation.warnings.length > 0) {
      console.log(`\nWarnings (${validation.warnings.length}):`);
      validation.warnings.forEach(warning => console.log(`  WARN ${warning}`));
    }

    console.log('='.repeat(60));

    return validation;

  } catch (error) {
    console.error('\nFAIL GATE 3 Validation Error:', error.message);
    validation.passed = false;
    validation.issues.push(`Validation error: ${error.message}`);
    validation.details.error = error.message;
    return validation;
  }
}

// Re-export utilities and sections for direct access
export * from './utils.js';
export * from './preflight/index.js';
export * from './sections/index.js';
