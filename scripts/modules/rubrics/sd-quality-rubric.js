/**
 * SD Quality Rubric - Strategic Directive Quality Assessment
 *
 * Uses AI-powered Russian Judge multi-criterion weighted scoring (0-10 per criterion)
 * to evaluate Strategic Directive quality during LEAD phase.
 *
 * Criteria:
 * 1. Description Quality (35%) - WHAT + WHY + business value + technical approach
 * 2. Strategic Objectives Measurability (30%) - SMART criteria compliance
 * 3. Success Metrics Quantifiability (25%) - Baseline + target + method + timeline
 * 4. Risk Assessment Depth (10%) - Mitigation + contingency + probability
 *
 * @module rubrics/sd-quality-rubric
 * @version 1.0.0
 */

import { AIQualityEvaluator } from '../ai-quality-evaluator.js';

export class SDQualityRubric extends AIQualityEvaluator {
  constructor() {
    const rubricConfig = {
      contentType: 'sd',
      criteria: [
        {
          name: 'description_quality',
          weight: 0.35,
          prompt: `Evaluate the SD's description quality:
- 0-3: Missing, generic ("implement feature"), or pure boilerplate
- 4-6: Describes WHAT but not WHY, lacks business context
- 7-8: Clear WHAT + WHY with business value articulated
- 9-10: Comprehensive: WHAT + WHY + business value + technical approach + measurable impact

Score strictly - reserve 9-10 for truly exceptional descriptions that provide complete strategic context.`
        },
        {
          name: 'strategic_objectives_measurability',
          weight: 0.30,
          prompt: `Evaluate whether strategic objectives follow SMART criteria (Specific, Measurable, Achievable, Relevant, Time-bound):
- 0-3: No objectives or vague ("improve quality", "enhance UX")
- 4-6: Some specific but not measurable
- 7-8: Most objectives are specific and measurable (SMART)
- 9-10: All objectives follow SMART criteria with clear success metrics

Look for concrete, quantifiable objectives vs aspirational fluff.`
        },
        {
          name: 'success_metrics_quantifiability',
          weight: 0.25,
          prompt: `Evaluate the quality of success metrics:
- 0-3: No metrics or vague ("better performance")
- 4-6: Metrics with numbers but no baseline ("reduce by 50%")
- 7-8: Metrics with baseline and target ("reduce from 2s to 1s")
- 9-10: Complete metrics: baseline + target + measurement method + timeline

Score 9-10 only if metrics can be objectively measured and validated.`
        },
        {
          name: 'risk_assessment_depth',
          weight: 0.10,
          prompt: `Evaluate risk assessment quality:
- 0-3: No risks or listed without mitigation
- 4-6: Risks with basic mitigation ("test thoroughly")
- 7-8: Risks with specific mitigation strategies
- 9-10: Risks with mitigation + contingency plans + probability estimates

Look for proactive risk thinking, not just checkbox compliance.`
        }
      ]
    };

    super(rubricConfig);
  }

  /**
   * Format SD data for AI evaluation
   *
   * @param {Object} sd - Strategic Directive from database
   * @returns {string} Formatted content for evaluation
   */
  formatSDForEvaluation(sd) {
    return `# Strategic Directive: ${sd.title || sd.sd_id}

## Description
${sd.description || 'No description provided'}

## Strategic Objectives
${this.formatObjectives(sd.strategic_objectives)}

## Success Metrics
${this.formatSuccessMetrics(sd.success_metrics)}

## Risks
${this.formatRisks(sd.risks)}

## Additional Context
Priority Rank: ${sd.priority_rank || 'Not set'}
Status: ${sd.status || 'Not set'}
Current Phase: ${sd.current_phase || 'Not set'}`;
  }

  /**
   * Format strategic objectives for evaluation
   */
  formatObjectives(objectives) {
    if (!objectives || objectives.length === 0) {
      return 'No strategic objectives defined';
    }

    if (Array.isArray(objectives)) {
      return objectives.map((obj, idx) => {
        if (typeof obj === 'string') {
          return `${idx + 1}. ${obj}`;
        } else if (obj.objective) {
          return `${idx + 1}. ${obj.objective}`;
        }
        return `${idx + 1}. ${JSON.stringify(obj)}`;
      }).join('\n');
    }

    return JSON.stringify(objectives);
  }

  /**
   * Format success metrics for evaluation
   */
  formatSuccessMetrics(metrics) {
    if (!metrics || metrics.length === 0) {
      return 'No success metrics defined';
    }

    if (Array.isArray(metrics)) {
      return metrics.map((metric, idx) => {
        if (typeof metric === 'string') {
          return `${idx + 1}. ${metric}`;
        } else if (metric.metric) {
          const baseline = metric.baseline ? ` (Baseline: ${metric.baseline})` : '';
          const target = metric.target ? ` (Target: ${metric.target})` : '';
          const method = metric.measurement_method ? ` [Method: ${metric.measurement_method}]` : '';
          return `${idx + 1}. ${metric.metric}${baseline}${target}${method}`;
        }
        return `${idx + 1}. ${JSON.stringify(metric)}`;
      }).join('\n');
    }

    return JSON.stringify(metrics);
  }

  /**
   * Format risks for evaluation
   */
  formatRisks(risks) {
    if (!risks || risks.length === 0) {
      return 'No risks identified';
    }

    if (Array.isArray(risks)) {
      return risks.map((risk, idx) => {
        if (typeof risk === 'string') {
          return `${idx + 1}. ${risk}`;
        } else if (risk.risk) {
          const mitigation = risk.mitigation ? ` - Mitigation: ${risk.mitigation}` : '';
          const probability = risk.probability ? ` (Probability: ${risk.probability})` : '';
          return `${idx + 1}. ${risk.risk}${probability}${mitigation}`;
        }
        return `${idx + 1}. ${JSON.stringify(risk)}`;
      }).join('\n');
    }

    return JSON.stringify(risks);
  }

  /**
   * Validate SD quality using Russian Judge AI scoring
   *
   * @param {Object} sd - Strategic Directive from database
   * @returns {Promise<Object>} Validation result compatible with LEO Protocol
   */
  async validateSDQuality(sd) {
    try {
      // Format SD for evaluation
      const formattedContent = this.formatSDForEvaluation(sd);

      // Get SD ID (handle both 'id' and 'sd_id' column names)
      const sdId = sd.id || sd.sd_id;

      // Run AI evaluation
      const assessment = await this.evaluate(formattedContent, sdId);

      // Convert to LEO Protocol format
      return {
        passed: assessment.passed,
        score: assessment.weightedScore,
        issues: assessment.feedback.required,
        warnings: assessment.feedback.recommended,
        details: {
          criterion_scores: assessment.scores,
          weighted_score: assessment.weightedScore,
          threshold: 70,
          cost_usd: assessment.cost,
          duration_ms: assessment.duration
        }
      };
    } catch (error) {
      console.error('SD Quality Validation Error:', error);

      // Return failed validation on error
      return {
        passed: false,
        score: 0,
        issues: [`AI quality assessment failed: ${error.message}`],
        warnings: ['Manual review required'],
        details: {
          error: error.message
        }
      };
    }
  }
}
