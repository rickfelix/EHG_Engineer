/**
 * Pattern Scorer Service
 *
 * Calculates venture risk scores based on anti-pattern matches.
 * Part of SD-FAILURE-PATTERNS-001 - Anti-Pattern Library
 */

export interface FailurePattern {
  id: string;
  pattern_id: string;
  category: 'technical' | 'process' | 'communication' | 'resource' | 'market' | 'financial';
  severity: 'low' | 'medium' | 'high' | 'critical';
  pattern_name: string;
  description: string;
  impact_score: number;
  detection_signals: string[];
  prevention_measures: PreventionMeasure[];
  status: 'draft' | 'active' | 'deprecated' | 'archived';
}

export interface PreventionMeasure {
  measure: string;
  effectiveness: number;
  implementation_effort: 'low' | 'medium' | 'high';
}

export interface PatternMatch {
  pattern_id: string;
  pattern_name: string;
  category: string;
  severity: string;
  impact_score: number;
  matched_signals: string[];
  confidence: number;
}

export interface VentureRiskAssessment {
  venture_id: string;
  total_risk_score: number;
  risk_level: 'none' | 'low' | 'medium' | 'high' | 'critical';
  pattern_matches: PatternMatch[];
  high_risk_patterns: string[];
  recommendations: string[];
  assessed_at: Date;
}

/**
 * PatternScorer - Calculate venture risk based on anti-pattern detection
 */
export class PatternScorer {
  private patterns: FailurePattern[] = [];

  constructor(patterns?: FailurePattern[]) {
    if (patterns) {
      this.patterns = patterns;
    }
  }

  /**
   * Load patterns from database
   */
  async loadPatterns(supabase: any): Promise<void> {
    const { data, error } = await supabase
      .from('failure_patterns')
      .select('*')
      .eq('status', 'active');

    if (error) {
      throw new Error(`Failed to load patterns: ${error.message}`);
    }

    this.patterns = data || [];
  }

  /**
   * Score a venture against known anti-patterns
   */
  async scoreVenture(
    ventureId: string,
    ventureContext: VentureContext
  ): Promise<VentureRiskAssessment> {
    const matches: PatternMatch[] = [];

    for (const pattern of this.patterns) {
      const match = this.evaluatePattern(pattern, ventureContext);
      if (match) {
        matches.push(match);
      }
    }

    // Calculate total risk score
    const totalRiskScore = matches.reduce((sum, m) => sum + m.impact_score, 0);
    const avgRiskScore = matches.length > 0 ? totalRiskScore / matches.length : 0;

    // Determine risk level
    const riskLevel = this.calculateRiskLevel(avgRiskScore, matches);

    // Identify high-risk patterns
    const highRiskPatterns = matches
      .filter(m => m.severity === 'high' || m.severity === 'critical')
      .map(m => m.pattern_id);

    // Generate recommendations
    const recommendations = this.generateRecommendations(matches);

    return {
      venture_id: ventureId,
      total_risk_score: totalRiskScore,
      risk_level: riskLevel,
      pattern_matches: matches,
      high_risk_patterns: highRiskPatterns,
      recommendations,
      assessed_at: new Date(),
    };
  }

  /**
   * Evaluate a single pattern against venture context
   */
  private evaluatePattern(
    pattern: FailurePattern,
    context: VentureContext
  ): PatternMatch | null {
    const matchedSignals: string[] = [];
    let confidence = 0;

    // Check detection signals
    for (const signal of pattern.detection_signals || []) {
      if (this.signalMatches(signal, context)) {
        matchedSignals.push(signal);
      }
    }

    // Calculate confidence based on matched signals
    const totalSignals = pattern.detection_signals?.length || 1;
    confidence = (matchedSignals.length / totalSignals) * 100;

    // Only return match if confidence > 30%
    if (confidence < 30) {
      return null;
    }

    return {
      pattern_id: pattern.pattern_id,
      pattern_name: pattern.pattern_name,
      category: pattern.category,
      severity: pattern.severity,
      impact_score: Math.round(pattern.impact_score * (confidence / 100)),
      matched_signals: matchedSignals,
      confidence: Math.round(confidence),
    };
  }

  /**
   * Check if a signal matches the venture context
   */
  private signalMatches(signal: string, context: VentureContext): boolean {
    const signalLower = signal.toLowerCase();

    // Infrastructure cost signals
    if (signalLower.includes('infrastructure costs') && context.infrastructureCostRatio) {
      if (context.infrastructureCostRatio > 0.3) return true;
    }

    // Feature usage signals
    if (signalLower.includes('features with <5% usage') && context.lowUsageFeatureCount) {
      if (context.lowUsageFeatureCount > 0) return true;
    }

    // Runway signals
    if (signalLower.includes('months runway') && context.runwayMonths) {
      if (context.runwayMonths < 6) return true;
    }

    // Bus factor signals
    if (signalLower.includes('bus factor') && context.busFactor) {
      if (context.busFactor === 1) return true;
    }

    // Test coverage signals
    if (signalLower.includes('test coverage') && context.testCoverage) {
      if (context.testCoverage < 50) return true;
    }

    // Working hours signals
    if (signalLower.includes('working') && signalLower.includes('hours') && context.avgWorkingHours) {
      if (context.avgWorkingHours > 60) return true;
    }

    // Generic keyword matching as fallback
    for (const [key, value] of Object.entries(context.flags || {})) {
      if (signalLower.includes(key.toLowerCase()) && value) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate risk level from average score and matches
   */
  private calculateRiskLevel(
    avgScore: number,
    matches: PatternMatch[]
  ): 'none' | 'low' | 'medium' | 'high' | 'critical' {
    // Check for any critical severity matches
    if (matches.some(m => m.severity === 'critical' && m.confidence > 70)) {
      return 'critical';
    }

    if (matches.length === 0) return 'none';
    if (avgScore >= 80) return 'critical';
    if (avgScore >= 60) return 'high';
    if (avgScore >= 40) return 'medium';
    return 'low';
  }

  /**
   * Generate recommendations based on matched patterns
   */
  private generateRecommendations(matches: PatternMatch[]): string[] {
    const recommendations: string[] = [];

    // Sort by impact score to prioritize
    const sortedMatches = [...matches].sort((a, b) => b.impact_score - a.impact_score);

    for (const match of sortedMatches.slice(0, 5)) {
      const pattern = this.patterns.find(p => p.pattern_id === match.pattern_id);
      if (pattern?.prevention_measures?.[0]) {
        recommendations.push(
          `[${match.pattern_id}] ${pattern.prevention_measures[0].measure}`
        );
      }
    }

    return recommendations;
  }

  /**
   * Get pattern by ID
   */
  getPattern(patternId: string): FailurePattern | undefined {
    return this.patterns.find(p => p.pattern_id === patternId);
  }

  /**
   * Get all patterns by category
   */
  getPatternsByCategory(category: string): FailurePattern[] {
    return this.patterns.filter(p => p.category === category);
  }

  /**
   * Get high-severity patterns
   */
  getHighSeverityPatterns(): FailurePattern[] {
    return this.patterns.filter(p => p.severity === 'high' || p.severity === 'critical');
  }
}

/**
 * Venture context for pattern matching
 */
export interface VentureContext {
  // Financial
  runwayMonths?: number;
  burnRate?: number;
  infrastructureCostRatio?: number;

  // Team
  busFactor?: number;
  avgWorkingHours?: number;
  teamSize?: number;

  // Technical
  testCoverage?: number;
  techDebtRatio?: number;
  deploymentFrequency?: number;

  // Product
  lowUsageFeatureCount?: number;
  activationRate?: number;
  churnRate?: number;

  // Custom flags for signal matching
  flags?: Record<string, boolean>;
}

export default PatternScorer;
