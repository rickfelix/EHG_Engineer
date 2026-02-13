/**
 * Historical Pattern Matcher
 * SD-EVA-FEAT-DFE-PRESENTATION-001 (US-004)
 *
 * Finds similar past escalation patterns from the issue_patterns table
 * to provide historical context for Chairman decision-making.
 *
 * Design principles:
 *   - Read-only database access
 *   - Graceful degradation on errors (returns empty array, never crashes)
 *   - Relevance scoring: frequency * recency weight
 *   - No schema changes required
 */

const MAX_RESULTS = 5;

const TRIGGER_CATEGORY_MAP = {
  cost_threshold: ['eva', 'dfe', 'cost', 'budget', 'financial'],
  new_tech_vendor: ['eva', 'dfe', 'technology', 'vendor', 'tech'],
  strategic_pivot: ['eva', 'dfe', 'strategy', 'pivot', 'direction'],
  low_score: ['eva', 'dfe', 'quality', 'score', 'performance'],
  novel_pattern: ['eva', 'dfe', 'pattern', 'novel', 'anomaly'],
  constraint_drift: ['eva', 'dfe', 'constraint', 'drift', 'compliance'],
};

/**
 * Build search terms from trigger types for querying issue_patterns.
 */
function buildSearchTerms(triggerTypes) {
  const terms = new Set(['eva', 'dfe']);
  for (const type of triggerTypes) {
    const mapped = TRIGGER_CATEGORY_MAP[type];
    if (mapped) {
      for (const term of mapped) terms.add(term);
    }
  }
  return [...terms];
}

/**
 * Calculate relevance score for a pattern based on frequency and recency.
 * Higher frequency and more recent = higher relevance.
 */
function calculateRelevance(pattern) {
  const frequency = pattern.frequency || 1;
  const lastSeen = pattern.last_seen ? new Date(pattern.last_seen) : new Date(0);
  const daysSinceLastSeen = Math.max(1, (Date.now() - lastSeen.getTime()) / (1000 * 60 * 60 * 24));
  const recencyWeight = 1 / daysSinceLastSeen;
  return frequency * recencyWeight;
}

/**
 * Find similar historical patterns for a set of DFE trigger types.
 *
 * @param {object} params
 * @param {string[]} params.triggerTypes - DFE trigger type names
 * @param {string} [params.ventureId] - Optional venture UUID for filtering
 * @param {object} params.supabase - Supabase client
 * @param {object} [params.logger] - Optional logger
 * @returns {Promise<object[]>} Array of matching patterns (max 5)
 */
export async function findSimilar({ triggerTypes = [], ventureId, supabase, logger } = {}) {
  if (!supabase) return [];
  if (!triggerTypes.length) return [];

  const log = logger || { warn() {}, debug() {} };

  try {
    const searchTerms = buildSearchTerms(triggerTypes);

    // Build OR filter: category ILIKE any search term
    const orFilters = searchTerms.map(term => `category.ilike.%${term}%`).join(',');

    let query = supabase
      .from('issue_patterns')
      .select('id, pattern_name, category, frequency, last_seen, severity, description')
      .or(orFilters)
      .order('frequency', { ascending: false })
      .limit(MAX_RESULTS * 2); // fetch extra for dedup + relevance sort

    const { data, error } = await query;

    if (error) {
      log.warn(`Historical pattern query failed: ${error.message}`);
      return [];
    }

    if (!data || data.length === 0) return [];

    // Deduplicate by pattern_name
    const seen = new Set();
    const unique = data.filter(p => {
      if (seen.has(p.pattern_name)) return false;
      seen.add(p.pattern_name);
      return true;
    });

    // Score and sort by relevance
    const scored = unique.map(p => ({
      pattern_name: p.pattern_name,
      category: p.category,
      frequency: p.frequency || 0,
      last_seen: p.last_seen,
      severity: p.severity,
      description: p.description,
      relevance: calculateRelevance(p),
    }));

    scored.sort((a, b) => b.relevance - a.relevance);

    return scored.slice(0, MAX_RESULTS);
  } catch (err) {
    log.warn(`Historical pattern matcher error: ${err.message}`);
    return [];
  }
}

export { MAX_RESULTS, TRIGGER_CATEGORY_MAP, buildSearchTerms, calculateRelevance };
