/**
 * Consensus Engine - Multi-Model Agreement Calculator
 *
 * Evaluates agreement between GPT and Gemini analyses,
 * calculates confidence scores, and determines when
 * follow-up questions are needed.
 *
 * Part of: SD-LEO-FEAT-INTELLIGENT-UAT-FEEDBACK-001
 *
 * @module lib/uat/consensus-engine
 * @version 1.0.0
 */

// Confidence thresholds
const THRESHOLDS = {
  HIGH_CONFIDENCE: 0.85,   // Both models agree on all dimensions
  MEDIUM_CONFIDENCE: 0.7,  // Most dimensions agree
  LOW_CONFIDENCE: 0.5,     // Significant disagreement
  AUTO_ROUTE: 0.8,         // Above this, auto-route without follow-up
  REQUIRE_FOLLOWUP: 0.6    // Below this, always ask follow-up
};

// Weight factors for different classification dimensions
const DIMENSION_WEIGHTS = {
  action: 0.4,      // Most important - determines routing
  severity: 0.3,    // Affects priority
  mode: 0.2,        // Affects follow-up question framing
  scope: 0.1        // LOC estimate variance
};

/**
 * Consensus Engine for multi-model analysis
 */
export class ConsensusEngine {
  constructor(options = {}) {
    this.thresholds = { ...THRESHOLDS, ...options.thresholds };
    this.weights = { ...DIMENSION_WEIGHTS, ...options.weights };
  }

  /**
   * Evaluate consensus for a single issue
   * @param {Object} gptAnalysis - GPT analysis result
   * @param {Object} geminiAnalysis - Gemini analysis result
   * @returns {Object} Consensus evaluation
   */
  evaluate(gptAnalysis, geminiAnalysis) {
    // Handle missing analyses
    if (!gptAnalysis && !geminiAnalysis) {
      return this.createFailedConsensus('Both models failed to analyze');
    }

    if (!gptAnalysis || !geminiAnalysis) {
      return this.createSingleModelConsensus(gptAnalysis || geminiAnalysis, !gptAnalysis ? 'GPT' : 'Gemini');
    }

    // Calculate weighted agreement score
    const agreements = this.calculateAgreements(gptAnalysis, geminiAnalysis);
    const weightedScore = this.calculateWeightedScore(agreements);

    // Determine final values (prefer agreed values, else use GPT as tiebreaker)
    const finalValues = this.determineFinalValues(gptAnalysis, geminiAnalysis, agreements);

    // Determine if follow-up is needed
    const needsFollowUp = this.shouldAskFollowUp(weightedScore, agreements);

    return {
      confidence: weightedScore,
      confidenceLevel: this.getConfidenceLevel(weightedScore),
      agreements,
      finalValues,
      needsFollowUp,
      followUpReason: needsFollowUp ? this.getFollowUpReason(agreements) : null,
      modelComparison: {
        gpt: {
          mode: gptAnalysis.mode,
          severity: gptAnalysis.severity,
          action: gptAnalysis.suggestedAction,
          estimatedLOC: gptAnalysis.estimatedLOC,
          reasoning: gptAnalysis.reasoning
        },
        gemini: {
          mode: geminiAnalysis.mode,
          severity: geminiAnalysis.severity,
          action: geminiAnalysis.suggestedAction,
          estimatedLOC: geminiAnalysis.estimatedLOC,
          reasoning: geminiAnalysis.reasoning
        }
      }
    };
  }

  /**
   * Calculate agreement on each dimension
   */
  calculateAgreements(gpt, gemini) {
    // Action agreement
    const actionAgrees = gpt.suggestedAction === gemini.suggestedAction;

    // Severity agreement (exact or adjacent)
    const severityOrder = ['enhancement', 'minor', 'major', 'critical'];
    const gptSevIdx = severityOrder.indexOf(gpt.severity);
    const geminiSevIdx = severityOrder.indexOf(gemini.severity);
    const severityDiff = Math.abs(gptSevIdx - geminiSevIdx);
    const severityAgrees = severityDiff === 0;
    const severityClose = severityDiff <= 1;

    // Mode agreement
    const modeAgrees = gpt.mode === gemini.mode;

    // Scope agreement (within 50% variance)
    const gptLOC = gpt.estimatedLOC || 50;
    const geminiLOC = gemini.estimatedLOC || 50;
    const locVariance = Math.abs(gptLOC - geminiLOC) / Math.max(gptLOC, geminiLOC);
    const scopeAgrees = locVariance < 0.5;

    return {
      action: { agrees: actionAgrees, gpt: gpt.suggestedAction, gemini: gemini.suggestedAction },
      severity: { agrees: severityAgrees, close: severityClose, gpt: gpt.severity, gemini: gemini.severity },
      mode: { agrees: modeAgrees, gpt: gpt.mode, gemini: gemini.mode },
      scope: { agrees: scopeAgrees, variance: locVariance, gpt: gptLOC, gemini: geminiLOC }
    };
  }

  /**
   * Calculate weighted agreement score
   */
  calculateWeightedScore(agreements) {
    let score = 0;

    // Action weight
    if (agreements.action.agrees) {
      score += this.weights.action;
    }

    // Severity weight (partial credit for close agreement)
    if (agreements.severity.agrees) {
      score += this.weights.severity;
    } else if (agreements.severity.close) {
      score += this.weights.severity * 0.5;
    }

    // Mode weight
    if (agreements.mode.agrees) {
      score += this.weights.mode;
    }

    // Scope weight
    if (agreements.scope.agrees) {
      score += this.weights.scope;
    }

    return score;
  }

  /**
   * Determine final values from both analyses
   */
  determineFinalValues(gpt, gemini, agreements) {
    return {
      // Use agreed value or GPT as tiebreaker
      action: agreements.action.agrees ? gpt.suggestedAction : gpt.suggestedAction,
      severity: agreements.severity.agrees ? gpt.severity : this.resolveSeverity(gpt.severity, gemini.severity),
      mode: agreements.mode.agrees ? gpt.mode : gpt.mode,
      estimatedLOC: agreements.scope.agrees
        ? Math.round((gpt.estimatedLOC + gemini.estimatedLOC) / 2)
        : Math.max(gpt.estimatedLOC || 50, gemini.estimatedLOC || 50), // Conservative: use higher estimate
      riskAreas: [...new Set([...(gpt.riskAreas || []), ...(gemini.riskAreas || [])])]
    };
  }

  /**
   * Resolve severity disagreement (conservative approach)
   */
  resolveSeverity(gptSeverity, geminiSeverity) {
    const severityOrder = ['enhancement', 'minor', 'major', 'critical'];
    const gptIdx = severityOrder.indexOf(gptSeverity);
    const geminiIdx = severityOrder.indexOf(geminiSeverity);

    // Use more severe rating (conservative)
    return severityOrder[Math.max(gptIdx, geminiIdx)];
  }

  /**
   * Determine if follow-up question is needed
   */
  shouldAskFollowUp(confidenceScore, agreements) {
    // Always ask if below threshold
    if (confidenceScore < this.thresholds.REQUIRE_FOLLOWUP) {
      return true;
    }

    // Don't ask if above auto-route threshold
    if (confidenceScore >= this.thresholds.AUTO_ROUTE) {
      return false;
    }

    // Ask if action (the most important dimension) disagrees
    if (!agreements.action.agrees) {
      return true;
    }

    return false;
  }

  /**
   * Get reason for follow-up question
   */
  getFollowUpReason(agreements) {
    const reasons = [];

    if (!agreements.action.agrees) {
      reasons.push(`Action routing differs: GPT suggests ${agreements.action.gpt}, Gemini suggests ${agreements.action.gemini}`);
    }

    if (!agreements.severity.agrees && !agreements.severity.close) {
      reasons.push(`Severity assessment differs significantly: GPT says ${agreements.severity.gpt}, Gemini says ${agreements.severity.gemini}`);
    }

    if (!agreements.scope.agrees) {
      reasons.push(`Scope estimates differ: GPT estimates ${agreements.scope.gpt} LOC, Gemini estimates ${agreements.scope.gemini} LOC`);
    }

    return reasons.length > 0 ? reasons.join('; ') : 'Low overall confidence in classification';
  }

  /**
   * Get confidence level label
   */
  getConfidenceLevel(score) {
    if (score >= this.thresholds.HIGH_CONFIDENCE) return 'high';
    if (score >= this.thresholds.MEDIUM_CONFIDENCE) return 'medium';
    if (score >= this.thresholds.LOW_CONFIDENCE) return 'low';
    return 'very_low';
  }

  /**
   * Create consensus result for single model availability
   */
  createSingleModelConsensus(analysis, missingModel) {
    return {
      confidence: 0.5,
      confidenceLevel: 'low',
      singleModelOnly: true,
      availableModel: missingModel === 'GPT' ? 'Gemini' : 'GPT',
      missingModel,
      finalValues: {
        action: analysis.suggestedAction,
        severity: analysis.severity,
        mode: analysis.mode,
        estimatedLOC: analysis.estimatedLOC,
        riskAreas: analysis.riskAreas || []
      },
      needsFollowUp: true,
      followUpReason: `Only ${missingModel === 'GPT' ? 'Gemini' : 'GPT'} analysis available (${missingModel} failed)`
    };
  }

  /**
   * Create consensus result when both models fail
   */
  createFailedConsensus(reason) {
    return {
      confidence: 0,
      confidenceLevel: 'none',
      failed: true,
      reason,
      needsFollowUp: true,
      followUpReason: reason
    };
  }

  /**
   * Batch evaluate multiple issues
   */
  evaluateBatch(issues) {
    return issues.map(issue => ({
      ...issue,
      consensus: this.evaluate(issue.gptAnalysis, issue.geminiAnalysis)
    }));
  }
}

// Export singleton instance
export const consensusEngine = new ConsensusEngine();

// Export thresholds for customization
export { THRESHOLDS, DIMENSION_WEIGHTS };

export default ConsensusEngine;
