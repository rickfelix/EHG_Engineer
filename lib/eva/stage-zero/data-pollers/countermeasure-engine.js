/**
 * Countermeasure Engine
 * Generates actionable recommendations from scored competitive movements.
 * Integrates with EVA stage-zero pipeline as enrichment metadata.
 *
 * Part of SD-LEO-INFRA-COMPETITOR-MONITORING-PHASE-004
 */

import { scoreMovements } from './significance-scorer.js';

const DEFAULT_RECOMMENDATION_THRESHOLD = 70;

const ACTION_TEMPLATES = {
  rising_competitor: {
    action: 'monitor_closely',
    urgency: 'high',
    template: (m) => `${m.app_name} rose ${m.magnitude} positions to #${m.current_position} on ${m.source}. Evaluate their recent changes and feature additions.`,
  },
  falling_competitor: {
    action: 'opportunity',
    urgency: 'medium',
    template: (m) => `${m.app_name} dropped ${m.magnitude} positions to #${m.current_position} on ${m.source}. Potential opportunity to capture their user base.`,
  },
  top_10_entry: {
    action: 'strategic_alert',
    urgency: 'high',
    template: (m) => `${m.app_name} entered the top 10 at #${m.current_position} on ${m.source}. Assess competitive threat and differentiation strategy.`,
  },
  significant_drop: {
    action: 'investigate',
    urgency: 'low',
    template: (m) => `${m.app_name} saw a significant drop of ${m.magnitude} positions on ${m.source}. May indicate market issues or negative reviews.`,
  },
};

/**
 * Classify a movement into an action category.
 */
function classifyMovement(movement) {
  if (movement.direction === 'up' && movement.current_position <= 10) {
    return 'top_10_entry';
  }
  if (movement.direction === 'up') {
    return 'rising_competitor';
  }
  if (movement.direction === 'down' && movement.magnitude >= 20) {
    return 'significant_drop';
  }
  return 'falling_competitor';
}

/**
 * Generate countermeasure recommendations from pipeline change data.
 *
 * @param {Object} params
 * @param {Array}  params.movements - Movements from change-detector.js
 * @param {number} [params.threshold=70] - Minimum significance score for recommendation
 * @param {Object} [params.scoringOptions] - Options for significance scorer
 * @param {Object} [params.logger] - Logger instance
 * @returns {Object} EVA-compatible enrichment output
 */
export function generateCountermeasures({ movements, threshold = DEFAULT_RECOMMENDATION_THRESHOLD, scoringOptions = {}, logger = console } = {}) {
  if (!movements || movements.length === 0) {
    return {
      timestamp: new Date().toISOString(),
      recommendations: [],
      summary: { total_scored: 0, above_threshold: 0, recommendations_generated: 0 },
      enrichment_metadata: { type: 'competitor_countermeasures', version: '1.0', source: 'competitive_monitoring_pipeline' },
    };
  }

  // Score all movements
  const scored = scoreMovements(movements, scoringOptions);
  const aboveThreshold = scored.filter(m => m.significance_score >= threshold);

  logger.log(`Countermeasure: ${scored.length} scored, ${aboveThreshold.length} above threshold (${threshold})`);

  // Generate recommendations for high-significance movements
  const recommendations = aboveThreshold.map(movement => {
    const category = classifyMovement(movement);
    const template = ACTION_TEMPLATES[category];

    return {
      app_name: movement.app_name,
      source: movement.source,
      significance_score: movement.significance_score,
      category,
      action: template.action,
      urgency: template.urgency,
      recommendation: template.template(movement),
      movement_data: {
        previous_position: movement.previous_position,
        current_position: movement.current_position,
        delta: movement.delta,
        direction: movement.direction,
        magnitude: movement.magnitude,
      },
    };
  });

  return {
    timestamp: new Date().toISOString(),
    recommendations,
    summary: {
      total_scored: scored.length,
      above_threshold: aboveThreshold.length,
      recommendations_generated: recommendations.length,
      avg_significance: scored.length > 0
        ? Math.round(scored.reduce((sum, m) => sum + m.significance_score, 0) / scored.length)
        : 0,
    },
    all_scored: scored,
    enrichment_metadata: {
      type: 'competitor_countermeasures',
      version: '1.0',
      source: 'competitive_monitoring_pipeline',
      threshold,
    },
  };
}
