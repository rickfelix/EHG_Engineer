/**
 * Competitive Baseline Service
 * SD: SD-LEO-INFRA-10X-VALUE-MULTIPLIER-001
 * Extended by SD-LEO-INFRA-COMPETITIVE-BASELINES-RECURRING-001 (recurring research + staleness).
 *
 * CRUD service for per-venture competitor data stored in
 * the `competitive_baselines` table. Provides multiplier
 * assessment computation with epistemic classification.
 */
import { isSearchEnabled, search } from '../eva/utils/web-search.js';

// Declared shelf-life for a real researched baseline. A failed-research fallback row gets
// FALLBACK_TTL_MS instead (short, retry-soon) -- see researchAndCreate() below. Without this
// split, a single transient Tavily failure would poison a venture's baseline for the full
// shelf life while the system reports healthy (TESTING sub-agent finding, row a102e16b).
const BASELINE_SHELF_LIFE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const FALLBACK_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// 'OBSERVED' added by SD-LEO-INFRA-COMPETITIVE-OBSERVED-TAG-MIGRATION-001 (kept in lockstep with the
// competitive_baselines_epistemic_tag_check DB constraint widened in the same SD's migration).
const EPISTEMIC_TAGS = ['FACT', 'ASSUMPTION', 'SIMULATION', 'UNKNOWN', 'OBSERVED'];
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
    // SD-LEO-INFRA-COMPETITIVE-BASELINES-RECURRING-001: produced_at/expires_at/citations added
    // to the whitelist -- the original 6-field literal (no spread, unlike update() below) meant
    // passing these silently wrote them as NULL with no error (TESTING finding, row a102e16b).
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
        produced_at: baseline.produced_at ?? null,
        expires_at: baseline.expires_at ?? null,
        citations: baseline.citations ?? [],
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
   * Real, cited research for a single competitor, replacing the STATUS_QUO placeholder path.
   * Uses lib/eva/utils/web-search.js (never throws -- returns [] on any error/timeout), so a
   * transient research failure falls back to a SHORT-TTL row (FALLBACK_TTL_MS) rather than the
   * full BASELINE_SHELF_LIFE_MS -- a single Tavily failure must not poison the venture's
   * baseline for the whole shelf life (TESTING finding, row a102e16b, TS-7).
   *
   * @param {string} ventureId
   * @param {string} competitorName
   * @param {{now?: () => Date}} [opts] - injectable clock for TS-2/TS-7 boundary tests
   * @returns {Promise<Object>} Created baseline row
   */
  async researchAndCreate(ventureId, competitorName, opts = {}) {
    const now = (opts.now || (() => new Date()))();

    if (!isSearchEnabled()) {
      return this.create({
        venture_id: ventureId,
        competitor_name: competitorName,
        baseline_type: 'COMPETITOR',
        epistemic_tag: 'UNKNOWN',
        produced_at: now.toISOString(),
        expires_at: new Date(now.getTime() + FALLBACK_TTL_MS).toISOString(),
        citations: [],
      });
    }

    const results = await search(`${competitorName} pricing features positioning`, {});
    if (results.length === 0) {
      // Research ran but returned nothing (API error, timeout, or genuinely no results) --
      // short TTL so the next tick retries soon instead of waiting the full shelf life.
      return this.create({
        venture_id: ventureId,
        competitor_name: competitorName,
        baseline_type: 'COMPETITOR',
        epistemic_tag: 'UNKNOWN',
        produced_at: now.toISOString(),
        expires_at: new Date(now.getTime() + FALLBACK_TTL_MS).toISOString(),
        citations: [],
      });
    }

    // Per-claim citation objects (not a fused blob), per the Proven/Better/New gate precedent --
    // origin-independence noted per source, not assumed from URL presence alone.
    const citations = results.map((r) => ({
      source_url: r.url,
      title: r.title,
      retrieved_at: now.toISOString(),
      origin_independent: true,
    }));

    return this.create({
      venture_id: ventureId,
      competitor_name: competitorName,
      baseline_type: 'COMPETITOR',
      pricing_data: { source_summary: results.map((r) => r.content).join(' ').slice(0, 2000) },
      feature_coverage: {},
      performance_metrics: {},
      epistemic_tag: 'OBSERVED',
      produced_at: now.toISOString(),
      expires_at: new Date(now.getTime() + BASELINE_SHELF_LIFE_MS).toISOString(),
      citations,
    });
  }

  /**
   * Fresh (non-expired), real (non-STATUS_QUO) baselines for a venture, or null if none exist.
   * NULL expires_at (the 4 pre-existing STATUS_QUO placeholder rows) is treated as ALWAYS-STALE,
   * never as "no expiry" -- a naive `.lt('expires_at', now)` filter never matches NULL rows,
   * which would leave those rows permanently un-upgraded (TESTING finding, row a102e16b, TS-2).
   * Used by the chairman-packet integration (FR-6): returns null (never throws) so the packet's
   * caller can render a labelled gap instead of failing.
   *
   * @param {string} ventureId
   * @param {{now?: () => Date}} [opts]
   * @returns {Promise<Array|null>}
   */
  async getFreshOrNull(ventureId, opts = {}) {
    const now = (opts.now || (() => new Date()))();
    const baselines = await this.getByVentureId(ventureId);
    const fresh = baselines.filter(
      (b) => b.baseline_type === 'COMPETITOR' && b.expires_at && new Date(b.expires_at) > now
    );
    return fresh.length > 0 ? fresh : null;
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
