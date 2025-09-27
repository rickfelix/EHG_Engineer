/**
 * LEAD Agent Over-Engineering Evaluation Rubric
 * Standardized criteria for evaluating Strategic Directives
 * Prevents subjective/inconsistent LEAD decisions
 */

class OverEngineeringRubric {
  constructor() {
    this.criteria = {
      complexity: {
        name: 'Technical Complexity vs Business Value',
        description: 'Ratio of technical complexity to actual business value delivered',
        scale: {
          1: 'Extremely complex with minimal business value - clear over-engineering',
          2: 'High complexity with limited business value - likely over-engineered',
          3: 'Moderate complexity with reasonable business value - balanced',
          4: 'Low complexity with good business value - well-scoped',
          5: 'Simple implementation with high business value - ideal'
        }
      },
      resourceIntensity: {
        name: 'Resource Intensity vs Urgency',
        description: 'Development effort required relative to business urgency',
        scale: {
          1: 'Massive effort required with no urgency - resource waste',
          2: 'High effort with low urgency - questionable timing',
          3: 'Moderate effort with moderate urgency - acceptable',
          4: 'Reasonable effort with good urgency - justified',
          5: 'Low effort with high urgency - high ROI'
        }
      },
      strategicAlignment: {
        name: 'Strategic Priority Alignment',
        description: 'Alignment with Stage 1 Ideation, EVA Assistant, and GTM priorities',
        scale: {
          1: 'No alignment with strategic priorities - misaligned',
          2: 'Weak alignment with strategic priorities - questionable',
          3: 'Some alignment with strategic priorities - acceptable',
          4: 'Good alignment with strategic priorities - strategic',
          5: 'Perfect alignment with multiple strategic priorities - critical'
        }
      },
      marketTiming: {
        name: 'Market Timing & Opportunity Window',
        description: 'Timing relative to market opportunity and competitive advantage',
        scale: {
          1: 'Poor timing, missed opportunity or too early - market misalignment',
          2: 'Questionable timing, limited opportunity - risky',
          3: 'Acceptable timing, moderate opportunity - reasonable',
          4: 'Good timing, clear opportunity window - advantageous',
          5: 'Perfect timing, critical opportunity - competitive advantage'
        }
      },
      riskAssessment: {
        name: 'Implementation & Business Risk',
        description: 'Technical and business risks vs potential rewards',
        scale: {
          1: 'Very high risk with low reward potential - dangerous',
          2: 'High risk with moderate reward potential - risky',
          3: 'Moderate risk with reasonable reward potential - manageable',
          4: 'Low risk with good reward potential - safe bet',
          5: 'Minimal risk with high reward potential - no-brainer'
        }
      },
      roiProjection: {
        name: 'Return on Investment Projection',
        description: 'Expected ROI considering all factors',
        scale: {
          1: 'Negative or minimal ROI expected - waste of resources',
          2: 'Low ROI expected - questionable investment',
          3: 'Moderate ROI expected - acceptable investment',
          4: 'Good ROI expected - solid investment',
          5: 'Excellent ROI expected - high-value investment'
        }
      }
    };

    // Thresholds for over-engineering determination
    this.thresholds = {
      overEngineered: 15, // Total score ≤15/30 indicates over-engineering
      criticalComplexity: 2, // Complexity score ≤2 is problematic
      lowStrategicAlignment: 2, // Strategic alignment ≤2 is concerning
      dangerousRisk: 2 // Risk assessment ≤2 is dangerous
    };
  }

  /**
   * Evaluate a Strategic Directive for over-engineering
   */
  evaluateSD(sd, manualScores = null) {
    const scores = manualScores || this.autoScore(sd);
    const totalScore = Object.values(scores).reduce((sum, score) => sum + score, 0);

    // Determine over-engineering status
    const isOverEngineered = this.determineOverEngineering(scores, totalScore);

    // Generate recommendation
    const recommendation = this.generateRecommendation(scores, totalScore, isOverEngineered);

    return {
      sdId: sd.id,
      title: sd.title,
      scores,
      totalScore,
      maxScore: 30,
      percentage: ((totalScore / 30) * 100).toFixed(1),
      isOverEngineered,
      recommendation,
      reasoning: this.generateReasoning(scores, totalScore, isOverEngineered),
      requiresHumanReview: this.requiresHumanReview(scores, totalScore)
    };
  }

  /**
   * Auto-score based on SD content analysis
   */
  autoScore(sd) {
    const text = [sd.title, sd.description, sd.scope, sd.strategic_intent, sd.strategic_objectives]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    // Strategic alignment detection
    const strategicKeywords = {
      stage1: ['ideation', 'innovation', 'validation', 'concept', 'pilot', 'mvp'],
      eva: ['eva', 'assistant', 'ai', 'automation', 'voice', 'chat'],
      gtm: ['gtm', 'go-to-market', 'sales', 'marketing', 'revenue', 'pricing']
    };

    let strategicMatches = 0;
    Object.values(strategicKeywords).forEach(keywords => {
      keywords.forEach(keyword => {
        if (text.includes(keyword)) strategicMatches++;
      });
    });

    // Complexity indicators
    const complexityIndicators = ['framework', 'architecture', 'system', 'infrastructure', 'pipeline', 'integration'];
    const complexityMatches = complexityIndicators.filter(indicator => text.includes(indicator)).length;

    // Business value indicators
    const businessValueIndicators = ['revenue', 'customer', 'user', 'value', 'benefit', 'improvement'];
    const businessValueMatches = businessValueIndicators.filter(indicator => text.includes(indicator)).length;

    // Generate scores based on analysis
    return {
      complexity: this.calculateComplexityScore(complexityMatches, businessValueMatches),
      resourceIntensity: this.calculateResourceScore(sd),
      strategicAlignment: Math.min(5, Math.max(1, strategicMatches > 0 ? 2 + strategicMatches : 1)),
      marketTiming: 3, // Default to moderate - requires human assessment
      riskAssessment: 3, // Default to moderate - requires human assessment
      roiProjection: Math.min(5, Math.max(1, businessValueMatches > 0 ? 2 + businessValueMatches : 2))
    };
  }

  calculateComplexityScore(complexityMatches, businessValueMatches) {
    if (complexityMatches > 3 && businessValueMatches === 0) return 1; // High complexity, no value
    if (complexityMatches > 2 && businessValueMatches <= 1) return 2; // High complexity, low value
    if (complexityMatches <= 1 && businessValueMatches >= 2) return 5; // Low complexity, high value
    if (complexityMatches <= 2 && businessValueMatches >= 1) return 4; // Reasonable balance
    return 3; // Moderate balance
  }

  calculateResourceScore(sd) {
    // Estimate based on scope and description length
    const scope = (sd.scope || '').length;
    const description = (sd.description || '').length;
    const totalLength = scope + description;

    if (totalLength > 1000) return 2; // Very detailed = high effort
    if (totalLength > 500) return 3; // Detailed = moderate effort
    if (totalLength > 200) return 4; // Reasonable detail = low effort
    return 5; // Brief = minimal effort
  }

  /**
   * Determine if SD is over-engineered based on scores
   */
  determineOverEngineering(scores, totalScore) {
    // Multiple criteria for over-engineering detection
    const conditions = [
      totalScore <= this.thresholds.overEngineered,
      scores.complexity <= this.thresholds.criticalComplexity && scores.strategicAlignment <= this.thresholds.lowStrategicAlignment,
      scores.riskAssessment <= this.thresholds.dangerousRisk && scores.roiProjection <= 2
    ];

    return conditions.some(condition => condition);
  }

  /**
   * Generate recommendation based on evaluation
   */
  generateRecommendation(scores, totalScore, isOverEngineered) {
    if (isOverEngineered) {
      if (totalScore <= 12) return 'CANCEL - Severely over-engineered, no business justification';
      if (scores.strategicAlignment <= 1) return 'DEFER - Poor strategic alignment, reconsider timing';
      return 'DOWNGRADE - Over-engineered, reduce scope or defer';
    }

    if (totalScore >= 25) return 'UPGRADE - Excellent strategic value, consider higher priority';
    if (totalScore >= 20) return 'APPROVE - Good balance, proceed as planned';
    return 'REVIEW - Marginal case, requires human judgment';
  }

  /**
   * Generate detailed reasoning for the evaluation
   */
  generateReasoning(scores, totalScore, isOverEngineered) {
    const reasons = [];

    if (scores.complexity <= 2) reasons.push('High technical complexity with limited business value');
    if (scores.strategicAlignment <= 2) reasons.push('Poor alignment with strategic priorities');
    if (scores.riskAssessment <= 2) reasons.push('High implementation or business risk');
    if (scores.roiProjection <= 2) reasons.push('Low expected return on investment');

    if (scores.complexity >= 4) reasons.push('Good complexity-to-value ratio');
    if (scores.strategicAlignment >= 4) reasons.push('Strong strategic alignment');
    if (totalScore >= 20) reasons.push('Overall strong business case');

    return reasons.length > 0 ? reasons : ['Evaluation based on standard criteria'];
  }

  /**
   * Determine if human review is required
   */
  requiresHumanReview(scores, totalScore) {
    // Always require human review for:
    return (
      totalScore <= 18 || // Borderline cases
      scores.complexity <= 2 || // High complexity concerns
      scores.strategicAlignment <= 2 || // Strategic misalignment
      Math.abs(totalScore - 18) <= 3 // Scores near the threshold
    );
  }

  /**
   * Format evaluation results for human review
   */
  formatForHumanReview(evaluation) {
    const { scores, totalScore, recommendation, reasoning } = evaluation;

    return {
      summary: `SD Evaluation: ${totalScore}/30 (${evaluation.percentage}%)`,
      recommendation,
      scores: Object.entries(scores).map(([key, score]) => ({
        criterion: this.criteria[key].name,
        score: `${score}/5`,
        description: this.criteria[key].scale[score]
      })),
      reasoning,
      requiresApproval: evaluation.requiresHumanReview,
      warningFlags: this.getWarningFlags(scores, totalScore)
    };
  }

  /**
   * Get warning flags for concerning scores
   */
  getWarningFlags(scores, totalScore) {
    const flags = [];

    if (totalScore <= 15) flags.push('🚨 TOTAL SCORE BELOW THRESHOLD');
    if (scores.complexity <= 2) flags.push('⚠️ HIGH COMPLEXITY CONCERN');
    if (scores.strategicAlignment <= 2) flags.push('⚠️ POOR STRATEGIC ALIGNMENT');
    if (scores.riskAssessment <= 2) flags.push('⚠️ HIGH RISK ASSESSMENT');
    if (scores.roiProjection <= 2) flags.push('⚠️ LOW ROI PROJECTION');

    return flags;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  export default OverEngineeringRubric;
}

// Example usage
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Over-Engineering Evaluation Rubric');
  console.log('==================================');
  console.log('');
  console.log('📋 Evaluation Criteria:');

  const rubric = new OverEngineeringRubric();
  Object.entries(rubric.criteria).forEach(([key, criterion]) => {
    console.log(`• ${criterion.name}`);
    console.log(`  ${criterion.description}`);
  });

  console.log('');
  console.log('🎯 Over-Engineering Thresholds:');
  console.log(`• Total Score ≤ ${rubric.thresholds.overEngineered}/30`);
  console.log(`• Complexity ≤ ${rubric.thresholds.criticalComplexity}/5 + Strategic Alignment ≤ ${rubric.thresholds.lowStrategicAlignment}/5`);
  console.log(`• Risk Assessment ≤ ${rubric.thresholds.dangerousRisk}/5`);
}