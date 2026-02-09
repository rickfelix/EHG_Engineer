/**
 * Retrospectives Retrieval Adapter
 * Queries retrospectives table for relevant learnings filtered by domain/category
 *
 * SD-LEO-ORCH-AGENT-EXPERIENCE-FACTORY-001-A (FR-2)
 */

import { BaseAdapter } from './base-adapter.js';

export class RetrospectivesAdapter extends BaseAdapter {
  constructor(supabase) {
    super('retrospectives', supabase);
  }

  async _doFetch({ domain, category, limit = 5 }) {
    // Build filter chain before terminal calls (order/limit)
    let query = this.supabase
      .from('retrospectives')
      .select('id, sd_id, title, key_learnings, what_went_well, what_needs_improvement, action_items, success_patterns, failure_patterns, learning_category, quality_score, tags, created_at')
      .not('key_learnings', 'is', null);

    // Apply filters before order/limit
    if (category) {
      query = query.eq('learning_category', category);
    }
    if (domain && !category) {
      query = query.contains('tags', [domain]);
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`retrospectives query failed: ${error.message}`);

    return {
      items: (data || []).map(r => ({
        id: r.id,
        source: 'retrospectives',
        title: r.title || `Retro for ${r.sd_id}`,
        sdId: r.sd_id,
        learnings: this._extractLearnings(r),
        successPatterns: r.success_patterns || [],
        failurePatterns: r.failure_patterns || [],
        qualityScore: r.quality_score,
        category: r.learning_category,
        createdAt: r.created_at,
        _raw: r
      }))
    };
  }

  _extractLearnings(retro) {
    const learnings = [];

    if (retro.key_learnings) {
      const kl = Array.isArray(retro.key_learnings)
        ? retro.key_learnings
        : [retro.key_learnings];
      learnings.push(...kl.slice(0, 3));
    }

    if (retro.what_needs_improvement) {
      const wni = Array.isArray(retro.what_needs_improvement)
        ? retro.what_needs_improvement
        : [retro.what_needs_improvement];
      learnings.push(...wni.slice(0, 2));
    }

    return learnings.slice(0, 5);
  }
}
