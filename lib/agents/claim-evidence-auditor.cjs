/**
 * Claim/Evidence Auditor
 *
 * Anti-Hallucination Safeguard System
 *
 * Validates agent output by checking:
 * 1. Claims have supporting evidence
 * 2. High-confidence claims are justified
 * 3. Uncertainty is calibrated (not excessive hedging)
 * 4. Complex tasks show alternatives considered (no tunnel vision)
 *
 * THE LAW: Operates on structured fields ONLY. NO LLM calls.
 *
 * @module lib/agents/claim-evidence-auditor
 */

const { getAuditConfig, isAuditEnabled, getFailurePolicyAction } = require('./audit-config.cjs');
const { calculateEvidenceScore, validateEvidenceForConfidence, hasConflictingEvidence } = require('./evidence-schema.cjs');
const { inferComplexity, meetsComplexityThreshold, isTaskTypeExempt } = require('./agent-complexity-map.cjs');
const { enforceMetadataLimits } = require('./metadata-enforcer.cjs');

/**
 * Audit exception - thrown when audit fails in block mode
 */
class ClaimEvidenceAuditException extends Error {
  constructor(agentName, auditResults) {
    const summary = [
      `Claim/Evidence audit FAILED for agent ${agentName}:`,
      auditResults.issues?.length > 0
        ? `  Issues: ${auditResults.issues.map(i => i.type).join(', ')}`
        : null,
      `  Score: ${auditResults.audit_score}/100`,
      `  Action: ${auditResults.action}`
    ].filter(Boolean).join('\n');

    super(summary);
    this.name = 'ClaimEvidenceAuditException';
    this.isRetryable = true;
    this.agentName = agentName;
    this.auditResults = auditResults;
  }
}

/**
 * Main Claim/Evidence Auditor class
 */
class ClaimEvidenceAuditor {
  /**
   * @param {Object} config - Audit configuration (uses defaults if not provided)
   */
  constructor(config = null) {
    this.config = config || getAuditConfig();
  }

  /**
   * Main audit method - validates agent output before emission
   *
   * @param {Object} agent - Agent instance to audit
   * @param {Object} context - Execution context
   * @returns {Object} Audit results
   * @throws {ClaimEvidenceAuditException} If audit fails in block mode
   */
  async audit(agent, context = {}) {
    // Initialize results
    const results = {
      passed: true,
      agent_name: agent.name || 'unknown',
      timestamp: new Date().toISOString(),
      audit_score: 100,
      checks_run: [],
      checks_skipped: [],
      issues: [],
      rewards: [],
      action: 'CONTINUE'
    };

    // Check if audit is enabled
    if (!isAuditEnabled(this.config, context)) {
      results.checks_skipped.push({ check: 'all', reason: 'audit_disabled' });
      return results;
    }

    // Get agent-specific config
    const agentConfig = getAuditConfig(agent.type || agent.name, this.config);

    // 1. Claim/Evidence check
    if (agentConfig.checks.claimEvidence.enabled) {
      this.auditClaimEvidence(agent, results, agentConfig);
      results.checks_run.push('claimEvidence');
    } else {
      results.checks_skipped.push({ check: 'claimEvidence', reason: 'disabled_in_config' });
    }

    // 2. Tunnel vision check (CONDITIONAL)
    if (this.shouldRunTunnelVisionCheck(agent, context, agentConfig)) {
      this.auditTunnelVision(agent, results, agentConfig);
      results.checks_run.push('tunnelVision');
    } else {
      results.checks_skipped.push({
        check: 'tunnelVision',
        reason: this.getTunnelVisionSkipReason(agent, context, agentConfig)
      });
    }

    // 3. Calibrated uncertainty check
    if (agentConfig.checks.calibratedUncertainty.enabled) {
      this.auditCalibratedUncertainty(agent, results, agentConfig);
      results.checks_run.push('calibratedUncertainty');
    } else {
      results.checks_skipped.push({ check: 'calibratedUncertainty', reason: 'disabled_in_config' });
    }

    // 4. Enforce metadata size limits
    if (agent.metadata) {
      agent.metadata = enforceMetadataLimits(agent.metadata);
    }

    // Determine pass/fail and action
    results.passed = results.audit_score >= agentConfig.thresholds.passScore;
    const policyAction = getFailurePolicyAction(agentConfig, results, context.retryCount || 0);
    results.action = policyAction.action;
    results.action_reason = policyAction.reason;

    // Log audit result
    this.logAuditResult(results);

    // Handle block policy
    if (results.action === 'BLOCK_OUTPUT') {
      throw new ClaimEvidenceAuditException(results.agent_name, results);
    }

    return results;
  }

  /**
   * Audit claim/evidence relationship
   * Checks that high-confidence claims have supporting evidence
   */
  auditClaimEvidence(agent, results, config) {
    const findings = agent.findings || [];
    const checkConfig = config.checks.claimEvidence;

    for (const finding of findings) {
      // Check evidence for high-confidence claims
      const validation = validateEvidenceForConfidence(
        finding,
        config.thresholds.highConfidenceThreshold,
        checkConfig.minEvidenceScore
      );

      if (!validation.valid) {
        results.issues.push({
          type: 'high_confidence_without_evidence',
          finding_id: finding.id,
          confidence: validation.confidence,
          evidence_score: validation.evidenceScore,
          gap: validation.gap,
          penalty: config.scoring.unsupportedCertaintyPenalty
        });
        results.audit_score += config.scoring.unsupportedCertaintyPenalty;
      }

      // Check for unsupported certainty language
      if (checkConfig.penalizeUnsupportedCertainty) {
        const certaintyIssue = this.checkCertaintyLanguage(finding, checkConfig);
        if (certaintyIssue) {
          results.issues.push(certaintyIssue);
          results.audit_score += config.scoring.unsupportedCertaintyPenalty;
        }
      }

      // Reward evidence diversity
      const evidenceScore = calculateEvidenceScore(finding);
      if (evidenceScore >= 0.8) {
        results.rewards.push({
          type: 'strong_evidence',
          finding_id: finding.id,
          evidence_score: evidenceScore,
          score: config.scoring.evidenceDiversityBonus
        });
        results.audit_score += config.scoring.evidenceDiversityBonus;
      }
    }
  }

  /**
   * Check for certainty language without evidence
   */
  checkCertaintyLanguage(finding, checkConfig) {
    const text = `${finding.description || ''} ${finding.recommendation || ''}`;

    // Check exclude patterns first (quotes, negation)
    // Note: patterns may be stored as strings to survive JSON serialization
    for (const excludePattern of (checkConfig.excludePatterns || [])) {
      const regex = typeof excludePattern === 'string'
        ? new RegExp(excludePattern, 'i')
        : excludePattern;
      if (regex.test(text)) {
        return null; // Excluded - don't flag
      }
    }

    // Check certainty patterns
    for (const pattern of checkConfig.certaintyPatterns) {
      const regex = new RegExp(`\\b${pattern}\\b`, 'i');
      if (regex.test(text)) {
        // Only flag if insufficient evidence
        const evidenceScore = calculateEvidenceScore(finding);
        if (evidenceScore < checkConfig.minEvidenceScore) {
          return {
            type: 'unsupported_certainty',
            finding_id: finding.id,
            pattern_matched: pattern,
            text_excerpt: text.substring(0, 100),
            evidence_score: evidenceScore,
            penalty: -15
          };
        }
      }
    }

    return null;
  }

  /**
   * Check if tunnel vision check should run
   */
  shouldRunTunnelVisionCheck(agent, context, config) {
    const checkConfig = config.checks.tunnelVision;
    if (!checkConfig.enabled) return false;

    // Check for exempt task types
    const taskType = context.taskType || agent.metadata?.taskType;
    if (taskType && isTaskTypeExempt(taskType, checkConfig.exemptTaskTypes)) {
      return false;
    }

    // Check complexity threshold
    const complexity = inferComplexity(agent, context);
    return meetsComplexityThreshold(complexity, checkConfig.complexityThreshold);
  }

  /**
   * Get reason why tunnel vision check was skipped
   */
  getTunnelVisionSkipReason(agent, context, config) {
    const checkConfig = config.checks.tunnelVision;

    if (!checkConfig.enabled) {
      return 'disabled_in_config';
    }

    const taskType = context.taskType || agent.metadata?.taskType;
    if (taskType && isTaskTypeExempt(taskType, checkConfig.exemptTaskTypes)) {
      return `exempt_task_type: ${taskType}`;
    }

    const complexity = inferComplexity(agent, context);
    if (!meetsComplexityThreshold(complexity, checkConfig.complexityThreshold)) {
      return `complexity_below_threshold: ${complexity} < ${checkConfig.complexityThreshold}`;
    }

    return 'unknown';
  }

  /**
   * Audit tunnel vision - check that alternatives were considered
   */
  auditTunnelVision(agent, results, config) {
    const checkConfig = config.checks.tunnelVision;
    const rejectedHypotheses = agent._rejectedHypotheses || [];

    // Check if agent has valid bypass justification
    if (checkConfig.allowJustification && this.hasValidBypassJustification(agent, rejectedHypotheses)) {
      results.rewards.push({
        type: 'valid_deterministic_justification',
        score: 0  // No penalty, no reward
      });
      return;
    }

    // Check minimum rejected hypotheses
    if (rejectedHypotheses.length < checkConfig.minRejectedHypotheses) {
      results.issues.push({
        type: 'tunnel_vision',
        message: `Only ${rejectedHypotheses.length} alternatives considered (min: ${checkConfig.minRejectedHypotheses})`,
        rejected_count: rejectedHypotheses.length,
        required_count: checkConfig.minRejectedHypotheses,
        penalty: config.scoring.tunnelVisionPenalty
      });
      results.audit_score += config.scoring.tunnelVisionPenalty;
    }
  }

  /**
   * Check if agent has valid bypass justification for tunnel vision
   */
  hasValidBypassJustification(agent, rejectedHypotheses) {
    // Check for NA_DETERMINISTIC entry
    const hasNaEntry = rejectedHypotheses.some(h =>
      h.rejection_reason?.code === 'NA_DETERMINISTIC' ||
      h.alternative_id === 'N/A' ||
      h.rejection_reason?.description?.includes('single correct answer')
    );

    if (hasNaEntry) return true;

    // Check agent metadata for justification
    if (agent.metadata?.tunnelVisionBypass) {
      return true;
    }

    return false;
  }

  /**
   * Audit calibrated uncertainty
   * Rewards justified uncertainty, penalizes excessive hedging
   */
  auditCalibratedUncertainty(agent, results, config) {
    const checkConfig = config.checks.calibratedUncertainty;
    const findings = agent.findings || [];

    let hedgeCount = 0;
    let validUncertaintyCount = 0;

    for (const finding of findings) {
      const text = `${finding.description || ''} ${finding.recommendation || ''}`.toLowerCase();

      // Check for hedge patterns
      const hasHedge = checkConfig.hedgePatterns.some(p => text.includes(p));

      if (hasHedge) {
        hedgeCount++;

        // Check if uncertainty is calibrated (properly justified)
        if (this.isUncertaintyCalibratedValid(finding)) {
          validUncertaintyCount++;
          results.rewards.push({
            type: 'calibrated_uncertainty',
            finding_id: finding.id,
            score: config.scoring.calibratedUncertaintyReward
          });
          results.audit_score += config.scoring.calibratedUncertaintyReward;
        }
      }
    }

    // Penalize excessive uncalibrated hedging (anti-gaming)
    const uncalibratedHedges = hedgeCount - validUncertaintyCount;
    if (uncalibratedHedges > checkConfig.maxUncalibratedHedges) {
      results.issues.push({
        type: 'excessive_hedging',
        message: `${uncalibratedHedges} uncertain claims without justification (gaming detected)`,
        uncalibrated_count: uncalibratedHedges,
        threshold: checkConfig.maxUncalibratedHedges,
        penalty: checkConfig.maxHedgingPenalty
      });
      results.audit_score += checkConfig.maxHedgingPenalty;
    }
  }

  /**
   * Check if uncertainty is properly calibrated (not self-attestation)
   *
   * Anti-self-attestation rule: flags must be DERIVABLE from evidence
   */
  isUncertaintyCalibratedValid(finding) {
    // Check missingEvidence flag
    if (finding.metadata?.missingEvidence) {
      const evidenceScore = calculateEvidenceScore(finding);
      // Only valid if evidence actually IS sparse
      if (evidenceScore >= 0.5) return false;
    }

    // Check conflictingEvidence flag
    if (finding.metadata?.conflictingEvidence) {
      // Only valid if evidence array shows conflict
      if (!hasConflictingEvidence(finding.evidence)) return false;
    }

    // Check nextStepToResolve
    if (finding.metadata?.nextStepToResolve) {
      const nextStep = finding.metadata.nextStepToResolve;
      // Must be structured object with action and expected_result
      if (typeof nextStep === 'string') return false;
      if (!nextStep.action || !nextStep.expected_result) return false;
    }

    // At least one valid justification must be present
    return !!(
      (finding.metadata?.missingEvidence && calculateEvidenceScore(finding) < 0.5) ||
      (finding.metadata?.conflictingEvidence && hasConflictingEvidence(finding.evidence)) ||
      (finding.metadata?.nextStepToResolve?.action && finding.metadata?.nextStepToResolve?.expected_result)
    );
  }

  /**
   * Log audit result (structured JSON for observability)
   */
  logAuditResult(results) {
    const logEntry = {
      event: 'claim_evidence_audit',
      level: results.passed ? 'info' : 'warn',
      agent: results.agent_name,
      passed: results.passed,
      audit_score: results.audit_score,
      checks_run: results.checks_run.length,
      checks_skipped: results.checks_skipped.length,
      issues_count: results.issues.length,
      rewards_count: results.rewards.length,
      action: results.action,
      timestamp: results.timestamp
    };

    // Use console.log for structured logging
    // In production, this would go to a proper logging service
    if (process.env.NODE_ENV !== 'test') {
      console.log(JSON.stringify(logEntry));
    }
  }

  /**
   * Apply degrade policy to agent output
   *
   * @param {Object} agentOutput - Agent output to degrade
   * @param {Object} auditResults - Audit results
   * @returns {Object} Degraded output
   */
  applyDegradePolicy(agentOutput, auditResults) {
    // 1. Cap all confidences at 0.7
    for (const finding of agentOutput.findings || []) {
      if (finding.confidence > 0.7) {
        finding.confidence = 0.7;
        finding.metadata = finding.metadata || {};
        finding.metadata.confidence_capped = true;
        finding.metadata.cap_reason = 'audit_degrade_policy';
      }
    }

    // 2. Move low-confidence findings to uncertainties
    const uncertainties = agentOutput.uncertainties || [];
    const demoted = (agentOutput.findings || []).filter(f => f.confidence < 0.5);

    for (const finding of demoted) {
      uncertainties.push({
        ...finding,
        demoted_from_findings: true
      });
    }

    agentOutput.findings = (agentOutput.findings || []).filter(f => f.confidence >= 0.5);
    agentOutput.uncertainties = uncertainties;

    // 3. Reduce score by audit penalty
    const penalty = Math.max(0, 100 - auditResults.audit_score) * 0.5;
    agentOutput.score = Math.max(0, (agentOutput.score || 0) - penalty);

    // 4. Attach audit results
    agentOutput.claim_evidence_audit = auditResults;
    agentOutput.claim_evidence_audit.degraded = true;

    return agentOutput;
  }

  /**
   * Calculate confidence interval for low-confidence results
   *
   * Uses heuristic bands for small samples, percentile bands for larger samples
   */
  calculateConfidenceInterval(findings) {
    const severityWeights = { critical: 4, high: 3, medium: 2, low: 1, info: 0.5 };
    const n = findings.length || 1;

    // Calculate severity-weighted average
    let weightedSum = 0;
    let totalWeight = 0;

    for (const finding of findings) {
      const weight = severityWeights[finding.severity] || 1;
      weightedSum += (finding.confidence || 0.5) * weight;
      totalWeight += weight;
    }

    const weightedAvg = totalWeight > 0 ? weightedSum / totalWeight : 0.5;

    // For small samples (n < 5), use heuristic bands
    if (n < 5) {
      const margin = 0.15 * (5 - n) / 4;
      return {
        lower: Math.max(0, weightedAvg - margin),
        upper: Math.min(1, weightedAvg + margin),
        center: weightedAvg,
        method: 'heuristic_small_sample',
        inputs: { n, weightedAvg, margin_factor: (5 - n) / 4 }
      };
    }

    // For n >= 5, use percentile bands
    const confidences = findings.map(f => f.confidence || 0.5);
    const sorted = [...confidences].sort((a, b) => a - b);
    const p10 = sorted[Math.floor(n * 0.1)] || sorted[0];
    const p90 = sorted[Math.floor(n * 0.9)] || sorted[n - 1];

    return {
      lower: Math.max(0, Math.min(weightedAvg, p10)),
      upper: Math.min(1, Math.max(weightedAvg, p90)),
      center: weightedAvg,
      method: 'percentile_bands',
      inputs: { n, weightedAvg, p10, p90 }
    };
  }
}

// Singleton instance
let _instance = null;

/**
 * Get singleton auditor instance
 * @param {Object} config - Optional config override
 * @returns {ClaimEvidenceAuditor}
 */
function getClaimEvidenceAuditor(config = null) {
  if (!_instance || config) {
    _instance = new ClaimEvidenceAuditor(config);
  }
  return _instance;
}

module.exports = {
  ClaimEvidenceAuditor,
  ClaimEvidenceAuditException,
  getClaimEvidenceAuditor
};
