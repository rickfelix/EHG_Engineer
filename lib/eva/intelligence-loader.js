/**
 * Intelligence Loader for Corrective SD Generator
 * Part of: SD-EHG-ORCH-INTELLIGENCE-INTEGRATION-001-C
 *
 * Loads intelligence signals from existing LEO subsystems:
 *   - OKR alignments (from okr_alignments + key_results)
 *   - Issue patterns (from issue_patterns)
 *   - Blocking dependencies (from strategic_directives_v2)
 *
 * All queries are read-only and gracefully degrade on errors.
 *
 * @module intelligence-loader
 */

import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

/**
 * Load all intelligence signals for a given SD.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdKey - SD key (e.g. 'SD-CORR-FEAT-...')
 * @param {Object} [options]
 * @param {string} [options.sdUuid] - UUID of the SD (for FK-based queries)
 * @returns {Promise<IntelligenceSignals>}
 *
 * @typedef {Object} IntelligenceSignals
 * @property {Object|null} okrImpact - { totalScore, alignments, keyResults }
 * @property {Array} patterns - Active issue patterns related to dimensions
 * @property {Object} blocking - { blocksCount, blockedByCount, blockingKeys }
 * @property {Object} meta - { loadedAt, errors }
 */
export async function loadIntelligenceSignals(supabase, sdKey, options = {}) {
  const errors = [];

  const [okrImpact, patterns, blocking] = await Promise.all([
    _loadOkrImpact(supabase, sdKey, options.sdUuid).catch(err => {
      errors.push(`okr: ${err.message}`);
      return null;
    }),
    _loadPatterns(supabase, sdKey, options.dimension).catch(err => {
      errors.push(`patterns: ${err.message}`);
      return [];
    }),
    _loadBlocking(supabase, sdKey).catch(err => {
      errors.push(`blocking: ${err.message}`);
      return { blocksCount: 0, blockedByCount: 0, blockingKeys: [] };
    }),
  ]);

  return {
    okrImpact,
    patterns,
    blocking,
    meta: { loadedAt: new Date().toISOString(), errors },
  };
}

/**
 * Load OKR alignment data for an SD.
 * Queries okr_alignments joined with key_results to compute totalScore (0-50).
 *
 * @param {Object} supabase
 * @param {string} sdKey
 * @param {string} [sdUuid]
 * @returns {Promise<Object|null>} { totalScore, alignments }
 */
async function _loadOkrImpact(supabase, sdKey, sdUuid) {
  // okr_alignments.sd_id references strategic_directives_v2.id, which despite storing
  // UUID-formatted strings is a `character varying` column, not a native uuid type
  // (SD-LEO-INFRA-PROVISION-OKR-ALIGNMENTS-001) -- resolve to that id value.
  const uuid = sdUuid || await _resolveUuid(supabase, sdKey);
  if (!uuid) return null;

  const { data: alignments, error } = await supabase
    .from('okr_alignments')
    .select('id, key_result_id, contribution_type, impact_weight')
    .eq('sd_id', uuid);

  if (error || !alignments?.length) return null;

  // Fetch key results for urgency multipliers
  const krIds = [...new Set(alignments.map(a => a.key_result_id).filter(Boolean))];
  let keyResults = [];
  if (krIds.length > 0) {
    const { data: krs } = await supabase
      .from('key_results')
      .select('id, status, current_value, target_value')
      .in('id', krIds);
    keyResults = krs || [];
  }

  // Calculate OKR impact score (0-50 scale, matching priority-scorer.js)
  const KR_URGENCY = { off_track: 3.0, at_risk: 2.0, on_track: 1.0 };
  let totalScore = 0;

  for (const alignment of alignments) {
    const kr = keyResults.find(k => k.id === alignment.key_result_id);
    const urgencyMultiplier = KR_URGENCY[kr?.status] ?? 1.0;
    const weight = alignment.impact_weight ?? 1.0;
    // Each alignment contributes: base(10) * weight * urgency
    totalScore += 10 * weight * urgencyMultiplier;
  }

  // Cap at 50 (consistent with priority-scorer.js)
  totalScore = Math.min(Math.round(totalScore * 100) / 100, 50);

  return { totalScore, alignments, keyResults };
}

/**
 * Load active issue patterns related to the SD's domain.
 * Focuses on unresolved patterns with critical/high severity.
 * When a dimension is provided (e.g. 'A04'), filters patterns by
 * the dimension prefix (A- or V-) for more relevant results.
 *
 * @param {Object} supabase
 * @param {string} sdKey
 * @param {string} [dimension] - Optional dimension code (e.g. 'A04', 'V12')
 * @returns {Promise<Array>} Array of pattern objects
 */
async function _loadPatterns(supabase, _sdKey, dimension) {
  // Query active patterns. For corrective SDs, we look for patterns
  // related to EVA/vision dimensions since that's the corrective domain.
  // QF-20260704-225: pattern_key/frequency/last_seen don't exist on issue_patterns
  // (real columns: pattern_id, occurrence_count, updated_at) -- this silently
  // degraded to [] on every call. issue_summary is the closest free-text
  // substitute for the keyword matching pattern_key was used for below.
  const { data: patterns, error } = await supabase
    .from('issue_patterns')
    .select('id, pattern_id, severity, occurrence_count, status, category, issue_summary, updated_at')
    .in('status', ['active', 'monitoring'])
    .in('severity', ['critical', 'high'])
    .order('occurrence_count', { ascending: false })
    .limit(10);

  if (error || !patterns) return [];

  // When a dimension is provided, filter by dimension prefix for scoped results
  if (dimension) {
    const prefix = dimension.charAt(0).toUpperCase(); // 'A' or 'V'
    const dimLower = dimension.toLowerCase();
    const scoped = patterns.filter(p => {
      const key = (p.issue_summary || '').toLowerCase();
      const cat = (p.category || '').toLowerCase();
      return key.includes(dimLower) || key.includes(prefix.toLowerCase()) ||
             cat.includes('corrective') || cat.includes(prefix.toLowerCase());
    });
    if (scoped.length > 0) return scoped;
    // Fall through to unscoped filter if no dimension-specific patterns found
  }

  // Fallback: filter for patterns related to EVA/vision/corrective domain
  return patterns.filter(p => {
    const key = (p.issue_summary || '').toLowerCase();
    const cat = (p.category || '').toLowerCase();
    return key.includes('eva') || key.includes('vision') || key.includes('corrective') ||
           cat.includes('eva') || cat.includes('vision') || cat === 'quality';
  });
}

/**
 * Load blocking dependency counts for an SD.
 * Counts how many other SDs this one blocks (downstream impact).
 *
 * @param {Object} supabase
 * @param {string} sdKey
 * @returns {Promise<Object>} { blocksCount, blockedByCount, blockingKeys }
 */
async function _loadBlocking(supabase, sdKey) {
  // Count SDs that depend on this SD (i.e., this SD blocks them). Paginated (FR-6
  // batch 7): non-terminal SDs exceed the 1000-row cap, which silently undercounted
  // blocking edges. Errors degrade to the prior graceful-zero shape.
  const blockers = await fetchAllPaginated(() => supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, dependencies')
    .not('status', 'eq', 'completed')
    .not('status', 'eq', 'cancelled')
    .order('id', { ascending: true })).catch(() => null);

  if (!blockers) return { blocksCount: 0, blockedByCount: 0, blockingKeys: [] };

  // Find SDs whose dependencies array contains this sdKey
  const blockingKeys = [];
  for (const sd of blockers) {
    const deps = sd.dependencies || [];
    const depKeys = deps.map(d => typeof d === 'string' ? d : d?.sd_key || d?.id).filter(Boolean);
    if (depKeys.includes(sdKey)) {
      blockingKeys.push(sd.sd_key || sd.id);
    }
  }

  // Count SDs that block this SD
  const thisSD = blockers.find(sd => (sd.sd_key || sd.id) === sdKey);
  const thisDeps = thisSD?.dependencies || [];
  const blockedByCount = thisDeps.length;

  return {
    blocksCount: blockingKeys.length,
    blockedByCount,
    blockingKeys,
  };
}

/**
 * Resolve SD key to UUID for FK-based queries.
 *
 * @param {Object} supabase
 * @param {string} sdKey
 * @returns {Promise<string|null>}
 */
async function _resolveUuid(supabase, sdKey) {
  const { data } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', sdKey)
    .limit(1)
    .single();
  return data?.id ?? null;
}

export default { loadIntelligenceSignals };
