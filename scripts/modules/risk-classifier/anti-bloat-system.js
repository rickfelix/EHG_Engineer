/**
 * Anti-Bloat System Module
 * Phase 5: SD-LEO-SELF-IMPROVE-BLOAT-001
 *
 * Implements protocol bloat prevention through:
 * - Pipeline health metrics (approval rate, scores, patterns)
 * - Rejection tracking with categorized reasons
 * - Feedback loop to quality judge
 * - Token budget monitoring
 *
 * Key features:
 * - Real-time pipeline analytics via database views
 * - Rejection categorization for learning
 * - Threshold tuning recommendations
 * - Weekly maintenance job support
 */

/**
 * Rejection reason categories
 */
export const REJECTION_CATEGORY = {
  TIER_MISMATCH: 'tier_mismatch',
  LOW_SCORE: 'low_score',
  LOW_SAFETY: 'low_safety',
  OPERATION_NOT_ALLOWED: 'operation_not_allowed',
  DAILY_LIMIT: 'daily_limit',
  HUMAN_OVERRIDE: 'human_override',
  CONFLICT_DETECTED: 'conflict_detected',
  DUPLICATE: 'duplicate',
  MISSING_EVIDENCE: 'missing_evidence'
};

/**
 * Pipeline health thresholds
 */
export const HEALTH_THRESHOLDS = {
  MIN_APPROVAL_RATE: 60, // Alert if approval rate drops below 60%
  TOKEN_BUDGET_WARNING: 80, // Warn at 80% of token budget
  TOKEN_BUDGET_CRITICAL: 95, // Critical at 95%
  REJECTION_SPIKE_THRESHOLD: 3, // Alert if 3+ rejections of same category in a day
  MAX_PROTOCOL_TOKENS: 20000 // Maximum allowed protocol tokens
};

/**
 * AntiBloatSystem class
 * Manages protocol bloat prevention and pipeline health
 */
export class AntiBloatSystem {
  constructor(options = {}) {
    this.supabase = options.supabase || null;
    this.logger = options.logger || console;
    this.rejectionLog = [];
    this.healthMetrics = {
      totalChecks: 0,
      approvals: 0,
      rejections: 0,
      byCategory: {}
    };
  }

  /**
   * Track a rejection with categorized reason
   *
   * @param {Object} improvement - The rejected improvement
   * @param {Object} decision - The eligibility decision
   * @param {string} category - Rejection category (REJECTION_CATEGORY)
   * @param {string} [humanReason] - Optional human-provided reason
   * @returns {Object} Rejection record
   */
  trackRejection(improvement, decision, category, humanReason = null) {
    const rejection = {
      id: `rej-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      improvement_id: improvement?.id,
      category: category || REJECTION_CATEGORY.LOW_SCORE,
      decision: decision?.decision,
      score: decision?.scores?.overall || 0,
      safety_score: decision?.scores?.safety || 0,
      tier: decision?.classification?.tier,
      rule: decision?.classification?.rule,
      human_reason: humanReason,
      timestamp: new Date().toISOString(),
      metadata: {
        improvement_type: improvement?.improvement_type,
        target_table: improvement?.target_table,
        target_operation: improvement?.target_operation
      }
    };

    // Update metrics
    this.healthMetrics.totalChecks++;
    this.healthMetrics.rejections++;
    this.healthMetrics.byCategory[category] = (this.healthMetrics.byCategory[category] || 0) + 1;

    // Add to local log
    this.rejectionLog.push(rejection);

    return rejection;
  }

  /**
   * Track an approval
   *
   * @param {Object} improvement - The approved improvement
   * @param {Object} decision - The eligibility decision
   * @returns {Object} Approval record
   */
  trackApproval(improvement, decision) {
    this.healthMetrics.totalChecks++;
    this.healthMetrics.approvals++;

    return {
      improvement_id: improvement?.id,
      approved_at: new Date().toISOString(),
      score: decision?.scores?.overall || 0,
      tier: decision?.classification?.tier
    };
  }

  /**
   * Persist rejection to database
   *
   * @param {Object} rejection - Rejection record from trackRejection
   * @returns {Promise<Object>} Persistence result
   */
  async persistRejection(rejection) {
    if (!this.supabase) {
      this.logger.warn('[AntiBloatSystem] No Supabase client - rejection not persisted');
      return { persisted: false, reason: 'no_database' };
    }

    try {
      const { data, error } = await this.supabase
        .from('improvement_rejection_reasons')
        .insert({
          improvement_id: rejection.improvement_id,
          category: rejection.category,
          decision: rejection.decision,
          score: rejection.score,
          safety_score: rejection.safety_score,
          tier: rejection.tier,
          rule: rejection.rule,
          human_reason: rejection.human_reason,
          metadata: rejection.metadata,
          created_at: rejection.timestamp
        })
        .select()
        .single();

      if (error) {
        // Table may not exist yet - graceful fallback
        if (error.code === '42P01') {
          this.logger.warn('[AntiBloatSystem] Table improvement_rejection_reasons does not exist');
          return { persisted: false, reason: 'table_not_exists' };
        }
        this.logger.error('[AntiBloatSystem] Persist failed:', error.message);
        return { persisted: false, reason: error.message };
      }

      return { persisted: true, id: data.id, record: data };
    } catch (err) {
      this.logger.error('[AntiBloatSystem] Persist error:', err.message);
      return { persisted: false, reason: err.message };
    }
  }

  /**
   * Get pipeline health metrics
   *
   * @returns {Object} Current health metrics
   */
  getPipelineHealth() {
    const approvalRate = this.healthMetrics.totalChecks > 0
      ? Math.round((this.healthMetrics.approvals / this.healthMetrics.totalChecks) * 100)
      : 100;

    const health = {
      total_checks: this.healthMetrics.totalChecks,
      approvals: this.healthMetrics.approvals,
      rejections: this.healthMetrics.rejections,
      approval_rate: approvalRate,
      rejection_breakdown: { ...this.healthMetrics.byCategory },
      status: 'HEALTHY',
      warnings: [],
      recommendations: []
    };

    // Check approval rate
    if (approvalRate < HEALTH_THRESHOLDS.MIN_APPROVAL_RATE) {
      health.status = 'WARNING';
      health.warnings.push(`Approval rate (${approvalRate}%) below threshold (${HEALTH_THRESHOLDS.MIN_APPROVAL_RATE}%)`);
      health.recommendations.push('Review rejection patterns - consider threshold adjustment');
    }

    // Check for rejection spikes
    for (const [category, count] of Object.entries(this.healthMetrics.byCategory)) {
      if (count >= HEALTH_THRESHOLDS.REJECTION_SPIKE_THRESHOLD) {
        health.status = 'WARNING';
        health.warnings.push(`Rejection spike detected: ${count} rejections for category "${category}"`);
        health.recommendations.push(`Investigate root cause for ${category} rejections`);
      }
    }

    return health;
  }

  /**
   * Get token budget status from database view
   *
   * @returns {Promise<Object>} Token budget status
   */
  async getTokenBudgetStatus() {
    if (!this.supabase) {
      return {
        available: false,
        reason: 'no_database',
        current_tokens: 0,
        max_tokens: HEALTH_THRESHOLDS.MAX_PROTOCOL_TOKENS,
        usage_percent: 0,
        status: 'UNKNOWN'
      };
    }

    try {
      const { data, error } = await this.supabase
        .from('v_protocol_size')
        .select('*')
        .single();

      if (error) {
        // View may not exist yet
        if (error.code === '42P01' || error.code === 'PGRST116') {
          return {
            available: false,
            reason: 'view_not_exists',
            current_tokens: 0,
            max_tokens: HEALTH_THRESHOLDS.MAX_PROTOCOL_TOKENS,
            usage_percent: 0,
            status: 'UNKNOWN'
          };
        }
        throw error;
      }

      const currentTokens = data?.approx_tokens || 0;
      const usagePercent = Math.round((currentTokens / HEALTH_THRESHOLDS.MAX_PROTOCOL_TOKENS) * 100);

      let status = 'HEALTHY';
      if (usagePercent >= HEALTH_THRESHOLDS.TOKEN_BUDGET_CRITICAL) {
        status = 'CRITICAL';
      } else if (usagePercent >= HEALTH_THRESHOLDS.TOKEN_BUDGET_WARNING) {
        status = 'WARNING';
      }

      return {
        available: true,
        current_tokens: currentTokens,
        max_tokens: HEALTH_THRESHOLDS.MAX_PROTOCOL_TOKENS,
        usage_percent: usagePercent,
        status,
        budget_remaining: HEALTH_THRESHOLDS.MAX_PROTOCOL_TOKENS - currentTokens,
        sections_count: data?.total_sections || 0
      };
    } catch (err) {
      this.logger.error('[AntiBloatSystem] Token budget query error:', err.message);
      return {
        available: false,
        reason: err.message,
        current_tokens: 0,
        max_tokens: HEALTH_THRESHOLDS.MAX_PROTOCOL_TOKENS,
        usage_percent: 0,
        status: 'ERROR'
      };
    }
  }

  /**
   * Check for semantic conflicts in proposed improvement
   *
   * @param {Object} improvement - Proposed improvement
   * @param {Array} existingRules - Current rules/sections
   * @returns {Object} Conflict analysis
   */
  detectConflicts(improvement, existingRules = []) {
    const conflicts = [];
    const payload = improvement?.payload || {};

    // Check for duplicate rule codes
    if (payload.rule_code) {
      const duplicate = existingRules.find(r => r.rule_code === payload.rule_code);
      if (duplicate) {
        conflicts.push({
          type: 'DUPLICATE_RULE',
          severity: 'HIGH',
          existing: duplicate,
          message: `Rule code ${payload.rule_code} already exists`
        });
      }
    }

    // Check for conflicting operations on same table
    if (improvement.target_table && improvement.target_operation === 'INSERT') {
      const recentOps = existingRules.filter(r =>
        r.target_table === improvement.target_table &&
        r.status === 'pending'
      );

      if (recentOps.length > 0) {
        conflicts.push({
          type: 'CONCURRENT_MODIFICATION',
          severity: 'MEDIUM',
          existing: recentOps,
          message: `${recentOps.length} pending operations on ${improvement.target_table}`
        });
      }
    }

    // Check for semantic overlap (simple keyword matching)
    if (payload.content || payload.description) {
      const content = (payload.content || payload.description || '').toLowerCase();
      const similarRules = existingRules.filter(r => {
        const ruleContent = (r.content || r.description || '').toLowerCase();
        // Simple overlap check - shared significant words
        const contentWords = content.split(/\s+/).filter(w => w.length > 5);
        const ruleWords = ruleContent.split(/\s+/).filter(w => w.length > 5);
        const shared = contentWords.filter(w => ruleWords.includes(w));
        return shared.length >= 3;
      });

      if (similarRules.length > 0) {
        conflicts.push({
          type: 'SEMANTIC_OVERLAP',
          severity: 'LOW',
          existing: similarRules.slice(0, 3),
          message: `Content may overlap with ${similarRules.length} existing rule(s)`
        });
      }
    }

    return {
      has_conflicts: conflicts.length > 0,
      conflict_count: conflicts.length,
      conflicts,
      recommendation: conflicts.some(c => c.severity === 'HIGH')
        ? 'BLOCK'
        : conflicts.some(c => c.severity === 'MEDIUM')
          ? 'ESCALATE'
          : 'PROCEED_WITH_CAUTION'
    };
  }

  /**
   * Generate feedback for quality judge refinement
   *
   * @returns {Object} Feedback summary for AI Quality Judge
   */
  generateQualityJudgeFeedback() {
    const feedback = {
      generated_at: new Date().toISOString(),
      total_rejections: this.rejectionLog.length,
      patterns: [],
      threshold_recommendations: [],
      calibration_suggestions: []
    };

    // Group rejections by category
    const byCategory = {};
    for (const rejection of this.rejectionLog) {
      if (!byCategory[rejection.category]) {
        byCategory[rejection.category] = [];
      }
      byCategory[rejection.category].push(rejection);
    }

    // Analyze patterns
    for (const [category, rejections] of Object.entries(byCategory)) {
      const avgScore = rejections.length > 0
        ? Math.round(rejections.reduce((sum, r) => sum + r.score, 0) / rejections.length)
        : 0;

      const pattern = {
        category,
        count: rejections.length,
        avg_score: avgScore,
        improvement_types: [...new Set(rejections.map(r => r.metadata?.improvement_type).filter(Boolean))],
        target_tables: [...new Set(rejections.map(r => r.metadata?.target_table).filter(Boolean))]
      };

      feedback.patterns.push(pattern);

      // Generate threshold recommendations
      if (category === REJECTION_CATEGORY.LOW_SCORE && avgScore > 70) {
        feedback.threshold_recommendations.push({
          type: 'SCORE_THRESHOLD',
          current: 85,
          suggested: Math.max(70, avgScore - 5),
          reason: `Many rejections with scores around ${avgScore} - threshold may be too strict`
        });
      }

      if (category === REJECTION_CATEGORY.LOW_SAFETY && rejections.length >= 3) {
        feedback.calibration_suggestions.push({
          type: 'SAFETY_SCORING',
          issue: `${rejections.length} safety rejections detected`,
          suggestion: 'Review safety scoring criteria - may be over-weighting certain factors'
        });
      }
    }

    // Add general calibration suggestions based on approval rate
    const health = this.getPipelineHealth();
    if (health.approval_rate < 50) {
      feedback.calibration_suggestions.push({
        type: 'OVERALL_CALIBRATION',
        issue: `Low approval rate: ${health.approval_rate}%`,
        suggestion: 'Consider recalibrating scoring weights or lowering thresholds'
      });
    } else if (health.approval_rate > 95) {
      feedback.calibration_suggestions.push({
        type: 'OVERALL_CALIBRATION',
        issue: `Very high approval rate: ${health.approval_rate}%`,
        suggestion: 'Consider raising thresholds to maintain quality bar'
      });
    }

    return feedback;
  }

  /**
   * Get aggregated pipeline analytics
   *
   * @returns {Promise<Object>} Pipeline analytics from database view
   */
  async getPipelineAnalytics() {
    if (!this.supabase) {
      return {
        available: false,
        reason: 'no_database',
        analytics: this.getLocalAnalytics()
      };
    }

    try {
      const { data, error } = await this.supabase
        .from('v_improvement_pipeline')
        .select('*')
        .limit(100);

      if (error) {
        // View may not exist yet
        if (error.code === '42P01' || error.code === 'PGRST116') {
          return {
            available: false,
            reason: 'view_not_exists',
            analytics: this.getLocalAnalytics()
          };
        }
        throw error;
      }

      return {
        available: true,
        total_records: data?.length || 0,
        pipeline_data: data,
        analytics: this.getLocalAnalytics()
      };
    } catch (err) {
      this.logger.error('[AntiBloatSystem] Pipeline analytics error:', err.message);
      return {
        available: false,
        reason: err.message,
        analytics: this.getLocalAnalytics()
      };
    }
  }

  /**
   * Get local (in-memory) analytics
   * @private
   */
  getLocalAnalytics() {
    const health = this.getPipelineHealth();
    return {
      session_total: health.total_checks,
      session_approvals: health.approvals,
      session_rejections: health.rejections,
      session_approval_rate: health.approval_rate,
      rejection_breakdown: health.rejection_breakdown
    };
  }

  /**
   * Run maintenance check
   *
   * @returns {Object} Maintenance report
   */
  async runMaintenanceCheck() {
    const report = {
      timestamp: new Date().toISOString(),
      checks: [],
      issues: [],
      actions_taken: [],
      status: 'HEALTHY'
    };

    // Check token budget
    const tokenStatus = await this.getTokenBudgetStatus();
    report.checks.push({
      name: 'token_budget',
      status: tokenStatus.status,
      details: tokenStatus
    });

    if (tokenStatus.status === 'CRITICAL') {
      report.status = 'CRITICAL';
      report.issues.push({
        severity: 'CRITICAL',
        message: `Token budget at ${tokenStatus.usage_percent}% - immediate attention required`
      });
    } else if (tokenStatus.status === 'WARNING') {
      report.status = report.status === 'CRITICAL' ? 'CRITICAL' : 'WARNING';
      report.issues.push({
        severity: 'WARNING',
        message: `Token budget at ${tokenStatus.usage_percent}% - approaching limit`
      });
    }

    // Check pipeline health
    const pipelineHealth = this.getPipelineHealth();
    report.checks.push({
      name: 'pipeline_health',
      status: pipelineHealth.status,
      details: pipelineHealth
    });

    if (pipelineHealth.status === 'WARNING') {
      report.status = report.status === 'CRITICAL' ? 'CRITICAL' : 'WARNING';
      for (const warning of pipelineHealth.warnings) {
        report.issues.push({
          severity: 'WARNING',
          message: warning
        });
      }
    }

    // Include recommendations
    report.recommendations = [
      ...pipelineHealth.recommendations,
      ...(tokenStatus.status !== 'HEALTHY'
        ? ['Review protocol sections for consolidation opportunities']
        : [])
    ];

    return report;
  }

  /**
   * Clear rejection log (for testing)
   */
  clearRejectionLog() {
    this.rejectionLog = [];
    this.healthMetrics = {
      totalChecks: 0,
      approvals: 0,
      rejections: 0,
      byCategory: {}
    };
  }

  /**
   * Get rejection log
   */
  getRejectionLog() {
    return [...this.rejectionLog];
  }
}

/**
 * Create an AntiBloatSystem instance
 *
 * @param {Object} options - Configuration options
 * @returns {AntiBloatSystem} System instance
 */
export function createAntiBloatSystem(options = {}) {
  return new AntiBloatSystem(options);
}

export default AntiBloatSystem;
