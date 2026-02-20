/**
 * Vision Governance Service
 * SD-MAN-INFRA-CORRECTIVE-ARCHITECTURE-GAP-002: FR-001
 *
 * Consolidates vision scoring, gap analysis, and corrective SD generation
 * into a single domain service, separating domain logic from EVA orchestration.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

export class VisionGovernanceService {
  constructor(options = {}) {
    this.supabase = options.supabase || createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    this.visionKey = options.visionKey || 'VISION-EHG-L1-001';
    this.archKey = options.archKey || 'ARCH-EHG-L1-001';
  }

  /**
   * Score the portfolio against vision and architecture dimensions.
   * Delegates to vision-scorer.js scoreSD().
   */
  async scorePortfolio(sdKey = null, options = {}) {
    const { scoreSD } = await import('./../../scripts/eva/vision-scorer.js');
    return scoreSD({
      sdKey,
      visionKey: this.visionKey,
      archKey: this.archKey,
      supabase: this.supabase,
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

    let query = this.supabase
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
    const { data, error } = await this.supabase
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
    const { data, error } = await this.supabase
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
    const { data, error } = await this.supabase
      .from('strategic_directives_v2')
      .select('sd_key, title, status, progress, vision_origin_score_id')
      .not('vision_origin_score_id', 'is', null)
      .not('status', 'in', '("completed","cancelled")')
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Corrective SD query failed: ${error.message}`);
    return data || [];
  }
}

export function createVisionGovernanceService(options = {}) {
  return new VisionGovernanceService(options);
}
