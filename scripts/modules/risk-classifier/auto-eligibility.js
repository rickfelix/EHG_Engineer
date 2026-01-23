/**
 * AUTO Eligibility Module
 * Phase 3: SD-LEO-SELF-IMPROVE-AUTO-001
 *
 * Extends RiskClassifier with AI Quality Judge integration for
 * AUTO tier eligibility decisions. No auto-application in this phase.
 *
 * Key features:
 * - Integration with AI Quality Judge scoring
 * - Batch eligibility checking
 * - Eligibility logging for audit trail
 * - Enhanced decision pipeline
 */

import { createRiskClassifier } from './index.js';
import {
  RECOMMENDATION_THRESHOLDS,
  RISK_TIERS
} from '../ai-quality-judge/config.js';

/**
 * Default AUTO eligibility thresholds
 */
export const AUTO_THRESHOLDS = {
  min_score: RISK_TIERS.AUTO.min_score,           // 85
  min_safety: RISK_TIERS.AUTO.min_safety,         // 9
  allowed_operations: RISK_TIERS.AUTO.allowed_operations, // ['INSERT']
  max_daily_auto: 3                               // CONST-007 limit
};

/**
 * Eligibility decision types
 */
export const ELIGIBILITY_DECISION = {
  ELIGIBLE: 'ELIGIBLE',               // Meets all AUTO criteria
  INELIGIBLE_TIER: 'INELIGIBLE_TIER', // Wrong tier (IMMUTABLE/GOVERNED)
  INELIGIBLE_SCORE: 'INELIGIBLE_SCORE', // Score below threshold
  INELIGIBLE_SAFETY: 'INELIGIBLE_SAFETY', // Safety below threshold
  INELIGIBLE_OPERATION: 'INELIGIBLE_OPERATION', // Wrong operation type
  INELIGIBLE_LIMIT: 'INELIGIBLE_LIMIT' // Daily limit reached
};

/**
 * AutoEligibilityChecker class
 * Evaluates improvements for AUTO tier eligibility
 */
export class AutoEligibilityChecker {
  constructor(options = {}) {
    this.classifier = options.classifier || createRiskClassifier();
    this.thresholds = { ...AUTO_THRESHOLDS, ...options.thresholds };
    this.dailyApplyCount = options.dailyApplyCount || 0;
    this.logger = options.logger || console;
    this.auditLog = [];
  }

  /**
   * Check if an improvement is eligible for AUTO application
   *
   * @param {Object} improvement - Improvement to check
   * @param {Object} scores - Quality scores from AI Judge
   * @param {number} scores.overall - Overall score (0-100)
   * @param {number} scores.safety - Safety score (0-10)
   * @param {Object} scores.criteria - Individual criterion scores
   * @returns {Object} Eligibility decision with full audit trail
   */
  checkEligibility(improvement, scores = {}) {
    const startTime = Date.now();
    const auditEntry = {
      improvement_id: improvement?.id || 'unknown',
      timestamp: new Date().toISOString(),
      input: {
        improvement: this._sanitizeImprovement(improvement),
        scores
      },
      checks: [],
      decision: null,
      reasoning: [],
      duration_ms: 0
    };

    try {
      // Step 1: Classify the improvement
      const classification = this.classifier.classify(improvement);
      auditEntry.classification = classification;

      // Step 2: Check tier eligibility
      if (classification.tier !== 'AUTO') {
        return this._recordDecision(auditEntry, {
          eligible: false,
          decision: ELIGIBILITY_DECISION.INELIGIBLE_TIER,
          reason: `Tier is ${classification.tier}, not AUTO`,
          classification,
          checks: [{
            check: 'tier',
            passed: false,
            expected: 'AUTO',
            actual: classification.tier
          }]
        }, startTime);
      }
      auditEntry.checks.push({ check: 'tier', passed: true, value: 'AUTO' });

      // Step 3: Check overall score threshold
      const overallScore = scores.overall ?? 0;
      if (overallScore < this.thresholds.min_score) {
        return this._recordDecision(auditEntry, {
          eligible: false,
          decision: ELIGIBILITY_DECISION.INELIGIBLE_SCORE,
          reason: `Score ${overallScore} below threshold ${this.thresholds.min_score}`,
          classification,
          checks: [{
            check: 'score',
            passed: false,
            expected: `>= ${this.thresholds.min_score}`,
            actual: overallScore
          }]
        }, startTime);
      }
      auditEntry.checks.push({
        check: 'score',
        passed: true,
        threshold: this.thresholds.min_score,
        value: overallScore
      });

      // Step 4: Check safety score threshold
      const safetyScore = scores.safety ?? scores.criteria?.safety ?? 0;
      if (safetyScore < this.thresholds.min_safety) {
        return this._recordDecision(auditEntry, {
          eligible: false,
          decision: ELIGIBILITY_DECISION.INELIGIBLE_SAFETY,
          reason: `Safety score ${safetyScore} below threshold ${this.thresholds.min_safety}`,
          classification,
          checks: [{
            check: 'safety',
            passed: false,
            expected: `>= ${this.thresholds.min_safety}`,
            actual: safetyScore
          }]
        }, startTime);
      }
      auditEntry.checks.push({
        check: 'safety',
        passed: true,
        threshold: this.thresholds.min_safety,
        value: safetyScore
      });

      // Step 5: Check operation type
      const operation = (improvement?.target_operation || '').toUpperCase();
      if (!this.thresholds.allowed_operations.includes(operation)) {
        return this._recordDecision(auditEntry, {
          eligible: false,
          decision: ELIGIBILITY_DECISION.INELIGIBLE_OPERATION,
          reason: `Operation ${operation} not in allowed list: ${this.thresholds.allowed_operations.join(', ')}`,
          classification,
          checks: [{
            check: 'operation',
            passed: false,
            expected: this.thresholds.allowed_operations,
            actual: operation
          }]
        }, startTime);
      }
      auditEntry.checks.push({
        check: 'operation',
        passed: true,
        allowed: this.thresholds.allowed_operations,
        value: operation
      });

      // Step 6: Check daily limit (CONST-007)
      if (this.dailyApplyCount >= this.thresholds.max_daily_auto) {
        return this._recordDecision(auditEntry, {
          eligible: false,
          decision: ELIGIBILITY_DECISION.INELIGIBLE_LIMIT,
          reason: `Daily AUTO limit reached: ${this.dailyApplyCount}/${this.thresholds.max_daily_auto}`,
          classification,
          checks: [{
            check: 'daily_limit',
            passed: false,
            expected: `< ${this.thresholds.max_daily_auto}`,
            actual: this.dailyApplyCount
          }]
        }, startTime);
      }
      auditEntry.checks.push({
        check: 'daily_limit',
        passed: true,
        limit: this.thresholds.max_daily_auto,
        current: this.dailyApplyCount
      });

      // All checks passed
      return this._recordDecision(auditEntry, {
        eligible: true,
        decision: ELIGIBILITY_DECISION.ELIGIBLE,
        reason: 'All AUTO eligibility criteria met',
        classification,
        scores: {
          overall: overallScore,
          safety: safetyScore,
          criteria: scores.criteria || {}
        },
        thresholds: this.thresholds,
        recommendation: this._getRecommendation(overallScore)
      }, startTime);

    } catch (error) {
      this.logger.error('[AutoEligibility] Error:', error.message);
      return this._recordDecision(auditEntry, {
        eligible: false,
        decision: 'ERROR',
        reason: `Eligibility check failed: ${error.message}`,
        error: error.message
      }, startTime);
    }
  }

  /**
   * Check eligibility for multiple improvements
   *
   * @param {Array} improvements - Array of improvements
   * @param {Function} scoreProvider - Async function that returns scores for an improvement
   * @returns {Promise<Array>} Array of eligibility results
   */
  async checkBatchEligibility(improvements, scoreProvider) {
    const results = [];
    let eligibleCount = 0;

    for (const improvement of improvements) {
      // Get scores from provider (could be AI Quality Judge)
      const scores = scoreProvider
        ? await scoreProvider(improvement)
        : { overall: 0, safety: 0, criteria: {} };

      const result = this.checkEligibility(improvement, scores);

      // Track how many would be eligible in this batch
      if (result.eligible) {
        eligibleCount++;
      }

      results.push({
        improvement_id: improvement.id,
        ...result,
        batch_position: results.length + 1,
        cumulative_eligible: eligibleCount
      });
    }

    return {
      results,
      summary: {
        total: improvements.length,
        eligible: eligibleCount,
        ineligible: improvements.length - eligibleCount,
        eligibility_rate: improvements.length > 0
          ? Math.round((eligibleCount / improvements.length) * 100)
          : 0
      }
    };
  }

  /**
   * Get recommendation based on score
   *
   * @param {number} score - Overall score
   * @returns {Object} Recommendation
   */
  _getRecommendation(score) {
    if (score >= RECOMMENDATION_THRESHOLDS.approve_high) {
      return {
        action: 'APPROVE',
        confidence: 'HIGH',
        human_review: false
      };
    } else if (score >= RECOMMENDATION_THRESHOLDS.approve_medium) {
      return {
        action: 'APPROVE',
        confidence: 'MEDIUM',
        human_review: true
      };
    } else if (score >= RECOMMENDATION_THRESHOLDS.needs_revision) {
      return {
        action: 'NEEDS_REVISION',
        confidence: 'LOW',
        human_review: true
      };
    } else {
      return {
        action: 'REJECT',
        confidence: 'HIGH',
        human_review: false
      };
    }
  }

  /**
   * Record decision to audit log
   *
   * @param {Object} auditEntry - Audit entry being built
   * @param {Object} decision - Decision result
   * @param {number} startTime - Start timestamp
   * @returns {Object} Final decision with audit info
   */
  _recordDecision(auditEntry, decision, startTime) {
    auditEntry.decision = decision.decision;
    auditEntry.reasoning = decision.reason ? [decision.reason] : [];
    auditEntry.duration_ms = Date.now() - startTime;
    auditEntry.checks = decision.checks || auditEntry.checks;

    // Add to audit log
    this.auditLog.push(auditEntry);

    // Log for visibility
    if (this.logger.debug) {
      this.logger.debug('[AutoEligibility]', {
        id: auditEntry.improvement_id,
        decision: decision.decision,
        eligible: decision.eligible
      });
    }

    return {
      ...decision,
      audit: {
        entry_id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: auditEntry.timestamp,
        duration_ms: auditEntry.duration_ms
      }
    };
  }

  /**
   * Sanitize improvement for audit logging
   *
   * @param {Object} improvement - Improvement object
   * @returns {Object} Sanitized copy
   */
  _sanitizeImprovement(improvement) {
    if (!improvement) return null;
    return {
      id: improvement.id,
      target_table: improvement.target_table,
      target_operation: improvement.target_operation,
      improvement_type: improvement.improvement_type,
      // Don't log full payload for security
      has_payload: !!improvement.payload
    };
  }

  /**
   * Get the audit log
   *
   * @returns {Array} Audit log entries
   */
  getAuditLog() {
    return [...this.auditLog];
  }

  /**
   * Clear the audit log
   */
  clearAuditLog() {
    this.auditLog = [];
  }

  /**
   * Get eligibility statistics
   *
   * @returns {Object} Statistics from audit log
   */
  getStatistics() {
    const log = this.auditLog;
    if (log.length === 0) {
      return {
        total_checks: 0,
        eligible: 0,
        ineligible: 0,
        by_decision: {},
        avg_duration_ms: 0
      };
    }

    const byDecision = {};
    let totalDuration = 0;
    let eligible = 0;

    for (const entry of log) {
      byDecision[entry.decision] = (byDecision[entry.decision] || 0) + 1;
      totalDuration += entry.duration_ms || 0;
      if (entry.decision === ELIGIBILITY_DECISION.ELIGIBLE) {
        eligible++;
      }
    }

    return {
      total_checks: log.length,
      eligible,
      ineligible: log.length - eligible,
      eligibility_rate: Math.round((eligible / log.length) * 100),
      by_decision: byDecision,
      avg_duration_ms: Math.round(totalDuration / log.length)
    };
  }

  /**
   * Update daily apply count (call when auto-apply happens)
   *
   * @param {number} count - New count
   */
  setDailyApplyCount(count) {
    this.dailyApplyCount = count;
  }

  /**
   * Increment daily apply count
   */
  incrementDailyApplyCount() {
    this.dailyApplyCount++;
  }
}

/**
 * Create an AutoEligibilityChecker instance
 *
 * @param {Object} options - Configuration options
 * @returns {AutoEligibilityChecker} Checker instance
 */
export function createAutoEligibilityChecker(options = {}) {
  return new AutoEligibilityChecker(options);
}

export default AutoEligibilityChecker;
