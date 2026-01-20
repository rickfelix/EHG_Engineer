/**
 * Gate 3 - Traceability Validators
 * Part of SD-LEO-REFACTOR-VALIDATOR-REG-001
 */

import { validateGate3PlanToLead } from '../../../../traceability-validation.js';

/**
 * Register Gate 3 validators
 * @param {import('../core.js').ValidatorRegistry} registry
 */
export function registerGate3Validators(registry) {
  // Section A: Recommendation Adherence (30 points)
  registry.register('recommendationAdherence', async (context) => {
    const { sd_id, supabase, gate2Results } = context;
    const result = await validateGate3PlanToLead(sd_id, supabase, gate2Results);

    // SD-QUALITY-UI-001 FIX: Check multiple paths for section A score
    const sectionAFromSections = result?.sections?.A || {};
    const sectionAScore = sectionAFromSections.score ??
      result?.gate_scores?.recommendation_adherence ?? 0;

    // Gate 3 Section A is scored out of 30, convert to percentage
    const normalizedScore = result?.gate_scores?.recommendation_adherence !== undefined
      ? Math.round((result.gate_scores.recommendation_adherence / 30) * 100)
      : sectionAScore;
    const passed = result?.passed ?? (normalizedScore >= 70);

    return {
      passed,
      score: normalizedScore,
      max_score: 100,
      issues: sectionAFromSections.issues || result?.issues || [],
      warnings: sectionAFromSections.warnings || result?.warnings || [],
      details: result?.details?.recommendation_adherence || sectionAFromSections
    };
  }, 'Recommendation adherence (CRITICAL)');

  // Section B: Implementation Quality (30 points)
  registry.register('implementationQuality', async (context) => {
    const { sd_id, supabase, gate2Results } = context;
    const result = await validateGate3PlanToLead(sd_id, supabase, gate2Results);

    const sectionBFromSections = result?.sections?.B || {};
    const sectionBScore = sectionBFromSections.score ??
      result?.gate_scores?.implementation_quality ?? 0;

    // Gate 3 Section B is scored out of 30, convert to percentage
    const normalizedScore = result?.gate_scores?.implementation_quality !== undefined
      ? Math.round((result.gate_scores.implementation_quality / 30) * 100)
      : sectionBScore;
    const passed = result?.passed ?? (normalizedScore >= 70);

    return {
      passed,
      score: normalizedScore,
      max_score: 100,
      issues: sectionBFromSections.issues || result?.issues || [],
      warnings: sectionBFromSections.warnings || result?.warnings || [],
      details: result?.details?.implementation_quality || sectionBFromSections
    };
  }, 'Implementation quality (CRITICAL)');

  // Section C: Traceability Mapping (25 points)
  registry.register('traceabilityMapping', async (context) => {
    const { sd_id, supabase, gate2Results } = context;
    const result = await validateGate3PlanToLead(sd_id, supabase, gate2Results);

    const sectionCFromSections = result?.sections?.C || {};
    const sectionCScore = sectionCFromSections.score ??
      result?.gate_scores?.traceability_mapping ?? 0;

    // Gate 3 Section C is scored out of 25, convert to percentage
    const normalizedScore = result?.gate_scores?.traceability_mapping !== undefined
      ? Math.round((result.gate_scores.traceability_mapping / 25) * 100)
      : sectionCScore;
    const passed = result?.passed ?? (normalizedScore >= 70);

    return {
      passed,
      score: normalizedScore,
      max_score: 100,
      issues: sectionCFromSections.issues || result?.issues || [],
      warnings: sectionCFromSections.warnings || result?.warnings || [],
      details: result?.details?.traceability_mapping || sectionCFromSections
    };
  }, 'Traceability mapping');

  // Section D: Sub-Agent Effectiveness (10 points)
  registry.register('subAgentEffectiveness', async (context) => {
    const { sd_id, supabase, gate2Results } = context;
    const result = await validateGate3PlanToLead(sd_id, supabase, gate2Results);

    const sectionDFromSections = result?.sections?.D || {};
    const sectionDScore = sectionDFromSections.score ??
      result?.gate_scores?.sub_agent_effectiveness ?? 0;

    // Gate 3 Section D is scored out of 10, convert to percentage
    const normalizedScore = result?.gate_scores?.sub_agent_effectiveness !== undefined
      ? Math.round((result.gate_scores.sub_agent_effectiveness / 10) * 100)
      : sectionDScore;

    return {
      passed: true, // Non-critical
      score: normalizedScore,
      max_score: 100,
      issues: sectionDFromSections.issues || result?.issues || [],
      warnings: sectionDFromSections.warnings || result?.warnings || [],
      details: result?.details?.sub_agent_effectiveness || sectionDFromSections
    };
  }, 'Sub-agent effectiveness');

  // Section E: Lessons Captured (5 points)
  registry.register('lessonsCaptured', async (context) => {
    const { sd_id, supabase, gate2Results } = context;
    const result = await validateGate3PlanToLead(sd_id, supabase, gate2Results);

    const sectionEFromSections = result?.sections?.E || {};
    const sectionEScore = sectionEFromSections.score ??
      result?.gate_scores?.lessons_captured ?? 0;

    // Gate 3 Section E is scored out of 5, convert to percentage
    const normalizedScore = result?.gate_scores?.lessons_captured !== undefined
      ? Math.round((result.gate_scores.lessons_captured / 5) * 100)
      : sectionEScore;

    return {
      passed: true, // Non-critical
      score: normalizedScore,
      max_score: 100,
      issues: sectionEFromSections.issues || result?.issues || [],
      warnings: sectionEFromSections.warnings || result?.warnings || [],
      details: result?.details?.lessons_captured || sectionEFromSections
    };
  }, 'Lessons captured');
}
