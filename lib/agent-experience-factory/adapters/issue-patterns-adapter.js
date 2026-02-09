/**
 * Issue Patterns Retrieval Adapter
 * Queries issue_patterns table filtered by domain/category with ranking by occurrence_count
 *
 * SD-LEO-ORCH-AGENT-EXPERIENCE-FACTORY-001-A (FR-2)
 */

import { BaseAdapter } from './base-adapter.js';

export class IssuePatternsAdapter extends BaseAdapter {
  constructor(supabase) {
    super('issue_patterns', supabase);
  }

  async _doFetch({ domain, category, limit = 5 }) {
    const categories = this._resolveCategories(domain, category);

    if (categories.length === 0) {
      return { items: [] };
    }

    const { data, error } = await this.supabase
      .from('issue_patterns')
      .select('pattern_id, category, severity, issue_summary, occurrence_count, proven_solutions, prevention_checklist, trend')
      .eq('status', 'active')
      .in('category', categories)
      .order('occurrence_count', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`issue_patterns query failed: ${error.message}`);

    return {
      items: (data || []).map(p => ({
        id: p.pattern_id,
        source: 'issue_patterns',
        title: p.issue_summary,
        severity: p.severity,
        category: p.category,
        occurrences: p.occurrence_count,
        trend: p.trend,
        solution: this._extractTopSolution(p.proven_solutions),
        prevention: this._extractPrevention(p.prevention_checklist),
        _raw: p
      }))
    };
  }

  _resolveCategories(domain, category) {
    const cats = [];
    if (category) cats.push(category);
    if (domain && domain !== category) cats.push(domain);
    // Map common domains to known issue_patterns categories
    const DOMAIN_EXPANSIONS = {
      database: ['database', 'security'],
      testing: ['testing', 'deployment', 'build'],
      validation: ['code_structure', 'protocol', 'testing'],
      security: ['security', 'authentication'],
      design: ['ui', 'ux', 'accessibility'],
      performance: ['performance', 'optimization']
    };
    const expanded = DOMAIN_EXPANSIONS[domain?.toLowerCase()] || [];
    expanded.forEach(c => { if (!cats.includes(c)) cats.push(c); });
    return cats;
  }

  _extractTopSolution(solutions) {
    if (!solutions || !Array.isArray(solutions) || solutions.length === 0) return null;
    const s = solutions[0];
    return s.solution || s.method || (typeof s === 'string' ? s : null);
  }

  _extractPrevention(checklist) {
    if (!checklist) return [];
    let parsed = checklist;
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch { return []; }
    }
    return Array.isArray(parsed) ? parsed.slice(0, 3) : [];
  }
}
