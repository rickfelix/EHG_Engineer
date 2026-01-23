/**
 * Storage Module for AI Quality Judge
 * Phase 1: SD-LEO-SELF-IMPROVE-AIJUDGE-001
 *
 * Handles database persistence for quality assessments
 */

import { TABLES } from './config.js';

/**
 * AssessmentStorage class
 * Manages persistence of quality assessments
 */
export class AssessmentStorage {
  constructor(supabase) {
    this.supabase = supabase;
  }

  /**
   * Save quality assessment to database
   *
   * @param {Object} assessment - Assessment data to save
   * @returns {Object} Saved assessment with ID
   */
  async saveAssessment(assessment) {
    const record = {
      improvement_id: assessment.improvement_id,
      evaluator_model: assessment.evaluator_model,
      score: assessment.aggregate_score,
      criteria_scores: assessment.criteria_scores,
      recommendation: assessment.recommendation,
      reasoning: assessment.reasoning,
      evaluated_at: assessment.evaluated_at || new Date().toISOString()
    };

    const { data, error } = await this.supabase
      .from(TABLES.ASSESSMENTS)
      .insert(record)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save assessment: ${error.message}`);
    }

    return data;
  }

  /**
   * Get assessment by improvement ID
   *
   * @param {string} improvementId - Improvement UUID
   * @returns {Object|null} Assessment or null if not found
   */
  async getAssessmentByImprovement(improvementId) {
    const { data, error } = await this.supabase
      .from(TABLES.ASSESSMENTS)
      .select('*')
      .eq('improvement_id', improvementId)
      .order('evaluated_at', { ascending: false })
      .limit(1)
      .single();

    if (error && !error.message.includes('0 rows')) {
      throw new Error(`Failed to get assessment: ${error.message}`);
    }

    return data || null;
  }

  /**
   * Get all assessments for an improvement (history)
   *
   * @param {string} improvementId - Improvement UUID
   * @returns {Array} Assessment history
   */
  async getAssessmentHistory(improvementId) {
    const { data, error } = await this.supabase
      .from(TABLES.ASSESSMENTS)
      .select('*')
      .eq('improvement_id', improvementId)
      .order('evaluated_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get assessment history: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Update improvement status after evaluation
   *
   * @param {string} improvementId - Improvement UUID
   * @param {Object} updates - Status updates
   */
  async updateImprovementStatus(improvementId, updates) {
    const { error } = await this.supabase
      .from(TABLES.QUEUE)
      .update(updates)
      .eq('id', improvementId);

    if (error) {
      throw new Error(`Failed to update improvement status: ${error.message}`);
    }
  }

  /**
   * Get improvement by ID
   *
   * @param {string} improvementId - Improvement UUID
   * @returns {Object|null} Improvement or null
   */
  async getImprovement(improvementId) {
    const { data, error } = await this.supabase
      .from(TABLES.QUEUE)
      .select('*')
      .eq('id', improvementId)
      .single();

    if (error) {
      if (error.message.includes('0 rows')) {
        return null;
      }
      throw new Error(`Failed to get improvement: ${error.message}`);
    }

    return data;
  }

  /**
   * Get pending improvements for evaluation
   *
   * @param {Object} options - Filter options
   * @returns {Array} Pending improvements
   */
  async getPendingImprovements(options = {}) {
    let query = this.supabase
      .from(TABLES.QUEUE)
      .select('*')
      .eq('status', 'PENDING');

    if (options.risk_tier) {
      query = query.eq('risk_tier', options.risk_tier);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    query = query.order('evidence_count', { ascending: false });

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get pending improvements: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Record constitution violation
   *
   * @param {string} improvementId - Improvement UUID
   * @param {Array} violations - Constitution violations
   */
  async recordConstitutionViolations(improvementId, violations) {
    // Store violations in the assessment record
    // This could also be a separate table for more detailed tracking

    const violationSummary = {
      improvement_id: improvementId,
      violations,
      violation_count: violations.length,
      critical_count: violations.filter(v => v.severity === 'CRITICAL').length,
      recorded_at: new Date().toISOString()
    };

    // For now, we'll store this as metadata on the improvement
    const { error } = await this.supabase
      .from(TABLES.QUEUE)
      .update({
        metadata: this.supabase.sql`
          COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ constitution_violations: violationSummary })}::jsonb
        `
      })
      .eq('id', improvementId);

    // If raw SQL doesn't work, fall back to two-step update
    if (error) {
      // Get current metadata
      const { data: current } = await this.supabase
        .from(TABLES.QUEUE)
        .select('metadata')
        .eq('id', improvementId)
        .single();

      const metadata = current?.metadata || {};
      metadata.constitution_violations = violationSummary;

      await this.supabase
        .from(TABLES.QUEUE)
        .update({ metadata })
        .eq('id', improvementId);
    }
  }

  /**
   * Get assessment statistics
   *
   * @returns {Object} Statistics about assessments
   */
  async getStatistics() {
    const { data: assessments, error: assessError } = await this.supabase
      .from(TABLES.ASSESSMENTS)
      .select('recommendation, score');

    if (assessError) {
      throw new Error(`Failed to get statistics: ${assessError.message}`);
    }

    const stats = {
      total_assessments: assessments?.length || 0,
      by_recommendation: {
        APPROVE: 0,
        NEEDS_REVISION: 0,
        REJECT: 0
      },
      average_score: 0,
      score_distribution: {
        excellent: 0,  // 85-100
        good: 0,       // 70-84
        fair: 0,       // 50-69
        poor: 0        // 0-49
      }
    };

    if (assessments && assessments.length > 0) {
      let totalScore = 0;

      for (const a of assessments) {
        // Count by recommendation
        if (a.recommendation) {
          stats.by_recommendation[a.recommendation] =
            (stats.by_recommendation[a.recommendation] || 0) + 1;
        }

        // Sum scores
        if (a.score) {
          totalScore += a.score;

          // Score distribution
          if (a.score >= 85) stats.score_distribution.excellent++;
          else if (a.score >= 70) stats.score_distribution.good++;
          else if (a.score >= 50) stats.score_distribution.fair++;
          else stats.score_distribution.poor++;
        }
      }

      stats.average_score = Math.round(totalScore / assessments.length);
    }

    return stats;
  }
}

export default AssessmentStorage;
