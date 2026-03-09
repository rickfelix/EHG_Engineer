/**
 * Competitive Baseline Service
 * SD: SD-LEO-INFRA-10X-VALUE-MULTIPLIER-001
 *
 * CRUD service for per-venture competitor data stored in
 * the `competitive_baselines` table. Provides multiplier
 * assessment computation with epistemic classification.
 */

const EPISTEMIC_TAGS = ['FACT', 'ASSUMPTION', 'SIMULATION', 'UNKNOWN'];
const BASELINE_TYPES = ['COMPETITOR', 'STATUS_QUO'];

const STATUS_QUO_DEFAULTS = {
  competitor_name: 'STATUS_QUO',
  baseline_type: 'STATUS_QUO',
  pricing_data: { model: 'manual_process', cost_per_unit: 0 },
  feature_coverage: { automation: 0, analytics: 0, integration: 0 },
  performance_metrics: { speed: 'manual', accuracy: 'variable', uptime: null },
  epistemic_tag: 'ASSUMPTION',
};

class CompetitiveBaselineService {
  constructor(supabase) {
    this.supabase = supabase;
  }

  /**
   * Create a new competitive baseline entry.
   * @param {Object} baseline
   * @returns {Promise<Object>} Created baseline
   */
  async create(baseline) {
    const { data, error } = await this.supabase
      .from('competitive_baselines')
      .insert({
        venture_id: baseline.venture_id,
        competitor_name: baseline.competitor_name,
        baseline_type: baseline.baseline_type || 'COMPETITOR',
        pricing_data: baseline.pricing_data || {},
        feature_coverage: baseline.feature_coverage || {},
        performance_metrics: baseline.performance_metrics || {},
        epistemic_tag: baseline.epistemic_tag || 'UNKNOWN',
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create baseline: ${error.message}`);
    return data;
  }

  /**
   * Get all baselines for a venture.
   * @param {string} ventureId
   * @returns {Promise<Array>} Baselines
   */
  async getByVentureId(ventureId) {
    const { data, error } = await this.supabase
      .from('competitive_baselines')
      .select('*')
      .eq('venture_id', ventureId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Failed to query baselines: ${error.message}`);
    return data || [];
  }

  /**
   * Update an existing baseline.
   * @param {string} id
   * @param {Object} updates
   * @returns {Promise<Object>} Updated baseline
   */
  async update(id, updates) {
    const { data, error } = await this.supabase
      .from('competitive_baselines')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update baseline: ${error.message}`);
    return data;
  }

  /**
   * Ensure at least one baseline exists for a venture.
   * If none exist, auto-creates a STATUS_QUO baseline.
   * @param {string} ventureId
   * @returns {Promise<Array>} All baselines for the venture
   */
  async ensureBaselines(ventureId) {
    const existing = await this.getByVentureId(ventureId);

    if (existing.length === 0) {
      const sqBaseline = await this.create({
        venture_id: ventureId,
        ...STATUS_QUO_DEFAULTS,
      });
      return [sqBaseline];
    }

    return existing;
  }

  /**
   * Compute a value multiplier assessment for a venture.
   *
   * Returns confidence-bounded intervals. STATUS_QUO-only
   * ventures get 1.5x wider intervals to reflect uncertainty.
   *
   * @param {string} ventureId
   * @param {Object} ventureData - Optional venture context
   * @returns {Promise<Object>} Assessment with { lower, upper, confidence, epistemic, baselines_used, has_real_competitors, sub_scores }
   */
  async computeMultiplierAssessment(ventureId, ventureData = {}) {
    const baselines = await this.ensureBaselines(ventureId);
    const hasRealCompetitors = baselines.some(b => b.baseline_type === 'COMPETITOR');

    // Classify overall epistemic quality
    const epistemicCounts = {};
    for (const b of baselines) {
      const tag = b.epistemic_tag || 'UNKNOWN';
      epistemicCounts[tag] = (epistemicCounts[tag] || 0) + 1;
    }
    const dominantEpistemic = Object.entries(epistemicCounts)
      .sort((a, b) => b[1] - a[1])[0][0];

    // Sub-scores
    const pricingScore = this._scorePricing(baselines, ventureData);
    const featureScore = this._scoreFeatures(baselines, ventureData);
    const performanceScore = this._scorePerformance(baselines, ventureData);

    const avgScore = (pricingScore + featureScore + performanceScore) / 3;

    // Confidence based on epistemic quality and data completeness
    let confidence = 0.5;
    if (dominantEpistemic === 'FACT') confidence = 0.85;
    else if (dominantEpistemic === 'ASSUMPTION') confidence = 0.6;
    else if (dominantEpistemic === 'SIMULATION') confidence = 0.45;
    else confidence = 0.3;

    // Adjust confidence by baseline count
    if (baselines.length >= 3) confidence = Math.min(1.0, confidence + 0.1);

    // Compute interval
    const baseMultiplier = 1 + (avgScore / 100) * 9; // Maps 0-100 → 1x-10x
    const intervalWidth = hasRealCompetitors ? 0.3 : 0.45; // STATUS_QUO gets 1.5x wider
    const lower = Math.max(1.0, Math.round((baseMultiplier * (1 - intervalWidth)) * 100) / 100);
    const upper = Math.round((baseMultiplier * (1 + intervalWidth)) * 100) / 100;

    return {
      lower,
      upper,
      confidence: Math.round(confidence * 100) / 100,
      epistemic: dominantEpistemic,
      baselines_used: baselines.length,
      has_real_competitors: hasRealCompetitors,
      sub_scores: {
        pricing: pricingScore,
        feature: featureScore,
        performance: performanceScore,
      },
    };
  }

  _scorePricing(baselines, ventureData) {
    if (!ventureData.pricing) return 50;
    const competitors = baselines.filter(b => b.pricing_data?.cost_per_unit > 0);
    if (competitors.length === 0) return 50;

    const avgCompetitorCost = competitors.reduce((s, b) => s + b.pricing_data.cost_per_unit, 0) / competitors.length;
    const ventureCost = ventureData.pricing.cost_per_unit || avgCompetitorCost;

    if (ventureCost === 0 || avgCompetitorCost === 0) return 50;
    const ratio = avgCompetitorCost / ventureCost;
    return Math.min(100, Math.max(0, Math.round(ratio * 25)));
  }

  _scoreFeatures(baselines, ventureData) {
    if (!ventureData.features) return 50;
    const competitors = baselines.filter(b => b.feature_coverage && Object.keys(b.feature_coverage).length > 0);
    if (competitors.length === 0) return 50;

    let totalCoverage = 0;
    for (const b of competitors) {
      const values = Object.values(b.feature_coverage).filter(v => typeof v === 'number');
      if (values.length > 0) {
        totalCoverage += values.reduce((s, v) => s + v, 0) / values.length;
      }
    }
    const avgCompCoverage = totalCoverage / competitors.length;

    // Higher score when competitors have LOW coverage (more room for us)
    return Math.min(100, Math.max(0, Math.round((1 - avgCompCoverage) * 100)));
  }

  _scorePerformance(baselines, ventureData) {
    if (!ventureData.performance) return 50;
    // Simple heuristic: if we have performance data and competitors don't, advantage
    const competitorsWithPerf = baselines.filter(
      b => b.performance_metrics && b.performance_metrics.speed && b.performance_metrics.speed !== 'manual'
    );
    if (competitorsWithPerf.length === 0) return 70; // No automated competitors = advantage
    return 50; // Neutral if competitors also have performance data
  }
}

export { CompetitiveBaselineService, EPISTEMIC_TAGS, BASELINE_TYPES, STATUS_QUO_DEFAULTS };
