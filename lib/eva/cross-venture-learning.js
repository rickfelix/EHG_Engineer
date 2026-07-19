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

import { ServiceError } from './shared-services.js';
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

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

  if (error) throw new ServiceError('DECISION_QUERY_FAILED', `Failed to query chairman_decisions: ${error.message}`, 'CrossVentureLearning');
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
    .from('venture_stages') // SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-B: unified superset
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

  if (error) throw new ServiceError('ASSUMPTION_QUERY_FAILED', `Failed to query assumption_sets: ${error.message}`, 'CrossVentureLearning');
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
  // Paginated (FR-6 batch 7): the cross-venture corpus read must see every venture.
  let ventures;
  try {
    ventures = await fetchAllPaginated(() => {
      let q = supabase
        .from('ventures')
        .select('id, name, status, current_lifecycle_stage, killed_at, created_at')
        .not('status', 'eq', 'draft');
      if (options.dateFrom) q = q.gte('created_at', options.dateFrom);
      if (options.dateTo) q = q.lte('created_at', options.dateTo);
      return q.order('created_at', { ascending: true }).order('id', { ascending: true });
    });
  } catch (e) {
    throw new ServiceError('VENTURE_QUERY_FAILED', `Failed to query ventures: ${e.message}`, 'CrossVentureLearning');
  }

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
  const [killStageFrequency, failedAssumptions, successPatterns, multiplierCalibration, forecastCalibration] = await Promise.all([
    analyzeKillStageFrequency(supabase, ventureIds),
    analyzeFailedAssumptions(supabase, ventureIds),
    analyzeSuccessPatterns(supabase, ventureIds, ventures),
    analyzeMultiplierCalibration(supabase, ventureIds, ventures),
    analyzeForecastCalibration(supabase, ventureIds),
  ]);

  // Step 4: Build report
  return {
    status: 'complete',
    killStageFrequency,
    failedAssumptions,
    successPatterns,
    multiplierCalibration,
    forecastCalibration,
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

/**
 * Analyze value multiplier calibration across completed ventures.
 * Compares stage-5 value_multiplier_assessment artifacts vs stage-13+
 * outcomes for completed ventures.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} ventureIds
 * @param {Array<{id: string, current_lifecycle_stage: number, status: string}>} ventures
 * @returns {Promise<Object>} Calibration analysis
 */
async function analyzeMultiplierCalibration(supabase, ventureIds, ventures) {
  // Only analyze ventures that have reached stage 13+
  const completedVentures = ventures.filter(v => v.current_lifecycle_stage >= 13);

  if (completedVentures.length < MIN_VENTURES) {
    return {
      status: 'insufficient_data',
      sample_size: completedVentures.length,
      minimum_required: MIN_VENTURES,
    };
  }

  const completedIds = completedVentures.map(v => v.id);

  // Fetch stage-5 and stage-13 value_multiplier_assessment artifacts
  const { data: artifacts, error } = await supabase
    .from('venture_artifacts')
    .select('venture_id, lifecycle_stage, artifact_data')
    .in('venture_id', completedIds)
    .eq('artifact_type', 'value_multiplier_assessment')
    .in('lifecycle_stage', [5, 13])
    .eq('is_current', true);

  if (error) {
    return { status: 'error', message: error.message };
  }

  if (!artifacts || artifacts.length === 0) {
    return { status: 'no_assessments', sample_size: 0 };
  }

  // Group by venture, match stage-5 estimate vs stage-13 outcome
  const ventureAssessments = {};
  for (const a of artifacts) {
    if (!ventureAssessments[a.venture_id]) {
      ventureAssessments[a.venture_id] = {};
    }
    ventureAssessments[a.venture_id][`stage_${a.lifecycle_stage}`] = a.artifact_data;
  }

  const calibrationPoints = [];
  for (const [ventureId, stages] of Object.entries(ventureAssessments)) {
    const stage5 = stages.stage_5;
    const stage13 = stages.stage_13;

    if (stage5?.assessment && stage13?.assessment) {
      const estimated = (stage5.assessment.lower + stage5.assessment.upper) / 2;
      const actual = (stage13.assessment.lower + stage13.assessment.upper) / 2;
      const bias = round2(estimated - actual);

      calibrationPoints.push({
        venture_id: ventureId,
        estimated,
        actual,
        bias,
        stage5_confidence: stage5.assessment.confidence,
        stage13_confidence: stage13.assessment.confidence,
      });
    }
  }

  if (calibrationPoints.length === 0) {
    return { status: 'no_paired_data', sample_size: 0 };
  }

  const avgBias = round2(calibrationPoints.reduce((s, p) => s + p.bias, 0) / calibrationPoints.length);

  return {
    status: 'complete',
    sample_size: calibrationPoints.length,
    avg_bias: avgBias,
    bias_direction: avgBias > 0.5 ? 'optimistic' : avgBias < -0.5 ? 'pessimistic' : 'well_calibrated',
    calibration_points: calibrationPoints,
    recommendation: avgBias > 0.5
      ? 'Stage-5 estimates tend to be optimistic. Consider applying a discount factor.'
      : avgBias < -0.5
        ? 'Stage-5 estimates tend to be pessimistic. Opportunities may be undervalued.'
        : 'Estimation accuracy is within acceptable bounds.',
  };
}

/**
 * Search for similar content across venture artifacts, issue patterns, and retrospectives
 * using hybrid semantic (pgvector) + keyword (pg_trgm) retrieval.
 *
 * SD-EVA-FEAT-SEMANTIC-SEARCH-001 (FR-1, FR-3)
 *
 * Strategy:
 *   1. If a queryEmbedding is provided, run vector search via match_venture_artifacts / match_issue_patterns RPCs
 *   2. Always run keyword_search_fallback as supplementary results
 *   3. Merge, deduplicate, and rank by a weighted score: 0.7 * semantic + 0.3 * keyword
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} options
 * @param {string} options.query - Natural language search query (required for keyword search)
 * @param {number[]} [options.queryEmbedding] - Pre-computed embedding vector (1536-dim); if omitted, keyword-only search
 * @param {string} [options.ventureId] - Filter by venture ID
 * @param {string} [options.artifactType] - Filter by artifact type
 * @param {string[]} [options.tables] - Tables to search (default: all three)
 * @param {number} [options.matchThreshold=0.6] - Minimum similarity for vector search
 * @param {number} [options.limit=10] - Maximum results to return
 * @returns {Promise<Array<{source: string, id: string, content: string, score: number, scoreBreakdown: {semantic: number, keyword: number}}>>}
 */
async function searchSimilar(supabase, options = {}) {
  const {
    query,
    queryEmbedding = null,
    ventureId = null,
    artifactType = null,
    tables = ['venture_artifacts', 'issue_patterns', 'retrospectives'],
    matchThreshold = 0.6,
    limit = 10,
  } = options;

  if (!query && !queryEmbedding) {
    throw new ServiceError('INVALID_ARGS', 'searchSimilar requires at least query or queryEmbedding', 'CrossVentureLearning');
  }

  const resultMap = new Map(); // key: "table:id" → merged result

  // 1. Vector search (if embedding provided)
  if (queryEmbedding) {
    const vectorPromises = [];

    if (tables.includes('venture_artifacts')) {
      vectorPromises.push(
        supabase.rpc('match_venture_artifacts', {
          query_embedding: JSON.stringify(queryEmbedding),
          match_threshold: matchThreshold,
          match_count: limit,
          filter_venture_id: ventureId || null,
          filter_artifact_type: artifactType || null,
        }).then(({ data, error }) => {
          if (error) {
            console.warn('match_venture_artifacts RPC error:', error.message);
            return;
          }
          for (const row of data || []) {
            const key = `venture_artifacts:${row.id}`;
            resultMap.set(key, {
              source: 'venture_artifacts',
              id: row.id,
              content: (row.content || '').slice(0, 300),
              semantic: row.similarity || 0,
              keyword: 0,
              metadata: {
                venture_id: row.venture_id,
                artifact_type: row.artifact_type,
                quality_score: row.quality_score,
              },
            });
          }
        })
      );
    }

    if (tables.includes('issue_patterns')) {
      vectorPromises.push(
        supabase.rpc('match_issue_patterns', {
          query_embedding: JSON.stringify(queryEmbedding),
          match_threshold: matchThreshold,
          match_count: limit,
          filter_category: null,
          filter_severity: null,
        }).then(({ data, error }) => {
          if (error) {
            console.warn('match_issue_patterns RPC error:', error.message);
            return;
          }
          for (const row of data || []) {
            const key = `issue_patterns:${row.id}`;
            resultMap.set(key, {
              source: 'issue_patterns',
              id: row.id,
              content: (row.issue_summary || '').slice(0, 300),
              semantic: row.similarity || 0,
              keyword: 0,
              metadata: {
                pattern_id: row.pattern_id,
                category: row.category,
                severity: row.severity,
                occurrence_count: row.occurrence_count,
              },
            });
          }
        })
      );
    }

    await Promise.all(vectorPromises);
  }

  // 2. Keyword search (always, if query text provided)
  if (query) {
    const { data: keywordResults, error } = await supabase.rpc('keyword_search_fallback', {
      search_query: query,
      target_tables: tables,
      match_count: limit,
    });

    if (error) {
      console.warn('keyword_search_fallback RPC error:', error.message);
    } else {
      for (const row of keywordResults || []) {
        const key = `${row.source_table}:${row.record_id}`;
        if (resultMap.has(key)) {
          // Merge keyword score into existing vector result
          resultMap.get(key).keyword = row.similarity_score || 0;
        } else {
          resultMap.set(key, {
            source: row.source_table,
            id: row.record_id,
            content: (row.content_preview || '').slice(0, 300),
            semantic: 0,
            keyword: row.similarity_score || 0,
            metadata: {},
          });
        }
      }
    }
  }

  // 3. Compute weighted score and rank
  const SEMANTIC_WEIGHT = 0.7;
  const KEYWORD_WEIGHT = 0.3;

  const results = Array.from(resultMap.values())
    .map((r) => ({
      source: r.source,
      id: r.id,
      content: r.content,
      score: round2(r.semantic * SEMANTIC_WEIGHT + r.keyword * KEYWORD_WEIGHT),
      scoreBreakdown: {
        semantic: round2(r.semantic),
        keyword: round2(r.keyword),
      },
      metadata: r.metadata,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return results;
}

/**
 * Analyze assumption calibration accuracy across a portfolio of ventures.
 * FR-5: Portfolio-level calibration trends.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} [options]
 * @param {number} [options.limit=50] - Max ventures to analyze
 * @param {Object} [options.logger=console] - Logger
 * @returns {Promise<Object|null>} Portfolio calibration summary or null on error
 */
async function analyzeAssumptionCalibration(supabase, options = {}) {
  const { limit = 50, logger = console } = options;

  try {
    const { data: sets, error } = await supabase
      .from('assumption_sets')
      .select('venture_id, calibration_report, status')
      .not('calibration_report', 'is', null)
      .limit(limit);

    if (error) {
      logger.warn(`[CrossVenture] Calibration query failed: ${error.message}`);
      return null;
    }

    if (!sets || sets.length === 0) {
      return { ventures_analyzed: 0, portfolio_accuracy: 0, categories: {}, ranked_categories: [], status_distribution: {} };
    }

    // Group by venture
    const ventureMap = new Map();
    for (const s of sets) {
      if (!ventureMap.has(s.venture_id)) ventureMap.set(s.venture_id, []);
      ventureMap.get(s.venture_id).push(s);
    }

    // Aggregate per-category accuracy
    const categoryAcc = {};
    const statusDist = {};
    let totalAccuracy = 0;
    let ventureCount = 0;

    for (const [, ventureSets] of ventureMap) {
      for (const s of ventureSets) {
        statusDist[s.status] = (statusDist[s.status] || 0) + 1;

        const report = s.calibration_report;
        if (!report || !report.category_scores) continue;

        totalAccuracy += report.aggregate_accuracy || 0;
        ventureCount++;

        for (const [cat, scores] of Object.entries(report.category_scores)) {
          if (!categoryAcc[cat]) categoryAcc[cat] = { totalAcc: 0, totalErr: 0, count: 0 };
          categoryAcc[cat].totalAcc += scores.accuracy || 0;
          categoryAcc[cat].totalErr += scores.error_magnitude || 0;
          categoryAcc[cat].count++;
        }
      }
    }

    const categories = {};
    for (const [cat, agg] of Object.entries(categoryAcc)) {
      categories[cat] = {
        avg_accuracy: agg.count > 0 ? round2(agg.totalAcc / agg.count) : 0,
        avg_error_magnitude: agg.count > 0 ? round2(agg.totalErr / agg.count) : 0,
        sample_size: agg.count,
      };
    }

    const ranked = Object.entries(categories)
      .sort((a, b) => a[1].avg_accuracy - b[1].avg_accuracy)
      .map(([cat, data]) => ({ category: cat, ...data }));

    return {
      ventures_analyzed: ventureMap.size,
      portfolio_accuracy: ventureCount > 0 ? round2(totalAccuracy / ventureCount) : 0,
      categories,
      ranked_categories: ranked,
      status_distribution: statusDist,
    };
  } catch (err) {
    logger.warn(`[CrossVenture] analyzeAssumptionCalibration failed: ${err.message}`);
    return null;
  }
}

/**
 * Metric key -> forecast object path for modeling.js range forecasts.
 * Each target node is expected to be a {optimistic, realistic, pessimistic} range.
 * SD-LEO-INFRA-RESEARCH-INTELLIGENCE-OPERATOR-001-D (Child D)
 */
const FORECAST_METRIC_PATHS = Object.freeze({
  revenue_year_1: ['revenue_projections', 'year_1'],
  revenue_year_2: ['revenue_projections', 'year_2'],
  revenue_year_3: ['revenue_projections', 'year_3'],
  ltv_cac_ratio: ['unit_economics', 'ltv_cac_ratio'],
  cac: ['unit_economics', 'cac'],
  payback_months: ['unit_economics', 'payback_months'],
  month_6_users: ['growth_trajectory', 'month_6_users'],
  month_12_users: ['growth_trajectory', 'month_12_users'],
  months_to_break_even: ['break_even', 'months_to_break_even'],
});

/**
 * Resolve a {optimistic, realistic, pessimistic} range from a modeling.js forecast.
 * @returns {{optimistic:number, realistic:number, pessimistic:number}|null}
 */
function resolveForecastRange(forecast, path) {
  let node = forecast;
  for (const key of path) {
    if (!node || typeof node !== 'object') return null;
    node = node[key];
  }
  if (!node || typeof node !== 'object') return null;
  const { optimistic, realistic, pessimistic } = node;
  if (![optimistic, realistic, pessimistic].every((v) => Number.isFinite(v))) return null;
  return { optimistic, realistic, pessimistic };
}

/**
 * Grade a single Stage-0 modeling.js forecast against realized actuals.
 *
 * Measures BOTH center error (was the realistic point close to the actual) AND
 * interval coverage (did the actual fall inside the stated [pessimistic, optimistic]
 * band), and detects the "conservative-center + overconfident-narrow-interval" bias
 * pair named in the parent SD estimation-method appendix: a point estimate that is
 * cautiously close on average while the stated interval is too narrow to cover reality.
 *
 * Pure and deterministic; never fabricates a grade when actuals are absent (honest-idle).
 *
 * @param {Object} forecast - modeling.js forecast (range metrics {optimistic,realistic,pessimistic})
 * @param {Object} [actuals] - realized values keyed by FORECAST_METRIC_PATHS keys
 * @param {Object} [options]
 * @param {number} [options.conservativeBand=0.15] - |centerBias| at/below this counts the center as cautiously close
 * @param {number} [options.coverageFloor=0.5] - coverageRate below this counts the interval as overconfident
 * @returns {{metricsGraded:number, centerBias:number, coverageRate:number, avgIntervalWidthRel:number, biasPair:{conservativeCenter:boolean, overconfidentInterval:boolean}, metrics:Array}}
 */
function gradeForecastCalibration(forecast, actuals = {}, options = {}) {
  const conservativeBand = Number.isFinite(options.conservativeBand) ? options.conservativeBand : 0.15;
  const coverageFloor = Number.isFinite(options.coverageFloor) ? options.coverageFloor : 0.5;

  const metrics = [];
  if (forecast && typeof forecast === 'object' && actuals && typeof actuals === 'object') {
    for (const [metric, path] of Object.entries(FORECAST_METRIC_PATHS)) {
      const actual = actuals[metric];
      if (!Number.isFinite(actual)) continue;
      const range = resolveForecastRange(forecast, path);
      if (!range) continue;

      const center = range.realistic;
      const lo = Math.min(range.pessimistic, range.optimistic);
      const hi = Math.max(range.pessimistic, range.optimistic);
      const denom = Math.abs(actual) || 1;
      const centerErrorRel = round2((center - actual) / denom);
      const covered = actual >= lo && actual <= hi;
      const intervalWidthRel = round2((hi - lo) / (Math.abs(center) || 1));

      metrics.push({ metric, actual, center, lo, hi, centerErrorRel, covered, intervalWidthRel });
    }
  }

  const metricsGraded = metrics.length;
  if (metricsGraded === 0) {
    return {
      metricsGraded: 0,
      centerBias: 0,
      coverageRate: 0,
      avgIntervalWidthRel: 0,
      biasPair: { conservativeCenter: false, overconfidentInterval: false },
      metrics: [],
    };
  }

  const centerBias = round2(metrics.reduce((s, m) => s + m.centerErrorRel, 0) / metricsGraded);
  const coverageRate = round2(metrics.filter((m) => m.covered).length / metricsGraded);
  const avgIntervalWidthRel = round2(metrics.reduce((s, m) => s + m.intervalWidthRel, 0) / metricsGraded);

  // Conservative center: the point estimate is, on average, close/cautious (small signed bias).
  // Overconfident interval: despite that, the stated band failed to cover the actuals often enough.
  const conservativeCenter = Math.abs(centerBias) <= conservativeBand;
  const overconfidentInterval = coverageRate < coverageFloor;

  return {
    metricsGraded,
    centerBias,
    coverageRate,
    avgIntervalWidthRel,
    biasPair: { conservativeCenter, overconfidentInterval },
    metrics,
  };
}

/**
 * Aggregate forecast-vs-actual calibration records across ventures into per-estimate-class
 * track-record weighting (L4 of the parent SD estimation-method appendix): future
 * reference-data / ensemble contributions can be weighted by realized accuracy per
 * estimate-class rather than by rhetoric.
 *
 * Reads the durable calibration records written at venture kill/complete
 * (eva_audit_log, action_type='venture_calibration_recorded'). Honest-idle: returns
 * insufficient_data below the minimum sample size.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} ventureIds
 * @param {Object} [options]
 * @param {number} [options.minSamples=3]
 * @returns {Promise<Object>} Calibration aggregate + trackRecordWeights
 */
async function analyzeForecastCalibration(supabase, ventureIds, options = {}) {
  const minSamples = Number.isFinite(options.minSamples) ? options.minSamples : 3;

  if (!Array.isArray(ventureIds) || ventureIds.length === 0) {
    return { status: 'insufficient_data', sample_size: 0, minimum_required: minSamples };
  }

  const { data: rows, error } = await supabase
    .from('eva_audit_log')
    .select('eva_venture_id, action_data, created_at')
    .eq('action_type', 'venture_calibration_recorded')
    .in('eva_venture_id', ventureIds);

  if (error) return { status: 'error', message: error.message };

  const records = (rows || []).filter((r) => r.action_data && r.action_data.summary);
  if (records.length < minSamples) {
    return { status: 'insufficient_data', sample_size: records.length, minimum_required: minSamples };
  }

  const classAgg = {};
  let biasSum = 0;
  let coverageSum = 0;
  let summaryCount = 0;

  for (const r of records) {
    const summary = r.action_data.summary;
    if (Number.isFinite(summary.centerBias)) {
      biasSum += summary.centerBias;
      coverageSum += Number.isFinite(summary.coverageRate) ? summary.coverageRate : 0;
      summaryCount += 1;
    }
    for (const m of r.action_data.metrics || []) {
      if (!m || typeof m.metric !== 'string') continue;
      if (!classAgg[m.metric]) classAgg[m.metric] = { covered: 0, count: 0, centerErrSum: 0 };
      const c = classAgg[m.metric];
      c.count += 1;
      if (m.covered) c.covered += 1;
      c.centerErrSum += Number.isFinite(m.centerErrorRel) ? m.centerErrorRel : 0;
    }
  }

  const byEstimateClass = {};
  const trackRecordWeights = {};
  for (const [cls, agg] of Object.entries(classAgg)) {
    const coverageRate = round2(agg.count > 0 ? agg.covered / agg.count : 0);
    const centerBias = round2(agg.count > 0 ? agg.centerErrSum / agg.count : 0);
    byEstimateClass[cls] = { coverageRate, centerBias, sample_size: agg.count };
    // L4 weighting: weight future contributions of this estimate-class by realized coverage accuracy.
    trackRecordWeights[cls] = round2(coverageRate);
  }

  return {
    status: 'complete',
    sample_size: records.length,
    portfolio_center_bias: summaryCount > 0 ? round2(biasSum / summaryCount) : 0,
    portfolio_coverage_rate: summaryCount > 0 ? round2(coverageSum / summaryCount) : 0,
    by_estimate_class: byEstimateClass,
    trackRecordWeights,
  };
}

export {
  analyzeCrossVenturePatterns,
  analyzeKillStageFrequency,
  analyzeFailedAssumptions,
  analyzeSuccessPatterns,
  analyzeMultiplierCalibration,
  analyzeForecastCalibration,
  gradeForecastCalibration,
  analyzeAssumptionCalibration,
  searchSimilar,
  MODULE_VERSION,
  MIN_VENTURES,
  round2,
};
