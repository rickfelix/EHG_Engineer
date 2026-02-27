/**
 * Sibling Context Analyzer for SD Type Classification
 *
 * Queries sibling SDs from the same orchestrator parent to infer
 * type patterns. When 60%+ of siblings share a type, recommends
 * that type for the current SD.
 *
 * @module sd-type-sibling-context
 * @version 1.0.0
 * @sd SD-LEO-INFRA-TYPE-CONTENT-BASED-001
 */

import dotenv from 'dotenv';
dotenv.config();

// Cache sibling context per parent_sd_id to avoid repeated queries
const siblingCache = new Map();

export class SiblingContextAnalyzer {
  constructor(supabase = null) {
    this.supabase = supabase;
  }

  /**
   * Lazily initialize Supabase client
   */
  async getSupabase() {
    if (this.supabase) return this.supabase;

    try {
      const { createClient } = await import('@supabase/supabase-js');
      this.supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      return this.supabase;
    } catch {
      return null;
    }
  }

  /**
   * Analyze sibling SDs for type consensus
   *
   * @param {Object} sd - Current Strategic Directive
   * @param {string} sd.id - SD UUID
   * @param {string} sd.parent_sd_id - Parent orchestrator UUID (null if standalone)
   * @returns {Promise<Object|null>} Sibling context result or null if not applicable
   */
  async analyze(sd) {
    // Only applicable for child SDs (has parent)
    if (!sd.parent_sd_id) {
      return null;
    }

    // Check cache
    if (siblingCache.has(sd.parent_sd_id)) {
      const cached = siblingCache.get(sd.parent_sd_id);
      return this._computeConsensus(cached, sd.id);
    }

    const supabase = await this.getSupabase();
    if (!supabase) return null;

    try {
      // Query all siblings (children of the same parent, excluding current SD)
      const { data: siblings, error } = await supabase
        .from('strategic_directives_v2')
        .select('id, sd_type, title')
        .eq('parent_sd_id', sd.parent_sd_id)
        .neq('id', sd.id);

      if (error || !siblings || siblings.length === 0) {
        return null;
      }

      // Cache the sibling data
      siblingCache.set(sd.parent_sd_id, siblings);

      return this._computeConsensus(siblings, sd.id);
    } catch {
      return null;
    }
  }

  /**
   * Compute type consensus from siblings
   * @param {Array} siblings - Array of sibling SD objects
   * @param {string} currentSdId - Current SD's UUID (to exclude)
   * @returns {Object|null} Consensus result
   */
  _computeConsensus(siblings, currentSdId) {
    // Filter out current SD if still in the list
    const others = siblings.filter(s => s.id !== currentSdId);
    if (others.length === 0) return null;

    // Count types
    const typeCounts = {};
    for (const sibling of others) {
      const type = sibling.sd_type || 'feature';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    }

    // Find the dominant type
    const sorted = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1]);

    const [topType, topCount] = sorted[0];
    const totalSiblings = others.length;
    const consensusRatio = topCount / totalSiblings;

    // Require 60% consensus
    if (consensusRatio < 0.6) {
      return {
        recommendedType: null,
        confidence: 0,
        consensusRatio,
        totalSiblings,
        typeCounts,
        source: 'sibling_context',
        reason: `No consensus: ${Object.entries(typeCounts).map(([t, c]) => `${t}(${c})`).join(', ')}`
      };
    }

    return {
      recommendedType: topType,
      confidence: Math.round(consensusRatio * 100),
      consensusRatio,
      totalSiblings,
      typeCounts,
      source: 'sibling_context',
      reason: `${topCount}/${totalSiblings} siblings are '${topType}' (${Math.round(consensusRatio * 100)}% consensus)`
    };
  }

  /**
   * Clear the sibling cache (for testing)
   */
  static clearCache() {
    siblingCache.clear();
  }
}

export default SiblingContextAnalyzer;
