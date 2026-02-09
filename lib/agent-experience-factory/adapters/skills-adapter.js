/**
 * Skills Retrieval Adapter
 * Queries leo_sub_agents metadata for capabilities, success/failure patterns
 * relevant to the current domain
 *
 * SD-LEO-ORCH-AGENT-EXPERIENCE-FACTORY-001-A (FR-2)
 */

import { BaseAdapter } from './base-adapter.js';

export class SkillsAdapter extends BaseAdapter {
  constructor(supabase) {
    super('skills', supabase);
  }

  async _doFetch({ domain, category, limit = 5 }) {
    // Query sub-agents whose categories overlap with the requested domain
    const { data, error } = await this.supabase
      .from('leo_sub_agents')
      .select('code, name, description, capabilities, metadata')
      .eq('is_active', true)
      .order('priority', { ascending: false })
      .limit(20); // Fetch more, filter client-side by relevance

    if (error) throw new Error(`leo_sub_agents query failed: ${error.message}`);

    if (!data || data.length === 0) return { items: [] };

    // Score relevance based on domain/category overlap
    const scored = data
      .map(agent => ({
        agent,
        score: this._relevanceScore(agent, domain, category)
      }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return {
      items: scored.map(({ agent, score }) => ({
        id: agent.code,
        source: 'skills',
        title: agent.name,
        description: agent.description,
        capabilities: agent.capabilities || [],
        successPatterns: agent.metadata?.success_patterns || [],
        failurePatterns: agent.metadata?.failure_patterns || [],
        relevanceScore: score,
        _raw: agent
      }))
    };
  }

  _relevanceScore(agent, domain, category) {
    let score = 0;
    const text = `${agent.name} ${agent.description} ${(agent.capabilities || []).join(' ')}`.toLowerCase();
    const meta = agent.metadata || {};

    // Direct code match
    if (agent.code.toLowerCase() === domain?.toLowerCase()) score += 10;

    // Domain keyword in text
    if (domain && text.includes(domain.toLowerCase())) score += 5;

    // Category keyword in text
    if (category && text.includes(category.toLowerCase())) score += 3;

    // Has success/failure patterns (more experienced)
    if (meta.success_patterns?.length > 0) score += 2;
    if (meta.failure_patterns?.length > 0) score += 2;

    return score;
  }
}
