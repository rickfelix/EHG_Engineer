/**
 * SD Type Detection
 * Auto-detect SD type based on scope, title, and description keywords
 *
 * Extracted from verify-handoff-lead-to-plan.js for modularity
 * SD-LEO-REFACTOR-VERIFY-L2P-001
 */

import { TYPE_PATTERNS } from './constants.js';

/**
 * Auto-detect SD type based on scope, title, and description keywords
 * @param {Object} sd - Strategic Directive data
 * @returns {Object} Detection result with type, confidence, matchedKeywords
 */
export function autoDetectSdType(sd) {
  const text = `${sd.title || ''} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  let bestMatch = { type: 'feature', confidence: 0, matchedKeywords: [] };

  for (const [type, config] of Object.entries(TYPE_PATTERNS)) {
    const matchedKeywords = config.keywords.filter(kw => text.includes(kw));

    if (matchedKeywords.length > 0) {
      // Calculate confidence based on matches and weight
      const baseConfidence = Math.min(matchedKeywords.length / 3, 1);
      const weightedConfidence = baseConfidence * config.weight;

      if (weightedConfidence > bestMatch.confidence) {
        bestMatch = {
          type,
          confidence: Math.min(weightedConfidence, 1),
          matchedKeywords
        };
      }
    }
  }

  // If no strong match, default to feature with low confidence
  if (bestMatch.confidence < 0.3) {
    bestMatch = {
      type: 'feature',
      confidence: 0.3,
      matchedKeywords: ['(default - no strong keyword matches)']
    };
  }

  return bestMatch;
}

/**
 * Get SD type recommendations based on detection
 * @param {string} declaredType - SD's declared type
 * @param {Object} detectedResult - Result from autoDetectSdType
 * @returns {Object} Recommendation with mismatch info
 */
export function getTypeRecommendation(declaredType, detectedResult) {
  const result = {
    declaredType,
    detectedType: detectedResult.type,
    confidence: Math.round(detectedResult.confidence * 100),
    matchedKeywords: detectedResult.matchedKeywords,
    mismatch: false,
    recommendation: null
  };

  if (detectedResult.type !== declaredType && detectedResult.confidence >= 0.70) {
    result.mismatch = true;
    result.recommendation = `Consider changing sd_type from '${declaredType}' to '${detectedResult.type}' based on keyword analysis.`;
  }

  return result;
}

/**
 * Get effective handoffs for a given SD type
 * Used when confidence is low - applies most restrictive handoffs
 * @param {string} sdType - SD type
 * @returns {string[]} Array of required handoffs
 */
export function getEffectiveHandoffs(sdType) {
  const handoffsByType = {
    feature: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL'],
    infrastructure: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL'],
    bugfix: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'LEAD-FINAL-APPROVAL'],
    documentation: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'LEAD-FINAL-APPROVAL'],
    refactor: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL'],
    security: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL'],
    database: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL'],
    performance: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL']
  };

  return handoffsByType[sdType] || handoffsByType.feature;
}

/**
 * Get worst-case (most restrictive) handoffs when confidence is low
 * @returns {string[]} Most restrictive handoff sequence
 */
export function getWorstCaseHandoffs() {
  return ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL'];
}
