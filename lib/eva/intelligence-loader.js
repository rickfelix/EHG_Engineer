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
    _loadPatterns(supabase, sdKey).catch(err => {
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
  // okr_alignments uses sd_id (uuid), so we need the UUID
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
 *
 * @param {Object} supabase
 * @param {string} sdKey
 * @returns {Promise<Array>} Array of pattern objects
 */
async function _loadPatterns(supabase, _sdKey) {
  // Query active patterns. For corrective SDs, we look for patterns
  // related to EVA/vision dimensions since that's the corrective domain.
  const { data: patterns, error } = await supabase
    .from('issue_patterns')
    .select('id, pattern_key, severity, frequency, status, category, last_seen')
    .in('status', ['active', 'monitoring'])
    .in('severity', ['critical', 'high'])
    .order('frequency', { ascending: false })
    .limit(10);

  if (error || !patterns) return [];

  // Filter for patterns related to EVA/vision/corrective domain
  return patterns.filter(p => {
    const key = (p.pattern_key || '').toLowerCase();
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
  // Count SDs that depend on this SD (i.e., this SD blocks them)
  const { data: blockers, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, dependencies')
    .not('status', 'eq', 'completed')
    .not('status', 'eq', 'cancelled');

  if (error || !blockers) return { blocksCount: 0, blockedByCount: 0, blockingKeys: [] };

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
    .select('uuid_id')
    .eq('sd_key', sdKey)
    .limit(1)
    .single();
  return data?.uuid_id ?? null;
}

export default { loadIntelligenceSignals };
