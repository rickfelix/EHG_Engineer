#!/usr/bin/env node
/**
 * EffectivenessTracker - Track effectiveness of applied protocol improvements
 *
 * Purpose:
 * - Monitor if applied improvements actually reduce issue frequency
 * - Calculate effectiveness scores based on reoccurrence rates
 * - Flag ineffective improvements for review
 * - Provide data-driven feedback on protocol changes
 *
 * Methodology:
 * - Compare failure pattern frequency BEFORE vs AFTER improvement application
 * - Track if related retrospectives continue to report the same issues
 * - Score effectiveness on 0-100 scale (100 = issue completely eliminated)
 *
 * Usage:
 * ```js
 * const tracker = new EffectivenessTracker(client);
 * await tracker.trackEffectiveness(appliedImprovementId);
 * const score = await tracker.calculateEffectivenessScore(improvementId);
 * await tracker.flagIneffectiveImprovements();
 * ```
 */

import { createDatabaseClient } from '../../lib/supabase-connection.js';

export class EffectivenessTracker {
  constructor(client) {
    this.client = client;
  }

  /**
   * Track effectiveness of a specific applied improvement
   * @param {string} appliedImprovementId - UUID of applied improvement
   * @returns {Promise<Object>} Effectiveness analysis
   */
  async trackEffectiveness(appliedImprovementId) {
    // Get improvement details
    const improvement = await this._getImprovement(appliedImprovementId);

    if (improvement.status !== 'applied') {
      throw new Error(`Improvement ${appliedImprovementId} has not been applied yet`);
    }

    // Calculate time windows
    const appliedDate = new Date(improvement.applied_at);
    const beforeWindow = this._getBeforeWindow(appliedDate);
    const afterWindow = this._getAfterWindow(appliedDate);

    // Get issue frequency before and after
    const beforeFrequency = await this._getIssueFrequency(
      improvement,
      beforeWindow.start,
      beforeWindow.end
    );

    const afterFrequency = await this._getIssueFrequency(
      improvement,
      afterWindow.start,
      afterWindow.end
    );

    // Calculate effectiveness metrics
    const reductionRate = this._calculateReductionRate(beforeFrequency, afterFrequency);
    const effectivenessScore = this._scoreEffectiveness(reductionRate, afterFrequency);

    // Update improvement record
    await this.client.query(
      `UPDATE protocol_improvement_queue
       SET effectiveness_score = $1,
           reoccurrence_count = $2,
           metadata = metadata || $3::jsonb
       WHERE id = $4`,
      [
        effectivenessScore,
        afterFrequency,
        JSON.stringify({
          tracked_at: new Date().toISOString(),
          before_frequency: beforeFrequency,
          after_frequency: afterFrequency,
          reduction_rate: reductionRate,
          before_window: beforeWindow,
          after_window: afterWindow
        }),
        appliedImprovementId
      ]
    );

    // Flag if ineffective
    if (effectivenessScore < 40) {
      await this._flagAsIneffective(appliedImprovementId, effectivenessScore);
    }

    return {
      improvement_id: appliedImprovementId,
      improvement_text: improvement.improvement_text,
      applied_at: improvement.applied_at,
      before_frequency: beforeFrequency,
      after_frequency: afterFrequency,
      reduction_rate: reductionRate,
      effectiveness_score: effectivenessScore,
      status: effectivenessScore >= 70 ? 'effective' : effectivenessScore >= 40 ? 'moderate' : 'ineffective'
    };
  }

  /**
   * Calculate effectiveness score for an improvement
   * @param {string} improvementId - UUID of improvement
   * @returns {Promise<number>} Effectiveness score (0-100)
   */
  async calculateEffectivenessScore(improvementId) {
    const improvement = await this._getImprovement(improvementId);

    if (improvement.status !== 'applied') {
      return null; // Can't score unapplied improvements
    }

    // Check if already scored
    if (improvement.effectiveness_score !== null) {
      return improvement.effectiveness_score;
    }

    // Track and return score
    const result = await this.trackEffectiveness(improvementId);
    return result.effectiveness_score;
  }

  /**
   * Flag improvements that didn't help reduce issues
   * @param {number} threshold - Effectiveness threshold (default: 40)
   * @returns {Promise<Object[]>} Flagged improvements
   */
  async flagIneffectiveImprovements(threshold = 40) {
    // Find applied improvements that have been tracked
    const result = await this.client.query(
      `SELECT id, improvement_text, effectiveness_score, applied_at
       FROM protocol_improvement_queue
       WHERE status = 'applied'
         AND effectiveness_score IS NOT NULL
         AND effectiveness_score < $1
       ORDER BY effectiveness_score ASC`,
      [threshold]
    );

    const flagged = [];

    for (const row of result.rows) {
      await this.client.query(
        `UPDATE protocol_improvement_queue
         SET status = 'ineffective',
             metadata = metadata || $1::jsonb
         WHERE id = $2`,
        [
          JSON.stringify({
            flagged_as_ineffective: new Date().toISOString(),
            reason: `Effectiveness score ${row.effectiveness_score} below threshold ${threshold}`
          }),
          row.id
        ]
      );

      flagged.push({
        id: row.id,
        improvement_text: row.improvement_text,
        effectiveness_score: row.effectiveness_score,
        applied_at: row.applied_at
      });
    }

    return flagged;
  }

  /**
   * Track all applied improvements that haven't been scored yet
   * @returns {Promise<Object[]>} Tracking results
   */
  async trackAllUnscoredImprovements() {
    const result = await this.client.query(
      `SELECT id
       FROM protocol_improvement_queue
       WHERE status = 'applied'
         AND effectiveness_score IS NULL
         AND applied_at < NOW() - INTERVAL '7 days'
       ORDER BY applied_at ASC`
    );

    console.log(`Found ${result.rows.length} unscored improvements (applied >7 days ago)`);

    const results = [];

    for (const row of result.rows) {
      try {
        const trackingResult = await this.trackEffectiveness(row.id);
        results.push(trackingResult);
        console.log(`✅ ${trackingResult.improvement_text.substring(0, 50)}... Score: ${trackingResult.effectiveness_score}`);
      } catch (error) {
        console.error(`❌ Failed to track ${row.id}:`, error.message);
        results.push({
          improvement_id: row.id,
          error: error.message,
          status: 'error'
        });
      }
    }

    return results;
  }

  /**
   * Get effectiveness report for all applied improvements
   * @returns {Promise<Object>} Comprehensive effectiveness report
   */
  async getEffectivenessReport() {
    const result = await this.client.query(
      `SELECT
        COUNT(*) as total_applied,
        COUNT(CASE WHEN effectiveness_score >= 70 THEN 1 END) as effective_count,
        COUNT(CASE WHEN effectiveness_score >= 40 AND effectiveness_score < 70 THEN 1 END) as moderate_count,
        COUNT(CASE WHEN effectiveness_score < 40 THEN 1 END) as ineffective_count,
        AVG(effectiveness_score) as avg_effectiveness,
        AVG(reoccurrence_count) as avg_reoccurrence
       FROM protocol_improvement_queue
       WHERE status IN ('applied', 'ineffective')
         AND effectiveness_score IS NOT NULL`
    );

    const stats = result.rows[0];

    // Get top performers
    const topPerformers = await this.client.query(
      `SELECT improvement_text, improvement_type, effectiveness_score, reoccurrence_count
       FROM protocol_improvement_queue
       WHERE effectiveness_score >= 70
       ORDER BY effectiveness_score DESC
       LIMIT 5`
    );

    // Get worst performers
    const worstPerformers = await this.client.query(
      `SELECT improvement_text, improvement_type, effectiveness_score, reoccurrence_count
       FROM protocol_improvement_queue
       WHERE effectiveness_score IS NOT NULL
       ORDER BY effectiveness_score ASC
       LIMIT 5`
    );

    return {
      summary: {
        total_applied: parseInt(stats.total_applied),
        effective: parseInt(stats.effective_count),
        moderate: parseInt(stats.moderate_count),
        ineffective: parseInt(stats.ineffective_count),
        avg_effectiveness: parseFloat(stats.avg_effectiveness).toFixed(1),
        avg_reoccurrence: parseFloat(stats.avg_reoccurrence).toFixed(2)
      },
      top_performers: topPerformers.rows,
      worst_performers: worstPerformers.rows
    };
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  async _getImprovement(improvementId) {
    const result = await this.client.query(
      'SELECT * FROM protocol_improvement_queue WHERE id = $1',
      [improvementId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Improvement ${improvementId} not found`);
    }

    return result.rows[0];
  }

  _getBeforeWindow(appliedDate) {
    // 30 days before application
    const end = new Date(appliedDate);
    const start = new Date(appliedDate);
    start.setDate(start.getDate() - 30);

    return { start, end };
  }

  _getAfterWindow(appliedDate) {
    // 7-37 days after application (skip first week for adoption)
    const start = new Date(appliedDate);
    start.setDate(start.getDate() + 7);

    const end = new Date(appliedDate);
    end.setDate(end.getDate() + 37);

    // Don't extend beyond today
    const today = new Date();
    if (end > today) {
      end.setTime(today.getTime());
    }

    return { start, end };
  }

  async _getIssueFrequency(improvement, startDate, endDate) {
    // Count how many times similar issues appear in retrospectives during window
    const searchTerms = this._extractSearchTerms(improvement);

    const result = await this.client.query(
      `SELECT COUNT(*) as frequency
       FROM retrospectives
       WHERE conducted_date >= $1
         AND conducted_date <= $2
         AND (
           failure_patterns::text ILIKE ANY($3::text[])
           OR what_needs_improvement::text ILIKE ANY($3::text[])
           OR protocol_improvements::text ILIKE ANY($3::text[])
         )`,
      [startDate, endDate, searchTerms.map(term => `%${term}%`)]
    );

    return parseInt(result.rows[0].frequency);
  }

  _extractSearchTerms(improvement) {
    // Extract key terms from improvement text and evidence
    const text = `${improvement.improvement_text} ${improvement.evidence}`.toLowerCase();

    // Remove common words
    const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'is', 'was', 'are', 'were'];

    const words = text.split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !stopWords.includes(word))
      .map(word => word.replace(/[^a-z0-9]/g, ''));

    // Get top 5 most distinctive words (by length and uniqueness)
    const uniqueWords = [...new Set(words)]
      .sort((a, b) => b.length - a.length)
      .slice(0, 5);

    return uniqueWords;
  }

  _calculateReductionRate(beforeFrequency, afterFrequency) {
    if (beforeFrequency === 0) {
      // No baseline to compare against
      return afterFrequency === 0 ? 100 : -100;
    }

    const reduction = ((beforeFrequency - afterFrequency) / beforeFrequency) * 100;
    return Math.round(reduction);
  }

  _scoreEffectiveness(reductionRate, afterFrequency) {
    // Score on 0-100 scale
    // 100 = issue completely eliminated (afterFrequency = 0)
    // 70+ = significant reduction (>70% reduction)
    // 40-69 = moderate reduction (30-70% reduction)
    // <40 = ineffective (<30% reduction or increased)

    if (afterFrequency === 0) {
      return 100; // Perfect score
    }

    if (reductionRate >= 90) return 95;
    if (reductionRate >= 70) return 80;
    if (reductionRate >= 50) return 65;
    if (reductionRate >= 30) return 50;
    if (reductionRate >= 10) return 35;
    if (reductionRate >= 0) return 20;

    // Issue got worse
    return Math.max(0, 10 + reductionRate);
  }

  async _flagAsIneffective(improvementId, score) {
    await this.client.query(
      `UPDATE protocol_improvement_queue
       SET metadata = metadata || $1::jsonb
       WHERE id = $2`,
      [
        JSON.stringify({
          flagged_ineffective: true,
          flagged_at: new Date().toISOString(),
          score_at_flagging: score
        }),
        improvementId
      ]
    );
  }
}

/**
 * Standalone function to track all unscored improvements
 * @returns {Promise<Object>} Tracking summary
 */
export async function trackAllUnscored() {
  const client = await createDatabaseClient('engineer', { verbose: false });

  try {
    const tracker = new EffectivenessTracker(client);
    const results = await tracker.trackAllUnscoredImprovements();

    console.log('\n--- Effectiveness Tracking Summary ---');
    const effective = results.filter(r => r.status === 'effective').length;
    const moderate = results.filter(r => r.status === 'moderate').length;
    const ineffective = results.filter(r => r.status === 'ineffective').length;
    const errors = results.filter(r => r.status === 'error').length;

    console.log(`✅ Effective (70+): ${effective}`);
    console.log(`⚠️  Moderate (40-69): ${moderate}`);
    console.log(`❌ Ineffective (<40): ${ineffective}`);
    console.log(`⚡ Errors: ${errors}`);

    return { results, summary: { effective, moderate, ineffective, errors } };
  } finally {
    await client.end();
  }
}

/**
 * Standalone function to get effectiveness report
 * @returns {Promise<Object>} Comprehensive report
 */
export async function getReport() {
  const client = await createDatabaseClient('engineer', { verbose: false });

  try {
    const tracker = new EffectivenessTracker(client);
    const report = await tracker.getEffectivenessReport();

    console.log('\n=== Protocol Improvement Effectiveness Report ===\n');
    console.log(`Total Applied: ${report.summary.total_applied}`);
    console.log(`Effective (70+): ${report.summary.effective} (${(report.summary.effective / report.summary.total_applied * 100).toFixed(1)}%)`);
    console.log(`Moderate (40-69): ${report.summary.moderate} (${(report.summary.moderate / report.summary.total_applied * 100).toFixed(1)}%)`);
    console.log(`Ineffective (<40): ${report.summary.ineffective} (${(report.summary.ineffective / report.summary.total_applied * 100).toFixed(1)}%)`);
    console.log(`\nAvg Effectiveness: ${report.summary.avg_effectiveness}/100`);
    console.log(`Avg Reoccurrence: ${report.summary.avg_reoccurrence} times\n`);

    console.log('Top 5 Performers:');
    report.top_performers.forEach((imp, idx) => {
      console.log(`  ${idx + 1}. [${imp.effectiveness_score}] ${imp.improvement_text.substring(0, 60)}...`);
    });

    console.log('\nWorst 5 Performers:');
    report.worst_performers.forEach((imp, idx) => {
      console.log(`  ${idx + 1}. [${imp.effectiveness_score}] ${imp.improvement_text.substring(0, 60)}...`);
    });

    return report;
  } finally {
    await client.end();
  }
}

/**
 * Standalone function to flag ineffective improvements
 * @param {number} threshold - Effectiveness threshold
 * @returns {Promise<number>} Number of flagged improvements
 */
export async function flagIneffective(threshold = 40) {
  const client = await createDatabaseClient('engineer', { verbose: false });

  try {
    const tracker = new EffectivenessTracker(client);
    const flagged = await tracker.flagIneffectiveImprovements(threshold);

    console.log(`\n🚩 Flagged ${flagged.length} ineffective improvements (threshold: ${threshold})\n`);
    flagged.forEach((imp, idx) => {
      console.log(`${idx + 1}. [${imp.effectiveness_score}] ${imp.improvement_text.substring(0, 60)}...`);
    });

    return flagged.length;
  } finally {
    await client.end();
  }
}
