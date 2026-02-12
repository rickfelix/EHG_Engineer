/**
 * Competitive Intelligence Service (CLI Port)
 *
 * SD-LEO-FEAT-SERVICE-PORTS-001
 * CLI-compatible port of ehg/src/services/competitiveIntelligenceService.ts
 *
 * Differences from frontend:
 * - Supabase client injected via constructor (no frontend import)
 * - Edge Function calls are optional (graceful fallback to local analysis)
 * - No singleton export - caller creates instances with their own client
 *
 * @module lib/eva/services/competitive-intelligence
 */

/**
 * Competitive Intelligence Service.
 *
 * Provides AI-powered competitive analysis using Supabase Edge Functions
 * with local fallback analysis when the Edge Function is unavailable.
 */
export class CompetitiveIntelligenceService {
  /**
   * @param {Object} supabase - Supabase client instance
   * @param {Object} [options]
   * @param {Object} [options.logger] - Logger (defaults to console)
   */
  constructor(supabase, options = {}) {
    if (!supabase) throw new Error('Supabase client is required');
    this.supabase = supabase;
    this.logger = options.logger || console;
  }

  /**
   * Generate AI-powered competitive analysis via Edge Function.
   * Falls back to local analysis if the Edge Function is unavailable.
   *
   * @param {Object} ideaData - Venture/idea data
   * @param {Object[]} competitors - Array of competitor objects
   * @param {Object[]} features - Array of feature definitions
   * @param {Object[]} featureCoverage - Array of feature coverage mappings
   * @returns {Promise<Object>} AIAnalysisResult
   */
  async generateAnalysis(ideaData, competitors, features, featureCoverage) {
    try {
      const { data, error } = await this.supabase.functions.invoke('competitive-intelligence', {
        body: {
          action: 'analyze',
          ideaData,
          competitors,
          features,
          featureCoverage,
        },
      });

      if (error) throw error;
      return data;
    } catch (_error) {
      this.logger.warn?.('[CompetitiveIntelligence] Edge Function unavailable, using fallback analysis');
      return this.generateFallbackAnalysis(competitors, features, featureCoverage);
    }
  }

  /**
   * Generate fallback analysis from available data when AI is unavailable.
   *
   * @param {Object[]} competitors
   * @param {Object[]} features
   * @param {Object[]} featureCoverage
   * @returns {Object} AIAnalysisResult
   */
  generateFallbackAnalysis(competitors, features, featureCoverage) {
    const marketLeaders = (competitors || [])
      .filter(c => c.marketShareEstimate && c.marketShareEstimate > 20)
      .map(c => c.name)
      .slice(0, 3);

    const emergingThreats = (competitors || [])
      .filter(c => c.marketShareEstimate && c.marketShareEstimate > 5 && c.marketShareEstimate <= 20)
      .map(c => c.name)
      .slice(0, 3);

    const coverageScoreMap = { none: 0, basic: 1, advanced: 2, superior: 3 };
    const competitorCount = Math.max(1, (competitors || []).length);

    const marketGaps = (features || [])
      .filter(f => {
        const avgCoverage = (featureCoverage || [])
          .filter(fc => fc.featureKey === f.key)
          .reduce((acc, fc) => acc + (coverageScoreMap[fc.coverage] || 0), 0) / competitorCount;
        return avgCoverage < 1.5;
      })
      .map(f => f.label);

    return {
      competitiveLandscape: {
        marketLeaders,
        emergingThreats,
        marketGaps,
      },
      strategicInsights: {
        differentiationOpportunities: [
          'Focus on underserved market segments',
          'Enhance user experience design',
          'Develop unique integrations',
        ],
        competitiveAdvantages: [
          'Better pricing strategy',
          'Superior customer support',
          'More intuitive interface',
        ],
        vulnerabilities: [
          'Limited market presence',
          'Smaller user base',
          'Less brand recognition',
        ],
      },
      recommendations: {
        immediate: ['Conduct deeper competitor research', 'Identify key differentiators', 'Develop unique value proposition'],
        shortTerm: ['Build strategic partnerships', 'Enhance core features', 'Improve market positioning'],
        longTerm: ['Establish market leadership', 'Build sustainable competitive moats', 'Scale internationally'],
      },
      confidenceScore: 0.6,
    };
  }

  /**
   * Save competitive analysis to database.
   *
   * @param {string} ideaId
   * @param {Object} analysis - CompetitiveAnalysis object
   */
  async saveAnalysis(ideaId, analysis) {
    const strategies = (analysis.strategicRecommendations || []).map((recommendation, index) => ({
      idea_id: ideaId,
      recommendation,
      rationale: `Strategic recommendation ${index + 1} from competitive analysis`,
      category: 'product',
    }));

    if (strategies.length > 0) {
      const { error } = await this.supabase
        .from('market_defense_strategies')
        .upsert(strategies);

      if (error) throw error;
    }
  }

  /**
   * Load competitive analysis from database.
   *
   * @param {string} ideaId
   * @returns {Promise<Object>} { competitors, featureCoverage }
   */
  async loadAnalysis(ideaId) {
    const { data: competitors, error: competitorsError } = await this.supabase
      .from('competitors')
      .select('*')
      .eq('idea_id', ideaId);

    if (competitorsError) throw competitorsError;

    const competitorIds = (competitors || []).map(c => c.id);
    let featureCoverage = [];

    if (competitorIds.length > 0) {
      const { data: coverage, error: coverageError } = await this.supabase
        .from('feature_coverage')
        .select('*')
        .in('competitor_id', competitorIds);

      if (coverageError) throw coverageError;
      featureCoverage = coverage || [];
    }

    return {
      competitors: (competitors || []).map(c => ({
        id: c.id,
        name: c.name,
        website: c.website || '',
        marketSegment: c.market_segment || '',
        marketShareEstimate: c.market_share_estimate_pct || 0,
        strengths: [],
        weaknesses: [],
        pricingModel: c.pricing_notes || '',
        notes: c.notes || '',
      })),
      featureCoverage: featureCoverage.map(fc => ({
        featureKey: fc.feature_key,
        competitorId: fc.competitor_id,
        coverage: fc.coverage,
        notes: fc.notes || '',
      })),
    };
  }

  /**
   * Generate competitive KPI tracking via Edge Function.
   *
   * @param {string} ventureId
   * @param {Object[]} competitors
   * @returns {Promise<Object>}
   */
  async generateKPIAnalysis(ventureId, competitors) {
    try {
      const { data, error } = await this.supabase.functions.invoke('competitive-intelligence', {
        body: { action: 'kpi-analysis', ventureId, competitors },
      });

      if (error) throw error;
      return data;
    } catch {
      return {
        kpis: (competitors || []).map(comp => ({
          competitorId: comp.id,
          estimatedARR: null,
          growthRate: null,
          marketShare: comp.marketShareEstimate || 0,
          lastUpdated: new Date().toISOString(),
        })),
        insights: [
          'Competitor KPI tracking requires real-time data integration',
          'Consider setting up automated monitoring systems',
          'Focus on publicly available metrics for accurate tracking',
        ],
      };
    }
  }

  /**
   * Generate opportunity signals analysis via Edge Function.
   *
   * @param {string} ventureId
   * @param {Object[]} competitors
   * @returns {Promise<Object>}
   */
  async generateOpportunitySignals(ventureId, competitors) {
    try {
      const { data, error } = await this.supabase.functions.invoke('competitive-intelligence', {
        body: { action: 'opportunity-signals', ventureId, competitors },
      });

      if (error) throw error;
      return data;
    } catch {
      return {
        signals: [
          { type: 'market_gap', confidence: 0.7, description: 'Identified underserved market segment', recommendation: 'Focus on niche market needs' },
          { type: 'weak_moat', confidence: 0.6, description: 'Competitors have limited differentiation', recommendation: 'Build strong unique value proposition' },
        ],
      };
    }
  }
}
