/**
 * Cross-Venture Pattern Learning
 * SD-LEO-FEAT-CROSS-VENTURE-001
 *
 * Analyzes patterns across 5+ ventures to identify:
 *   1. Kill-stage frequency rankings (which stages kill most ventures)
 *   2. Failed assumption patterns (common assumptions that fail)
 *   3. Successful patterns worth replicating
 *
 * Output is structured JSON consumable by the Decision Filter Engine
 * for threshold calibration.
 *
 * Design principles:
 *   - Deterministic: same data + same filters → identical output
 *   - Pure: no side effects, dependency-injected supabase client
 *   - Rounding: Math.round(value * 100) / 100 for all rates
 */

const MODULE_VERSION = '1.0.0';
const MIN_VENTURES = 5;

/**
 * Round to 2 decimal places deterministically.
 * @param {number} value
 * @returns {number}
 */
function round2(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Analyze kill-stage frequency across all ventures.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} ventureIds - Venture IDs to analyze
 * @returns {Promise<Array<{stage: number, stageName: string, killCount: number, killRate: number}>>}
 */
async function analyzeKillStageFrequency(supabase, ventureIds) {
  const { data: decisions, error } = await supabase
    .from('chairman_decisions')
    .select('venture_id, lifecycle_stage')
    .in('venture_id', ventureIds)
    .or('decision.eq.kill,recommendation.eq.kill');

  if (error) throw new Error(`Failed to query chairman_decisions: ${error.message}`);
  if (!decisions || decisions.length === 0) return [];

  // Only count actual kill decisions (not just recommendations)
  const { data: killDecisions } = await supabase
    .from('chairman_decisions')
    .select('venture_id, lifecycle_stage')
    .in('venture_id', ventureIds)
    .eq('decision', 'kill');

  const kills = killDecisions || [];

  // Count kills per stage
  const stageKills = {};
  for (const d of kills) {
    const stage = d.lifecycle_stage;
    stageKills[stage] = (stageKills[stage] || 0) + 1;
  }

  // Get stage names
  const stageNumbers = Object.keys(stageKills).map(Number);
  if (stageNumbers.length === 0) return [];

  const { data: stageConfig } = await supabase
    .from('lifecycle_stage_config')
    .select('stage_number, stage_name')
    .in('stage_number', stageNumbers);

  const stageNameMap = {};
  for (const sc of stageConfig || []) {
    stageNameMap[sc.stage_number] = sc.stage_name;
  }

  const totalVentures = ventureIds.length;
  const result = stageNumbers
    .map((stage) => ({
      stage,
      stageName: stageNameMap[stage] || `Stage ${stage}`,
      killCount: stageKills[stage],
      killRate: round2(stageKills[stage] / totalVentures),
    }))
    .sort((a, b) => b.killCount - a.killCount || a.stage - b.stage);

  return result;
}

/**
 * Analyze failed assumption patterns across ventures.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} ventureIds
 * @returns {Promise<Array<{category: string, pattern: string, affectedVentures: string[], frequency: number, confidence: number}>>}
 */
async function analyzeFailedAssumptions(supabase, ventureIds) {
  const { data: assumptions, error } = await supabase
    .from('assumption_sets')
    .select('venture_id, market_assumptions, competitor_assumptions, product_assumptions, timing_assumptions, confidence_scores, calibration_report, status')
    .in('venture_id', ventureIds)
    .in('status', ['invalidated', 'validated']);

  if (error) throw new Error(`Failed to query assumption_sets: ${error.message}`);
  if (!assumptions || assumptions.length === 0) return [];

  const CATEGORIES = ['market', 'competitor', 'product', 'timing'];
  const CATEGORY_FIELDS = {
    market: 'market_assumptions',
    competitor: 'competitor_assumptions',
    product: 'product_assumptions',
    timing: 'timing_assumptions',
  };

  // Track patterns of low confidence or invalidated assumptions
  const patternMap = {};

  for (const as of assumptions) {
    const calibration = as.calibration_report;
    const isInvalidated = as.status === 'invalidated';

    for (const category of CATEGORIES) {
      const field = CATEGORY_FIELDS[category];
      const data = as[field];
      if (!data || typeof data !== 'object') continue;

      for (const [key, entry] of Object.entries(data)) {
        if (!entry || typeof entry !== 'object') continue;

        const confidence = entry.confidence ?? 1;
        const wasWrong = isInvalidated || confidence < 0.5;

        if (wasWrong) {
          const patternKey = `${category}:${key}`;
          if (!patternMap[patternKey]) {
            patternMap[patternKey] = {
              category,
              pattern: key,
              affectedVentures: [],
              totalConfidence: 0,
              count: 0,
            };
          }
          const p = patternMap[patternKey];
          if (!p.affectedVentures.includes(as.venture_id)) {
            p.affectedVentures.push(as.venture_id);
          }
          p.totalConfidence += confidence;
          p.count += 1;
        }
      }
    }

    // Check calibration report for error patterns
    if (calibration && typeof calibration === 'object' && calibration.error_direction) {
      const patternKey = `calibration:${calibration.error_direction}`;
      if (!patternMap[patternKey]) {
        patternMap[patternKey] = {
          category: 'calibration',
          pattern: calibration.error_direction,
          affectedVentures: [],
          totalConfidence: 0,
          count: 0,
        };
      }
      const p = patternMap[patternKey];
      if (!p.affectedVentures.includes(as.venture_id)) {
        p.affectedVentures.push(as.venture_id);
      }
      p.totalConfidence += calibration.error_magnitude ?? 0.5;
      p.count += 1;
    }
  }

  return Object.values(patternMap)
    .map((p) => ({
      category: p.category,
      pattern: p.pattern,
      affectedVentures: p.affectedVentures.sort(),
      frequency: p.affectedVentures.length,
      confidence: round2(p.count > 0 ? p.totalConfidence / p.count : 0),
    }))
    .sort((a, b) => b.frequency - a.frequency || a.category.localeCompare(b.category) || a.pattern.localeCompare(b.pattern));
}

/**
 * Analyze successful patterns across ventures that reached late stages.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} ventureIds
 * @param {Array<{id: string, current_lifecycle_stage: number, status: string}>} ventures
 * @returns {Promise<Array<{pattern: string, type: string, ventures: string[], confidence: number}>>}
 */
async function analyzeSuccessPatterns(supabase, ventureIds, ventures) {
  // Successful ventures: reached stage 18+ (Build Loop) or status active with high stage
  const successfulVentures = ventures.filter(
    (v) => v.current_lifecycle_stage >= 18 || (v.status === 'active' && v.current_lifecycle_stage >= 13)
  );

  if (successfulVentures.length === 0) return [];

  const successIds = successfulVentures.map((v) => v.id);

  // Pattern 1: Common artifact types in successful ventures
  const { data: artifacts } = await supabase
    .from('venture_artifacts')
    .select('venture_id, artifact_type, quality_score')
    .in('venture_id', successIds)
    .eq('is_current', true);

  const artifactPatterns = {};
  for (const a of artifacts || []) {
    if (!artifactPatterns[a.artifact_type]) {
      artifactPatterns[a.artifact_type] = { ventures: new Set(), totalQuality: 0, count: 0 };
    }
    const p = artifactPatterns[a.artifact_type];
    p.ventures.add(a.venture_id);
    if (a.quality_score != null) {
      p.totalQuality += a.quality_score;
      p.count += 1;
    }
  }

  // Pattern 2: Decision patterns in successful ventures (proceed decisions)
  const { data: proceedDecisions } = await supabase
    .from('chairman_decisions')
    .select('venture_id, lifecycle_stage, decision, health_score')
    .in('venture_id', successIds)
    .eq('decision', 'proceed');

  const decisionPatterns = {};
  for (const d of proceedDecisions || []) {
    const key = `proceed_at_stage_${d.lifecycle_stage}`;
    if (!decisionPatterns[key]) {
      decisionPatterns[key] = { ventures: new Set(), stage: d.lifecycle_stage };
    }
    decisionPatterns[key].ventures.add(d.venture_id);
  }

  const totalSuccessful = successfulVentures.length;
  const patterns = [];

  // Convert artifact patterns
  for (const [type, data] of Object.entries(artifactPatterns)) {
    const ventureCount = data.ventures.size;
    if (ventureCount >= 2) {
      patterns.push({
        pattern: `High-quality ${type} artifacts`,
        type: 'artifact',
        ventures: Array.from(data.ventures).sort(),
        confidence: round2(ventureCount / totalSuccessful),
      });
    }
  }

  // Convert decision patterns (only gates with high proceed rate)
  for (const [_key, data] of Object.entries(decisionPatterns)) {
    const ventureCount = data.ventures.size;
    if (ventureCount >= Math.ceil(totalSuccessful * 0.5)) {
      patterns.push({
        pattern: `Proceed decision at stage ${data.stage}`,
        type: 'decision',
        ventures: Array.from(data.ventures).sort(),
        confidence: round2(ventureCount / totalSuccessful),
      });
    }
  }

  return patterns.sort((a, b) => b.confidence - a.confidence || a.pattern.localeCompare(b.pattern));
}

/**
 * Analyze cross-venture patterns. Main entry point.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} [options]
 * @param {string} [options.dateFrom] - ISO date string for filtering ventures created after
 * @param {string} [options.dateTo] - ISO date string for filtering ventures created before
 * @returns {Promise<object>} Pattern report
 */
async function analyzeCrossVenturePatterns(supabase, options = {}) {
  // Step 1: Get all eligible ventures
  let query = supabase
    .from('ventures')
    .select('id, name, status, current_lifecycle_stage, killed_at, created_at')
    .not('status', 'eq', 'draft');

  if (options.dateFrom) {
    query = query.gte('created_at', options.dateFrom);
  }
  if (options.dateTo) {
    query = query.lte('created_at', options.dateTo);
  }

  const { data: ventures, error } = await query.order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to query ventures: ${error.message}`);

  if (!ventures || ventures.length < MIN_VENTURES) {
    return {
      status: 'insufficient_data',
      minimum: MIN_VENTURES,
      actual: ventures ? ventures.length : 0,
    };
  }

  const ventureIds = ventures.map((v) => v.id);

  // Step 2: Check for terminal ventures (at least 2 completed or killed)
  const terminalVentures = ventures.filter(
    (v) => v.status === 'archived' || v.status === 'killed' || v.killed_at != null || v.current_lifecycle_stage >= 23
  );

  if (terminalVentures.length < 2) {
    return {
      status: 'insufficient_data',
      minimum: MIN_VENTURES,
      actual: ventures.length,
      reason: `Need at least 2 terminal ventures (completed or killed), found ${terminalVentures.length}`,
    };
  }

  // Step 3: Run analyses in parallel for efficiency
  const [killStageFrequency, failedAssumptions, successPatterns] = await Promise.all([
    analyzeKillStageFrequency(supabase, ventureIds),
    analyzeFailedAssumptions(supabase, ventureIds),
    analyzeSuccessPatterns(supabase, ventureIds, ventures),
  ]);

  // Step 4: Build report
  return {
    status: 'complete',
    killStageFrequency,
    failedAssumptions,
    successPatterns,
    metadata: {
      generatedAt: new Date().toISOString(),
      ventureCount: ventures.length,
      terminalCount: terminalVentures.length,
      moduleVersion: MODULE_VERSION,
      options: {
        dateFrom: options.dateFrom || null,
        dateTo: options.dateTo || null,
      },
    },
  };
}

module.exports = {
  analyzeCrossVenturePatterns,
  analyzeKillStageFrequency,
  analyzeFailedAssumptions,
  analyzeSuccessPatterns,
  MODULE_VERSION,
  MIN_VENTURES,
  round2,
};
