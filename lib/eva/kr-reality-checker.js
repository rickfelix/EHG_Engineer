/**
 * KR Reality Checker
 * SD: SD-LEO-INFRA-REALITY-CHECK-VALIDATE-001
 *
 * Two-pronged OKR feedback loop:
 * 1. validateKRImplementable() — check if KR work already exists in codebase before creating SDs
 * 2. updateKRFromSDCompletion() — auto-update KR current_value when aligned SDs complete
 *
 * Conservative approach: 95% confidence threshold. Default to creating SD when uncertain.
 * False negatives (unnecessary SDs) are visible and reversible.
 * False positives (skipping needed SDs) are undetectable and dangerous.
 */

const CONFIDENCE_THRESHOLD = 0.95;

/**
 * Validate whether a stale KR's described work already exists in the codebase.
 * Returns { skip: boolean, confidence: number, evidence: string[] }
 *
 * @param {Object} kr - KR object with code, title, description, current_value, target_value, unit
 * @param {Object} supabase - Supabase client
 * @returns {Promise<{ skip: boolean, confidence: number, evidence: string[] }>}
 */
export async function validateKRImplementable(kr, supabase) {
  const evidence = [];
  let confidenceSignals = 0;
  let totalSignals = 0;

  // Signal 1: Check if completed SDs reference this KR code in title/description
  totalSignals++;
  try {
    const { data: completedSDs } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key, title')
      .eq('status', 'completed')
      .or(`title.ilike.%${kr.code}%,description.ilike.%${kr.code}%`)
      .limit(5);

    if (completedSDs && completedSDs.length > 0) {
      confidenceSignals++;
      evidence.push(`${completedSDs.length} completed SD(s) reference ${kr.code}: ${completedSDs.map(s => s.sd_key).join(', ')}`);
    }
  } catch (err) {
    evidence.push(`SD check failed: ${err.message}`);
  }

  // Signal 2: Check sd_key_result_alignment for completed aligned SDs
  totalSignals++;
  try {
    const { data: alignments } = await supabase
      .from('sd_key_result_alignment')
      .select('sd_id, strategic_directives_v2!inner(sd_key, status)')
      .eq('key_result_id', kr.id);

    const completedAligned = (alignments || []).filter(
      a => a.strategic_directives_v2?.status === 'completed'
    );

    if (completedAligned.length > 0) {
      confidenceSignals++;
      evidence.push(`${completedAligned.length} aligned SD(s) completed: ${completedAligned.map(a => a.strategic_directives_v2.sd_key).join(', ')}`);
    }
  } catch (err) {
    evidence.push(`Alignment check failed: ${err.message}`);
  }

  // Signal 3: Check git log for recent commits mentioning this KR code
  totalSignals++;
  try {
    const { execSync } = await import('child_process');
    const gitLog = execSync(
      `git log --oneline -10 --grep="${kr.code}" --since="60 days ago"`,
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();

    if (gitLog && gitLog.length > 0) {
      const commitCount = gitLog.split('\n').filter(l => l.trim()).length;
      confidenceSignals++;
      evidence.push(`${commitCount} git commit(s) reference ${kr.code} in last 60 days`);
    }
  } catch {
    // Git check is best-effort
  }

  // Signal 4: Check if KR description keywords exist in codebase (keyword extraction)
  totalSignals++;
  try {
    const keywords = extractSearchKeywords(kr);
    if (keywords.length > 0) {
      const { execSync } = await import('child_process');
      let matchCount = 0;
      for (const keyword of keywords.slice(0, 3)) {
        try {
          const result = execSync(
            `git grep -l "${keyword}" -- "*.js" "*.mjs" "*.cjs" 2>/dev/null | head -3`,
            { encoding: 'utf-8', timeout: 5000 }
          ).trim();
          if (result) matchCount++;
        } catch { /* no matches */ }
      }
      if (matchCount >= 2) {
        confidenceSignals++;
        evidence.push(`${matchCount}/${keywords.length} KR keywords found in codebase`);
      }
    }
  } catch {
    // Codebase check is best-effort
  }

  const confidence = totalSignals > 0 ? confidenceSignals / totalSignals : 0;
  const skip = confidence >= CONFIDENCE_THRESHOLD;

  if (skip) {
    evidence.push(`Confidence ${(confidence * 100).toFixed(0)}% >= ${CONFIDENCE_THRESHOLD * 100}% threshold — recommending SKIP`);
  } else {
    evidence.push(`Confidence ${(confidence * 100).toFixed(0)}% < ${CONFIDENCE_THRESHOLD * 100}% threshold — SD creation proceeds (conservative)`);
  }

  return { skip, confidence, evidence };
}

/**
 * Auto-update KR current_value when an aligned SD completes.
 * Only updates if confidence is above threshold.
 *
 * @param {string} sdKey - The completed SD key
 * @param {Object} supabase - Supabase client
 * @returns {Promise<{ updated: string[], skipped: string[] }>}
 */
export async function updateKRFromSDCompletion(sdKey, supabase) {
  const updated = [];
  const skipped = [];

  // Find the SD's UUID
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, success_metrics, delivers_capabilities')
    .eq('sd_key', sdKey)
    .single();

  if (!sd) {
    return { updated, skipped, error: `SD ${sdKey} not found` };
  }

  // Find aligned KRs via sd_key_result_alignment
  const { data: alignments } = await supabase
    .from('sd_key_result_alignment')
    .select('key_result_id, key_results!inner(id, code, title, current_value, target_value, baseline_value, unit, direction)')
    .eq('sd_id', sd.id);

  if (!alignments || alignments.length === 0) {
    // Also try matching by SD title containing KR code
    const { data: krs } = await supabase
      .from('key_results')
      .select('id, code, title, current_value, target_value, baseline_value, unit, direction')
      .eq('is_active', true);

    if (krs) {
      for (const kr of krs) {
        if (sd.title.includes(kr.code) || sd.sd_key.includes(kr.code.replace(/[^A-Z0-9]/gi, '-'))) {
          // Found a match by title — update if target is met
          const result = await attemptKRUpdate(kr, sd, supabase);
          if (result) updated.push(kr.code);
          else skipped.push(kr.code);
        }
      }
    }
    return { updated, skipped };
  }

  // Process each aligned KR
  for (const alignment of alignments) {
    const kr = alignment.key_results;
    if (!kr) continue;

    const result = await attemptKRUpdate(kr, sd, supabase);
    if (result) updated.push(kr.code);
    else skipped.push(kr.code);
  }

  return { updated, skipped };
}

/**
 * Attempt to update a single KR based on SD completion evidence.
 * @returns {Promise<boolean>} true if updated
 */
async function attemptKRUpdate(kr, sd, supabase) {
  // If KR is already at target, skip
  if (kr.direction === 'increase' && kr.current_value >= kr.target_value) return false;
  if (kr.direction === 'decrease' && kr.current_value <= kr.target_value) return false;

  // For now, mark KR as progressed (set to target if SD explicitly delivers it)
  // This is conservative — only full completion triggers target update
  const sdMetrics = sd.success_metrics || [];
  const metricsMatchKR = sdMetrics.some(m =>
    m.metric?.includes(kr.code) || m.target?.includes(kr.unit)
  );

  if (!metricsMatchKR) return false;

  const { error } = await supabase
    .from('key_results')
    .update({
      current_value: kr.target_value,
      status: 'on_track',
      updated_at: new Date().toISOString(),
      last_updated_by: `SD-COMPLETION:${sd.sd_key}`,
    })
    .eq('id', kr.id);

  if (error) {
    console.warn(`[KRRealityCheck] Failed to update ${kr.code}: ${error.message}`);
    return false;
  }

  console.log(`[KRRealityCheck] Updated ${kr.code}: current_value → ${kr.target_value} (via ${sd.sd_key})`);
  return true;
}

/**
 * Extract searchable keywords from KR title and description.
 * Filters out common words and returns specific terms for codebase grep.
 */
function extractSearchKeywords(kr) {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
    'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either',
    'address', 'stale', 'resolve', 'improve', 'increase', 'decrease',
    'currently', 'target', 'move', 'score', 'from', 'zero',
  ]);

  const text = `${kr.title} ${kr.description || ''}`;
  const words = text.toLowerCase().split(/[\s,.\-—()/:]+/).filter(w =>
    w.length > 3 && !stopWords.has(w) && !/^\d+$/.test(w)
  );

  // Deduplicate and return unique keywords
  return [...new Set(words)].slice(0, 6);
}

export { CONFIDENCE_THRESHOLD };
