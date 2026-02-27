/**
 * Vision Governance Service
 * SD-MAN-INFRA-CORRECTIVE-ARCHITECTURE-GAP-002: FR-001
 *
 * Consolidates vision scoring, gap analysis, and corrective SD generation
 * into a single domain service, separating domain logic from EVA orchestration.
 */

import { getServiceFactory } from '../service-factory.js';

export class VisionGovernanceService {
  constructor(options = {}) {
    this._factory = options.factory || getServiceFactory();
    // Legacy: options.supabase still works for backward compatibility
    this._supabaseOverride = options.supabase || null;
    this._supabaseClient = null;
    this.visionKey = options.visionKey || 'VISION-EHG-L1-001';
    this.archKey = options.archKey || 'ARCH-EHG-L1-001';
  }

  /** @private Lazy-init Supabase client */
  async _getSupabase() {
    if (!this._supabaseClient) {
      this._supabaseClient = this._supabaseOverride || await this._factory.getSupabase();
    }
    return this._supabaseClient;
  }

  /** @deprecated Use _getSupabase() — kept for any code reading .supabase directly */
  get supabase() { return this._supabaseClient; }

  /**
   * Score the portfolio against vision and architecture dimensions.
   * Delegates to vision-scorer.js scoreSD().
   */
  async scorePortfolio(sdKey = null, options = {}) {
    const supabase = await this._getSupabase();
    const { scoreSD } = await import('./../../scripts/eva/vision-scorer.js');
    return scoreSD({
      sdKey,
      visionKey: this.visionKey,
      archKey: this.archKey,
      supabase,
      ...options,
    });
  }

  /**
   * Get current vision gaps from eva_vision_gaps.
   * @param {Object} [filters] - Optional filters
   * @param {string} [filters.status] - Gap status filter (default: 'open')
   * @param {string} [filters.sdId] - Filter by SD key
   * @returns {Promise<Array>} Gap records
   */
  async getGaps(filters = {}) {
    const { status = 'open', sdId } = filters;

    const supabase = await this._getSupabase();
    let query = supabase
      .from('eva_vision_gaps')
      .select('*')
      .order('dimension_score', { ascending: true });

    if (status) query = query.eq('status', status);
    if (sdId) query = query.eq('sd_id', sdId);

    const { data, error } = await query;
    if (error) throw new Error(`Gap query failed: ${error.message}`);
    return data || [];
  }

  /**
   * Generate corrective SDs from a vision score.
   * Delegates to corrective-sd-generator.mjs generateCorrectiveSD().
   */
  async generateCorrectiveSDs(scoreId) {
    const { generateCorrectiveSD } = await import('./../../scripts/eva/corrective-sd-generator.mjs');
    return generateCorrectiveSD(scoreId);
  }

  /**
   * Get latest portfolio score summary.
   * @returns {Promise<Object|null>} Latest score or null
   */
  async getLatestScore() {
    const supabase = await this._getSupabase();
    const { data, error } = await supabase
      .from('eva_vision_scores')
      .select('id, total_score, dimension_scores, threshold_action, rubric_snapshot, scored_at')
      .order('scored_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;
    return data;
  }

  /**
   * Get score history for trend analysis.
   * @param {number} [limit=10] - Number of scores to return
   * @returns {Promise<Array>} Score records ordered by date desc
   */
  async getScoreHistory(limit = 10) {
    const supabase = await this._getSupabase();
    const { data, error } = await supabase
      .from('eva_vision_scores')
      .select('id, total_score, dimension_scores, threshold_action, scored_at')
      .order('scored_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Score history query failed: ${error.message}`);
    return data || [];
  }

  /**
   * Get active corrective SDs.
   * @returns {Promise<Array>} Active corrective SD records
   */
  async getActiveCorrectiveSDs() {
    const supabase = await this._getSupabase();
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key, title, status, progress, vision_origin_score_id')
      .not('vision_origin_score_id', 'is', null)
      .not('status', 'in', '("completed","cancelled")')
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Corrective SD query failed: ${error.message}`);
    return data || [];
  }

  /**
   * Get venture lifecycle progression — which stages have artifacts.
   * SD-MAN-INFRA-CORRECTIVE-ARCHITECTURE-GAP-004: FR-002
   *
   * @param {string} ventureId - Venture UUID
   * @returns {Promise<Object>} Progression with completed/pending stages
   */
  async getVentureProgression(ventureId) {
    const supabase = await this._getSupabase();
    const { data, error } = await supabase
      .from('venture_artifacts')
      .select('lifecycle_stage')
      .eq('venture_id', ventureId)
      .eq('is_current', true);

    if (error) throw new Error(`Progression query failed: ${error.message}`);

    const completedStages = new Set((data || []).map(a => a.lifecycle_stage));
    const stages = [];
    for (let i = 1; i <= 25; i++) {
      stages.push({
        stage: i,
        status: completedStages.has(i) ? 'completed' : 'pending',
      });
    }

    return {
      ventureId,
      completedCount: completedStages.size,
      pendingCount: 25 - completedStages.size,
      stages,
    };
  }
}

export function createVisionGovernanceService(options = {}) {
  return new VisionGovernanceService(options);
}
