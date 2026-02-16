/**
 * Vision Alignment Feasibility Rubric (Russian Judge Pattern)
 * Scores chairman_interests for implementation feasibility (0-10)
 *
 * Purpose: Evaluates scenario-driven interest cards for:
 * - Technical feasibility
 * - Resource availability
 * - Strategic alignment with chairman's pillars
 * - Story beat completeness
 * - Vision signal clarity
 *
 * Based on: lead-over-engineering-rubric.js pattern
 * YAML Config: docs/vision/rubric.yaml
 */

import { readFileSync } from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class VisionAlignmentFeasibilityRubric {
  constructor() {
    // Load vision rubric YAML for pillar alignment
    try {
      const rubricPath = path.join(__dirname, '../docs/vision/rubric.yaml');
      this.visionRubric = yaml.load(readFileSync(rubricPath, 'utf-8'));
    } catch (_error) {
      console.warn('⚠️  Warning: Could not load vision rubric YAML, using defaults');
      this.visionRubric = null;
    }

    // Feasibility scoring criteria (0-10 scale, Russian Judge pattern)
    this.criteria = {
      storyBeatCompleteness: {
        name: 'Story Beat Completeness',
        description: 'Are story beats well-defined with clear acceptance criteria?',
        weight: 0.20, // 20% of total score
        scale: {
          0: 'No story beats defined',
          2: 'Minimal beats, no acceptance criteria',
          4: 'Some beats defined, weak criteria',
          6: 'Beats defined with acceptance criteria',
          8: 'Well-structured beats with clear criteria',
          10: 'Comprehensive beats with measurable criteria'
        }
      },
      visionSignalClarity: {
        name: 'Vision Signal Clarity',
        description: 'Are vision signals measurable and aligned with chairman pillars?',
        weight: 0.20,
        scale: {
          0: 'No vision signals defined',
          2: 'Vague signals, not measurable',
          4: 'Some signals, weakly defined metrics',
          6: 'Clear signals with metrics',
          8: 'Well-defined signals with measurement methods',
          10: 'Comprehensive signals aligned with pillars'
        }
      },
      technicalFeasibility: {
        name: 'Technical Feasibility',
        description: 'Is this technically achievable with current infrastructure?',
        weight: 0.25,
        scale: {
          0: 'Not feasible with current technology',
          2: 'Very high technical risk, major unknowns',
          4: 'High technical risk, significant challenges',
          6: 'Moderate risk, manageable with effort',
          8: 'Low risk, proven technology exists',
          10: 'Minimal risk, straightforward implementation'
        }
      },
      resourceAvailability: {
        name: 'Resource Availability',
        description: 'Do we have the resources (time, people, budget) available?',
        weight: 0.20,
        scale: {
          0: 'No resources available',
          2: 'Severely constrained resources',
          4: 'Limited resources, competing priorities',
          6: 'Adequate resources with planning',
          8: 'Resources available with minor adjustments',
          10: 'Full resources available immediately'
        }
      },
      strategicAlignment: {
        name: 'Strategic Alignment',
        description: 'How well does this align with chairman\'s vision pillars?',
        weight: 0.15,
        scale: {
          0: 'No strategic alignment',
          2: 'Weak alignment, unclear value',
          4: 'Some alignment, indirect value',
          6: 'Good alignment with one pillar',
          8: 'Strong alignment with multiple pillars',
          10: 'Perfect alignment across all pillars'
        }
      }
    };

    // Feasibility thresholds
    this.thresholds = {
      notFeasible: 3, // Score ≤3 = not feasible
      lowFeasibility: 5, // Score ≤5 = low feasibility
      moderateFeasibility: 7, // Score ≤7 = moderate feasibility
      highFeasibility: 9, // Score >7 = high feasibility
      // Score 9-10 = highly feasible
    };
  }

  /**
   * Score a chairman_interest record for implementation feasibility
   *
   * @param {Object} chairmanInterest - Chairman interest record with vision alignment fields
   * @param {Array} chairmanInterest.story_beats - Story beat objects
   * @param {Array} chairmanInterest.vision_signals - Vision signal objects
   * @param {Array} chairmanInterest.coverage_nav_item_ids - Nav item coverage
   * @param {Object} manualScores - Optional manual scores override
   * @returns {Object} Feasibility evaluation result
   */
  scoreFeasibility(chairmanInterest, manualScores = null) {
    const scores = manualScores || this.autoScore(chairmanInterest);

    // Calculate weighted total score (0-10 scale)
    const weightedScore = Object.entries(scores).reduce((total, [key, score]) => {
      const weight = this.criteria[key].weight;
      return total + (score * weight);
    }, 0);

    const feasibilityScore = Math.round(weightedScore); // Round to integer 0-10

    // Determine feasibility status
    const feasibilityStatus = this.determineFeasibilityStatus(feasibilityScore);

    // Generate recommendation
    const recommendation = this.generateRecommendation(scores, feasibilityScore, feasibilityStatus);

    return {
      interestId: chairmanInterest.id,
      interestName: chairmanInterest.name,
      interestType: chairmanInterest.interest_type,
      scores,
      weightedScore: weightedScore.toFixed(2),
      feasibilityScore, // Integer 0-10 for database storage
      feasibilityStatus,
      recommendation,
      reasoning: this.generateReasoning(scores, feasibilityScore, feasibilityStatus),
      requiresHumanReview: this.requiresHumanReview(scores, feasibilityScore),
      warnings: this.getWarningFlags(scores, feasibilityScore)
    };
  }

  /**
   * Auto-score based on chairman_interest content analysis
   */
  autoScore(chairmanInterest) {
    const storyBeats = chairmanInterest.story_beats || [];
    const visionSignals = chairmanInterest.vision_signals || [];
    const coverageIds = chairmanInterest.coverage_nav_item_ids || [];
    const description = (chairmanInterest.name || '').toLowerCase();

    // Score story beat completeness
    const storyBeatScore = this.scoreStoryBeats(storyBeats);

    // Score vision signal clarity
    const visionSignalScore = this.scoreVisionSignals(visionSignals);

    // Score technical feasibility (heuristic based on description + complexity indicators)
    const technicalScore = this.scoreTechnicalFeasibility(description, storyBeats, coverageIds);

    // Score resource availability (heuristic based on scope)
    const resourceScore = this.scoreResourceAvailability(storyBeats, visionSignals, coverageIds);

    // Score strategic alignment (based on vision rubric pillars)
    const strategicScore = this.scoreStrategicAlignment(description, visionSignals);

    return {
      storyBeatCompleteness: storyBeatScore,
      visionSignalClarity: visionSignalScore,
      technicalFeasibility: technicalScore,
      resourceAvailability: resourceScore,
      strategicAlignment: strategicScore
    };
  }

  /**
   * Score story beats (0-10)
   */
  scoreStoryBeats(storyBeats) {
    if (!Array.isArray(storyBeats) || storyBeats.length === 0) return 0;

    let score = 2; // Base score for having any beats

    // Check for sequence numbers
    const hasSequences = storyBeats.every(beat => typeof beat.sequence === 'number');
    if (hasSequences) score += 2;

    // Check for descriptions
    const hasDescriptions = storyBeats.every(beat =>
      beat.description && beat.description.length > 10
    );
    if (hasDescriptions) score += 2;

    // Check for acceptance criteria
    const hasCriteria = storyBeats.every(beat =>
      Array.isArray(beat.acceptance_criteria) && beat.acceptance_criteria.length > 0
    );
    if (hasCriteria) score += 2;

    // Check for comprehensive criteria (multiple criteria per beat)
    const comprehensiveCriteria = storyBeats.every(beat =>
      Array.isArray(beat.acceptance_criteria) && beat.acceptance_criteria.length >= 2
    );
    if (comprehensiveCriteria) score += 2;

    return Math.min(10, score);
  }

  /**
   * Score vision signals (0-10)
   */
  scoreVisionSignals(visionSignals) {
    if (!Array.isArray(visionSignals) || visionSignals.length === 0) return 0;

    let score = 2; // Base score for having any signals

    // Check for signal types
    const hasTypes = visionSignals.every(signal =>
      signal.signal_type && signal.signal_type.length > 0
    );
    if (hasTypes) score += 2;

    // Check for target metrics
    const hasMetrics = visionSignals.every(signal =>
      signal.target_metric && signal.target_metric.length > 0
    );
    if (hasMetrics) score += 2;

    // Check for measurement methods
    const hasMethods = visionSignals.every(signal =>
      signal.measurement_method && signal.measurement_method.length > 0
    );
    if (hasMethods) score += 2;

    // Check for pillar alignment (if vision rubric loaded)
    if (this.visionRubric && this.visionRubric.pillars) {
      const pillarKeywords = Object.keys(this.visionRubric.pillars); // quality, efficiency, automation, governance, growth
      const alignedSignals = visionSignals.some(signal =>
        pillarKeywords.some(pillar =>
          signal.signal_type?.toLowerCase().includes(pillar)
        )
      );
      if (alignedSignals) score += 2;
    }

    return Math.min(10, score);
  }

  /**
   * Score technical feasibility (0-10)
   */
  scoreTechnicalFeasibility(description, storyBeats, coverageIds) {
    let score = 6; // Default: moderate feasibility

    // Detect high-risk indicators
    const highRiskIndicators = ['new', 'experimental', 'prototype', 'unknown', 'complex', 'integration'];
    const riskMatches = highRiskIndicators.filter(indicator =>
      description.includes(indicator)
    ).length;

    if (riskMatches > 2) score -= 4; // High risk
    else if (riskMatches > 0) score -= 2; // Moderate risk

    // Detect proven technology indicators
    const provenIndicators = ['existing', 'proven', 'standard', 'simple', 'straightforward'];
    const provenMatches = provenIndicators.filter(indicator =>
      description.includes(indicator)
    ).length;

    if (provenMatches > 1) score += 2;

    // Story beat complexity (more beats = higher complexity)
    if (storyBeats.length > 10) score -= 2;
    else if (storyBeats.length > 5) score -= 1;

    // Coverage breadth (more nav items = broader scope = higher complexity)
    if (coverageIds.length > 10) score -= 2;
    else if (coverageIds.length > 5) score -= 1;

    return Math.max(0, Math.min(10, score));
  }

  /**
   * Score resource availability (0-10)
   */
  scoreResourceAvailability(storyBeats, visionSignals, coverageIds) {
    let score = 6; // Default: adequate resources with planning

    // Scope indicators
    const totalScope = storyBeats.length + visionSignals.length + coverageIds.length;

    if (totalScope > 30) score -= 4; // Very large scope
    else if (totalScope > 15) score -= 2; // Large scope
    else if (totalScope < 5) score += 2; // Small scope, resources likely available

    return Math.max(0, Math.min(10, score));
  }

  /**
   * Score strategic alignment (0-10)
   */
  scoreStrategicAlignment(description, visionSignals) {
    let score = 4; // Default: some alignment

    if (!this.visionRubric || !this.visionRubric.pillars) {
      return score; // Can't assess without rubric
    }

    const pillars = Object.keys(this.visionRubric.pillars); // quality, efficiency, automation, governance, growth

    // Check description alignment
    const descriptionMatches = pillars.filter(pillar =>
      description.includes(pillar)
    ).length;

    score += descriptionMatches * 2; // +2 per pillar keyword

    // Check vision signal alignment
    const signalMatches = visionSignals.filter(signal =>
      pillars.some(pillar =>
        signal.signal_type?.toLowerCase().includes(pillar) ||
        signal.target_metric?.toLowerCase().includes(pillar)
      )
    ).length;

    if (signalMatches > 0) score += 2;

    return Math.min(10, score);
  }

  /**
   * Determine feasibility status from score
   */
  determineFeasibilityStatus(score) {
    if (score <= this.thresholds.notFeasible) return 'NOT_FEASIBLE';
    if (score <= this.thresholds.lowFeasibility) return 'LOW_FEASIBILITY';
    if (score <= this.thresholds.moderateFeasibility) return 'MODERATE_FEASIBILITY';
    if (score <= this.thresholds.highFeasibility) return 'HIGH_FEASIBILITY';
    return 'HIGHLY_FEASIBLE';
  }

  /**
   * Generate recommendation based on feasibility
   */
  generateRecommendation(scores, feasibilityScore, feasibilityStatus) {
    if (feasibilityStatus === 'NOT_FEASIBLE') {
      return 'REJECT - Not feasible with current resources/technology';
    }
    if (feasibilityStatus === 'LOW_FEASIBILITY') {
      return 'DEFER - Low feasibility, requires significant investment';
    }
    if (feasibilityStatus === 'MODERATE_FEASIBILITY') {
      return 'CONDITIONAL - Feasible with planning and resource allocation';
    }
    if (feasibilityStatus === 'HIGH_FEASIBILITY') {
      return 'APPROVE - Highly feasible, ready for implementation';
    }
    return 'PRIORITIZE - Highly feasible, consider immediate action';
  }

  /**
   * Generate reasoning for the evaluation
   */
  generateReasoning(scores, _feasibilityScore, _feasibilityStatus) {
    const reasons = [];

    // Negative indicators
    if (scores.storyBeatCompleteness <= 4) {
      reasons.push('Story beats incomplete or lack clear acceptance criteria');
    }
    if (scores.visionSignalClarity <= 4) {
      reasons.push('Vision signals not well-defined or lack measurement methods');
    }
    if (scores.technicalFeasibility <= 4) {
      reasons.push('High technical risk or feasibility concerns');
    }
    if (scores.resourceAvailability <= 4) {
      reasons.push('Limited resource availability or competing priorities');
    }
    if (scores.strategicAlignment <= 4) {
      reasons.push('Weak strategic alignment with chairman pillars');
    }

    // Positive indicators
    if (scores.storyBeatCompleteness >= 8) {
      reasons.push('Well-structured story beats with clear acceptance criteria');
    }
    if (scores.visionSignalClarity >= 8) {
      reasons.push('Clear vision signals with measurable metrics and methods');
    }
    if (scores.technicalFeasibility >= 8) {
      reasons.push('Low technical risk, proven technology available');
    }
    if (scores.resourceAvailability >= 8) {
      reasons.push('Resources available with minor adjustments');
    }
    if (scores.strategicAlignment >= 8) {
      reasons.push('Strong strategic alignment with chairman pillars');
    }

    return reasons.length > 0 ? reasons : ['Evaluation based on rubric criteria'];
  }

  /**
   * Determine if human review is required
   */
  requiresHumanReview(scores, feasibilityScore) {
    return (
      feasibilityScore <= 5 || // Borderline or low feasibility
      scores.technicalFeasibility <= 4 || // High technical risk
      scores.strategicAlignment <= 4 || // Weak strategic alignment
      Math.abs(feasibilityScore - 5) <= 1 // Scores near the threshold
    );
  }

  /**
   * Get warning flags for concerning scores
   */
  getWarningFlags(scores, feasibilityScore) {
    const flags = [];

    if (feasibilityScore <= 3) {
      flags.push('🚨 NOT FEASIBLE - Do not proceed without major changes');
    }
    if (scores.storyBeatCompleteness <= 2) {
      flags.push('⚠️ STORY BEATS MISSING OR INCOMPLETE');
    }
    if (scores.visionSignalClarity <= 2) {
      flags.push('⚠️ VISION SIGNALS NOT DEFINED');
    }
    if (scores.technicalFeasibility <= 4) {
      flags.push('⚠️ HIGH TECHNICAL RISK');
    }
    if (scores.resourceAvailability <= 4) {
      flags.push('⚠️ RESOURCE CONSTRAINTS');
    }
    if (scores.strategicAlignment <= 4) {
      flags.push('⚠️ WEAK STRATEGIC ALIGNMENT');
    }

    return flags;
  }

  /**
   * Format evaluation results for human review
   */
  formatForHumanReview(evaluation) {
    const { scores, feasibilityScore, recommendation, reasoning } = evaluation;

    return {
      summary: `Feasibility Score: ${feasibilityScore}/10 (${evaluation.feasibilityStatus})`,
      recommendation,
      scores: Object.entries(scores).map(([key, score]) => ({
        criterion: this.criteria[key].name,
        score: `${score}/10`,
        weight: `${(this.criteria[key].weight * 100).toFixed(0)}%`,
        description: this.getScoreDescription(key, score)
      })),
      reasoning,
      requiresApproval: evaluation.requiresHumanReview,
      warningFlags: evaluation.warnings
    };
  }

  /**
   * Get human-readable description for a score
   */
  getScoreDescription(criterionKey, score) {
    const criterion = this.criteria[criterionKey];
    const scale = criterion.scale;

    // Find closest scale point
    const scalePoints = Object.keys(scale).map(Number).sort((a, b) => a - b);
    let closestPoint = scalePoints[0];

    for (const point of scalePoints) {
      if (Math.abs(point - score) < Math.abs(closestPoint - score)) {
        closestPoint = point;
      }
    }

    return scale[closestPoint];
  }
}

// Export for use in other modules
export default VisionAlignmentFeasibilityRubric;

// CLI usage
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const { createDatabaseClient } = await import('./lib/supabase-connection.js');

  const args = process.argv.slice(2);
  const interestIdArg = args.find(arg => arg.startsWith('--interest-id='));

  if (interestIdArg) {
    // Score specific chairman_interest
    const interestId = interestIdArg.split('=')[1];

    console.log(`\n🔍 Scoring feasibility for chairman_interest ${interestId}...\n`);

    const client = await createDatabaseClient('engineer', { verify: false });

    const result = await client.query(
      'SELECT * FROM chairman_interests WHERE id = $1',
      [interestId]
    );

    await client.end();

    if (result.rows.length === 0) {
      console.error(`❌ Error: chairman_interest ${interestId} not found`);
      process.exit(1);
    }

    const chairmanInterest = result.rows[0];

    const rubric = new VisionAlignmentFeasibilityRubric();
    const evaluation = rubric.scoreFeasibility(chairmanInterest);
    const formatted = rubric.formatForHumanReview(evaluation);

    // Display results
    console.log('📊 FEASIBILITY EVALUATION RESULTS');
    console.log('═'.repeat(70));
    console.log(`\nInterest: ${evaluation.interestName}`);
    console.log(`Type: ${evaluation.interestType}`);
    console.log(`ID: ${evaluation.interestId}\n`);
    console.log(formatted.summary);
    console.log(`\n🎯 Recommendation: ${formatted.recommendation}\n`);

    if (formatted.warningFlags.length > 0) {
      console.log('⚠️  Warning Flags:');
      formatted.warningFlags.forEach(flag => console.log(`   ${flag}`));
      console.log('');
    }

    console.log('📋 Detailed Scores:');
    formatted.scores.forEach(score => {
      console.log(`   ${score.criterion}: ${score.score} (weight: ${score.weight})`);
      console.log(`   → ${score.description}\n`);
    });

    console.log('💡 Reasoning:');
    formatted.reasoning.forEach(reason => console.log(`   • ${reason}`));
    console.log('');

    console.log(`${formatted.requiresApproval ? '⚠️' : '✅'} Human Review: ${formatted.requiresApproval ? 'REQUIRED' : 'Optional'}\n`);

    // Update database with feasibility_score
    console.log('💾 Updating database with feasibility_score...');
    const updateClient = await createDatabaseClient('engineer', { verify: false });
    await updateClient.query(
      'UPDATE chairman_interests SET feasibility_score = $1 WHERE id = $2',
      [evaluation.feasibilityScore, interestId]
    );
    await updateClient.end();
    console.log(`✅ Updated feasibility_score to ${evaluation.feasibilityScore}\n`);

    process.exit(evaluation.feasibilityScore <= 3 ? 1 : 0);
  } else {
    // Show criteria only
    console.log('Vision Alignment Feasibility Rubric');
    console.log('===================================');
    console.log('');
    console.log('📋 Evaluation Criteria (Russian Judge Pattern):');

    const rubric = new VisionAlignmentFeasibilityRubric();
    Object.entries(rubric.criteria).forEach(([_key, criterion]) => {
      console.log(`\n• ${criterion.name} (weight: ${(criterion.weight * 100).toFixed(0)}%)`);
      console.log(`  ${criterion.description}`);
      console.log('  Scale:');
      Object.entries(criterion.scale).forEach(([score, desc]) => {
        console.log(`    ${score}/10: ${desc}`);
      });
    });

    console.log('');
    console.log('🎯 Feasibility Thresholds:');
    console.log(`• Score ≤ ${rubric.thresholds.notFeasible}: NOT FEASIBLE`);
    console.log(`• Score ≤ ${rubric.thresholds.lowFeasibility}: LOW FEASIBILITY`);
    console.log(`• Score ≤ ${rubric.thresholds.moderateFeasibility}: MODERATE FEASIBILITY`);
    console.log(`• Score ≤ ${rubric.thresholds.highFeasibility}: HIGH FEASIBILITY`);
    console.log('• Score 9-10: HIGHLY FEASIBLE');
    console.log('');
    console.log('Usage: node vision-alignment-feasibility-rubric.js --interest-id=<UUID>');
  }
}
