/**
 * Opportunity Scorer Service
 * SD: AI-Generated Venture Idea Discovery
 *
 * Scores and classifies opportunities into three boxes:
 * - GREEN BOX: Quick wins (<90 days to capture)
 * - YELLOW BOX: Strategic investments (6-12 months, high ROI)
 * - RED BOX: Defensive priorities (competitive threats)
 *
 * Auto-approval logic:
 * - ≥85% confidence: Auto-approved
 * - 70-84% confidence: Pending review
 * - <70% confidence: Auto-rejected
 */

// Box thresholds (days)
const BOX_THRESHOLDS = {
  GREEN: 90,    // Quick wins: < 90 days
  YELLOW: 365   // Strategic: 90-365 days
  // RED: anything with threat indicator or > 365 days
};

// Confidence thresholds for auto-approval
const CONFIDENCE_THRESHOLDS = {
  AUTO_APPROVE: 85,
  PENDING_REVIEW: 70
  // Below 70 = auto-rejected
};

// Scoring weights
const SCORING_WEIGHTS = {
  market_opportunity: 0.25,
  competitive_advantage: 0.20,
  feasibility: 0.15,
  evidence_strength: 0.20,
  time_to_value: 0.10,
  risk_adjusted: 0.10
};

class OpportunityScorer {
  constructor(config = {}) {
    this.config = {
      thresholds: {
        ...BOX_THRESHOLDS,
        ...config.thresholds
      },
      confidenceThresholds: {
        ...CONFIDENCE_THRESHOLDS,
        ...config.confidenceThresholds
      },
      ...config
    };
  }

  /**
   * Score and classify a list of opportunities from gap analysis
   * @param {Array} opportunities - Opportunities from gap analyzer
   * @returns {Array} Scored and classified opportunities
   */
  scoreOpportunities(opportunities) {
    return opportunities.map(opp => this.scoreOpportunity(opp));
  }

  /**
   * Score and classify a single opportunity
   */
  scoreOpportunity(opportunity) {
    // Calculate base scores
    const marketScore = this.calculateMarketScore(opportunity);
    const competitiveScore = this.calculateCompetitiveScore(opportunity);
    const feasibilityScore = this.calculateFeasibilityScore(opportunity);
    const evidenceScore = this.calculateEvidenceScore(opportunity);
    const timeScore = this.calculateTimeScore(opportunity);
    const riskScore = this.calculateRiskScore(opportunity);

    // Calculate weighted overall score
    const overallScore = Math.round(
      marketScore * SCORING_WEIGHTS.market_opportunity +
      competitiveScore * SCORING_WEIGHTS.competitive_advantage +
      feasibilityScore * SCORING_WEIGHTS.feasibility +
      evidenceScore * SCORING_WEIGHTS.evidence_strength +
      timeScore * SCORING_WEIGHTS.time_to_value +
      riskScore * SCORING_WEIGHTS.risk_adjusted
    );

    // Determine box classification
    const classification = this.classifyOpportunity(opportunity, overallScore);

    // Determine approval status
    const approvalStatus = this.determineApprovalStatus(overallScore);

    return {
      ...opportunity,
      scores: {
        market_opportunity: marketScore,
        competitive_advantage: competitiveScore,
        feasibility: feasibilityScore,
        evidence_strength: evidenceScore,
        time_to_value: timeScore,
        risk_adjusted: riskScore,
        overall: overallScore
      },
      classification,
      approval_status: approvalStatus,
      confidence_score: overallScore
    };
  }

  /**
   * Calculate market opportunity score (0-100)
   */
  calculateMarketScore(opportunity) {
    let score = 50; // Base

    // Impact assessment
    const impact = opportunity.impact?.toLowerCase();
    if (impact === 'high') score += 35;
    else if (impact === 'medium') score += 20;
    else if (impact === 'low') score += 5;

    // Market size indicators
    if (opportunity.market_size === 'large' || opportunity.title?.toLowerCase().includes('enterprise')) {
      score += 10;
    }

    // Segment focus
    if (opportunity.dimension === 'segments') {
      score += 5; // Bonus for segment-based opportunities
    }

    return Math.min(100, score);
  }

  /**
   * Calculate competitive advantage score (0-100)
   */
  calculateCompetitiveScore(opportunity) {
    let score = 50; // Base

    // Differentiation potential
    if (opportunity.differentiation || opportunity.title?.toLowerCase().includes('unique')) {
      score += 20;
    }

    // Barrier to entry
    const difficulty = opportunity.difficulty || 3;
    if (difficulty >= 4) score += 15; // High barrier = good moat
    else if (difficulty <= 2) score -= 10; // Low barrier = easily copied

    // First mover potential
    if (opportunity.time_to_exploit?.includes('<90') || opportunity.time_to_exploit === 'short') {
      score += 15;
    }

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Calculate feasibility score (0-100)
   */
  calculateFeasibilityScore(opportunity) {
    let score = 70; // Optimistic base

    // Difficulty penalty
    const difficulty = opportunity.difficulty || 3;
    score -= (difficulty - 1) * 12; // -0 to -48 based on difficulty

    // Resource requirements
    if (opportunity.resource_intensive) {
      score -= 15;
    }

    // Technical complexity
    if (opportunity.dimension === 'integrations' || opportunity.dimension === 'quality') {
      score -= 10; // These typically require more technical work
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate evidence strength score (0-100)
   */
  calculateEvidenceScore(opportunity) {
    const bucket = opportunity.bucket?.toUpperCase();

    switch (bucket) {
      case 'FACT':
        return 95;
      case 'ASSUMPTION':
        return 70;
      case 'SIMULATION':
        return 50;
      case 'UNKNOWN':
        return 25;
      default:
        return 50;
    }
  }

  /**
   * Calculate time to value score (0-100)
   */
  calculateTimeScore(opportunity) {
    const timeToExploit = opportunity.time_to_exploit?.toLowerCase() || '';

    if (timeToExploit.includes('<90') || timeToExploit === 'short') {
      return 100;
    } else if (timeToExploit.includes('90-180') || timeToExploit === 'medium') {
      return 70;
    } else if (timeToExploit.includes('>180') || timeToExploit === 'long') {
      return 40;
    }

    return 60; // Default
  }

  /**
   * Calculate risk-adjusted score (0-100)
   */
  calculateRiskScore(opportunity) {
    let score = 70; // Base

    // Execution risk from difficulty
    const difficulty = opportunity.difficulty || 3;
    score -= difficulty * 8;

    // Market risk from evidence quality
    const bucket = opportunity.bucket?.toUpperCase();
    if (bucket === 'UNKNOWN') score -= 20;
    else if (bucket === 'SIMULATION') score -= 10;

    // Competition risk
    if (opportunity.is_defensive || opportunity.dimension === 'quality') {
      score -= 10; // Reactive rather than proactive
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Classify opportunity into Green/Yellow/Red box
   */
  classifyOpportunity(opportunity, overallScore) {
    const timeToExploit = opportunity.time_to_exploit?.toLowerCase() || '';
    const isDefensive = opportunity.is_defensive ||
                        opportunity.title?.toLowerCase().includes('threat') ||
                        opportunity.title?.toLowerCase().includes('risk');

    // RED BOX: Defensive priorities
    if (isDefensive || opportunity.dimension === 'quality') {
      return {
        box: 'red',
        label: 'Defensive Priority',
        description: 'Competitive threat requiring mitigation',
        recommendation: 'Monitor competitor moves and prepare defensive strategy',
        time_horizon: 'Ongoing'
      };
    }

    // GREEN BOX: Quick wins (<90 days)
    if (
      (timeToExploit.includes('<90') || timeToExploit === 'short') &&
      (opportunity.difficulty || 3) <= 3 &&
      overallScore >= 60
    ) {
      return {
        box: 'green',
        label: 'Quick Win',
        description: 'High-impact opportunity with fast execution path',
        recommendation: 'Execute within 90 days for fast market capture',
        time_horizon: '< 90 days'
      };
    }

    // YELLOW BOX: Strategic investments
    if (overallScore >= 50) {
      const estimatedDays = this.estimateTimeToCapture(opportunity);
      return {
        box: 'yellow',
        label: 'Strategic Investment',
        description: 'Significant opportunity requiring planned execution',
        recommendation: `Plan for ${estimatedDays}-day execution with substantial ROI`,
        time_horizon: `${estimatedDays} days`
      };
    }

    // Low-scoring opportunities still go to yellow for review
    return {
      box: 'yellow',
      label: 'Needs Evaluation',
      description: 'Opportunity requires further analysis',
      recommendation: 'Gather more data before committing resources',
      time_horizon: 'TBD'
    };
  }

  /**
   * Estimate time to capture in days
   */
  estimateTimeToCapture(opportunity) {
    const timeToExploit = opportunity.time_to_exploit?.toLowerCase() || '';
    const difficulty = opportunity.difficulty || 3;

    let baseDays = 120; // Default

    if (timeToExploit.includes('<90') || timeToExploit === 'short') {
      baseDays = 60;
    } else if (timeToExploit.includes('90-180') || timeToExploit === 'medium') {
      baseDays = 135;
    } else if (timeToExploit.includes('>180') || timeToExploit === 'long') {
      baseDays = 240;
    }

    // Adjust for difficulty
    baseDays += (difficulty - 3) * 30;

    return Math.max(30, Math.min(365, baseDays));
  }

  /**
   * Determine approval status based on confidence score
   */
  determineApprovalStatus(confidenceScore) {
    if (confidenceScore >= this.config.confidenceThresholds.AUTO_APPROVE) {
      return {
        status: 'auto_approved',
        label: 'Auto-Approved',
        reason: `Confidence score ${confidenceScore}% exceeds auto-approval threshold (${this.config.confidenceThresholds.AUTO_APPROVE}%)`
      };
    }

    if (confidenceScore >= this.config.confidenceThresholds.PENDING_REVIEW) {
      return {
        status: 'pending_review',
        label: 'Pending Review',
        reason: `Confidence score ${confidenceScore}% requires Chairman review`
      };
    }

    return {
      status: 'auto_rejected',
      label: 'Auto-Rejected',
      reason: `Confidence score ${confidenceScore}% below minimum threshold (${this.config.confidenceThresholds.PENDING_REVIEW}%)`
    };
  }

  /**
   * Get summary statistics for a set of scored opportunities
   */
  getSummaryStats(scoredOpportunities) {
    const stats = {
      total: scoredOpportunities.length,
      by_box: { green: 0, yellow: 0, red: 0 },
      by_status: { auto_approved: 0, pending_review: 0, auto_rejected: 0 },
      avg_score: 0,
      top_opportunities: []
    };

    let totalScore = 0;

    for (const opp of scoredOpportunities) {
      // Count by box
      const box = opp.classification?.box || 'yellow';
      stats.by_box[box]++;

      // Count by approval status
      const status = opp.approval_status?.status || 'pending_review';
      stats.by_status[status]++;

      // Sum scores
      totalScore += opp.scores?.overall || 0;
    }

    stats.avg_score = stats.total > 0 ? Math.round(totalScore / stats.total) : 0;

    // Get top 5 opportunities
    stats.top_opportunities = scoredOpportunities
      .filter(o => o.approval_status?.status !== 'auto_rejected')
      .sort((a, b) => (b.scores?.overall || 0) - (a.scores?.overall || 0))
      .slice(0, 5)
      .map(o => ({
        title: o.title,
        box: o.classification?.box,
        score: o.scores?.overall,
        status: o.approval_status?.status
      }));

    return stats;
  }
}

export default OpportunityScorer;
export { BOX_THRESHOLDS, CONFIDENCE_THRESHOLDS, SCORING_WEIGHTS };
