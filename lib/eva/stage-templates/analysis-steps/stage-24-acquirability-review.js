/**
 * Stage 24 Analysis Step - Acquirability Review (Exit Readiness Aggregation)
 * Phase: LAUNCH & LEARN (Stages 23-25)
 * SD: SD-VENTURE-ACQUISITIONREADINESS-ARCHITECTURE-ORCH-001-C
 *
 * Aggregates all acquirability data into a comprehensive exit-readiness report.
 * Sources: Stage 0 score, Build phase deltas (18-22), separability scores.
 * Target: venture_exit_profiles.readiness_assessment JSONB.
 *
 * NO LLM calls — pure aggregation and computation.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-24-acquirability-review
 */

// Weight constants for overall score computation
const WEIGHTS = {
  stage0: 0.30,
  buildDelta: 0.30,
  separability: 0.40,
};

// Build phase stages (18-22) for delta aggregation
const BUILD_PHASE_STAGES = [18, 19, 20, 21, 22];

// Delta normalization: raw deltas range from -50 to +50, normalize to 0-100
const DELTA_MIN = -50;
const DELTA_MAX = 50;
const DELTA_RANGE = DELTA_MAX - DELTA_MIN; // 100

/**
 * Normalize a delta value from [-50, +50] range to [0, 100].
 * @param {number} delta
 * @returns {number}
 */
function normalizeDelta(delta) {
  const clamped = Math.max(DELTA_MIN, Math.min(DELTA_MAX, delta));
  return ((clamped - DELTA_MIN) / DELTA_RANGE) * 100;
}

/**
 * Determine trend direction from an array of delta values.
 * @param {number[]} deltas - Ordered delta values (earliest to latest)
 * @returns {'improving' | 'stable' | 'declining'}
 */
function computeTrend(deltas) {
  if (!deltas || deltas.length < 2) return 'stable';

  // Compare the average of the first half to the second half
  const mid = Math.floor(deltas.length / 2);
  const firstHalf = deltas.slice(0, mid);
  const secondHalf = deltas.slice(mid);

  const avgFirst = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;

  const diff = avgSecond - avgFirst;
  if (diff > 3) return 'improving';
  if (diff < -3) return 'declining';
  return 'stable';
}

/**
 * Generate recommendations based on score components.
 * @param {Object} scores
 * @returns {string[]}
 */
function generateRecommendations({ stage0Score, normalizedBuildDelta, separabilityScore, overall }) {
  const recs = [];

  if (overall >= 75) {
    recs.push('Venture demonstrates strong exit readiness. Consider initiating buyer outreach.');
  }

  if (stage0Score < 40) {
    recs.push('Initial acquirability assessment was low. Verify that foundational concerns (IP, market fit) have been addressed during build phase.');
  } else if (stage0Score < 60) {
    recs.push('Moderate initial acquirability. Review Stage 0 gaps to ensure build phase improvements are closing them.');
  }

  if (normalizedBuildDelta < 40) {
    recs.push('Build phase deltas indicate limited progress on acquirability metrics. Investigate stalled dimensions.');
  } else if (normalizedBuildDelta >= 70) {
    recs.push('Build phase shows strong positive movement on acquirability dimensions.');
  }

  if (separabilityScore < 40) {
    recs.push('Separability score is low. Prioritize reducing infrastructure dependencies and clarifying IP ownership before exit.');
  } else if (separabilityScore < 60) {
    recs.push('Separability needs improvement. Focus on data portability and operational autonomy.');
  } else if (separabilityScore >= 80) {
    recs.push('Strong separability position. Venture is well-positioned for clean separation.');
  }

  if (overall < 50) {
    recs.push('Overall readiness below threshold. Recommend additional build cycles before pursuing exit.');
  }

  if (recs.length === 0) {
    recs.push('All dimensions within acceptable range. Continue monitoring and prepare data room.');
  }

  return recs;
}

/**
 * Identify risk factors across all data sources.
 * @param {Object} params
 * @returns {string[]}
 */
function identifyRiskFactors({ stage0Score, buildDeltas, separabilityData, warnings }) {
  const risks = [];

  if (stage0Score === null || stage0Score === undefined) {
    risks.push('No Stage 0 acquirability baseline available — unable to measure improvement trajectory.');
  } else if (stage0Score < 30) {
    risks.push('Very low initial acquirability score indicates fundamental readiness gaps.');
  }

  if (!buildDeltas || buildDeltas.length === 0) {
    risks.push('No build phase delta data — acquirability improvement during build cannot be verified.');
  } else {
    const negativeDeltas = buildDeltas.filter(d => d.delta < 0);
    if (negativeDeltas.length > 0) {
      const stageNames = negativeDeltas.map(d => `Stage ${d.stage}`).join(', ');
      risks.push(`Negative acquirability deltas in ${stageNames} — regression detected during build.`);
    }
  }

  if (!separabilityData) {
    risks.push('No separability score available — venture independence from parent org not assessed.');
  } else {
    if (typeof separabilityData.infrastructure_independence === 'number' && separabilityData.infrastructure_independence < 40) {
      risks.push('Low infrastructure independence — venture heavily relies on shared platform resources.');
    }
    if (typeof separabilityData.ip_clarity === 'number' && separabilityData.ip_clarity < 40) {
      risks.push('IP clarity score is low — ownership boundaries may be unclear to acquirers.');
    }
    if (typeof separabilityData.data_portability === 'number' && separabilityData.data_portability < 40) {
      risks.push('Data portability concerns — migration complexity may deter buyers.');
    }
  }

  if (warnings.length > 0) {
    risks.push(`Data gaps detected (${warnings.length} warning(s)) — report based on partial data.`);
  }

  if (risks.length === 0) {
    risks.push('No significant risk factors identified from available data.');
  }

  return risks;
}

// ── Data Collection Helpers ───────────────────────────────────

/**
 * Fetch Stage 0 acquirability score from DB.
 * Looks in venture_stage_work advisory_data for stage 0 health_score.
 *
 * @param {Object} supabase
 * @param {string} ventureId
 * @returns {Promise<number|null>}
 */
async function fetchStage0Score(supabase, ventureId) {
  // Try venture_stage_work first (primary location for stage data)
  const { data, error } = await supabase
    .from('venture_stage_work')
    .select('health_score, advisory_data')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', 0)
    .maybeSingle();

  if (error || !data) return null;

  // Prefer advisory_data.acquirability_score if present, fall back to health_score
  if (data.advisory_data?.acquirability_score != null) {
    return Number(data.advisory_data.acquirability_score);
  }
  if (data.health_score != null) {
    return Number(data.health_score);
  }
  return null;
}

/**
 * Fetch build phase deltas (stages 18-22) from DB.
 * Each stage may have a health_score or advisory_data with delta info.
 *
 * @param {Object} supabase
 * @param {string} ventureId
 * @returns {Promise<Array<{stage: number, delta: number, score: number}>>}
 */
async function fetchBuildDeltas(supabase, ventureId) {
  const { data, error } = await supabase
    .from('venture_stage_work')
    .select('lifecycle_stage, health_score, advisory_data')
    .eq('venture_id', ventureId)
    .in('lifecycle_stage', BUILD_PHASE_STAGES)
    .order('lifecycle_stage', { ascending: true });

  if (error || !data || data.length === 0) return [];

  return data.map(row => {
    // Prefer advisory_data.acquirability_delta, then compute from health_score
    const delta = row.advisory_data?.acquirability_delta != null
      ? Number(row.advisory_data.acquirability_delta)
      : 0;
    const score = row.health_score != null ? Number(row.health_score) : 50;

    return {
      stage: row.lifecycle_stage,
      delta,
      score,
    };
  });
}

/**
 * Fetch latest separability score from DB.
 *
 * @param {Object} supabase
 * @param {string} ventureId
 * @returns {Promise<Object|null>}
 */
async function fetchSeparabilityScore(supabase, ventureId) {
  const { data, error } = await supabase
    .from('venture_separability_scores')
    .select('overall_score, infrastructure_independence, data_portability, ip_clarity, team_dependency, operational_autonomy, dimension_weights, scored_at')
    .eq('venture_id', ventureId)
    .order('scored_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

// ── Main Export ──────────────────────────────────────────────

/**
 * Aggregate all acquirability data into a comprehensive exit-readiness report.
 *
 * @param {Object} params
 * @param {string} params.ventureId - Venture UUID
 * @param {Object} [params.supabase] - Supabase client (null for test/dry-run)
 * @param {Object} [params.stageData] - Pre-loaded stage data (for testing without DB)
 * @param {number} [params.stageData.stage0] - Stage 0 acquirability score (0-100)
 * @param {Array<{stage: number, delta: number, score: number}>} [params.stageData.buildDeltas] - Build phase deltas
 * @param {Object} [params.stageData.separabilityScore] - Separability score object
 * @param {Object} [params.logger] - Logger (defaults to console)
 * @returns {Promise<Object>} Full readiness report
 */
export async function analyzeStage24AcquirabilityReview({ ventureId, supabase, stageData, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage24-Acquirability] Starting exit readiness aggregation', { ventureId });

  const warnings = [];

  // ── 1. Collect data (from stageData or DB) ────────────────

  let stage0Score = null;
  let buildDeltas = [];
  let separabilityData = null;

  if (stageData?.stage0 != null) {
    stage0Score = Number(stageData.stage0);
  } else if (supabase) {
    try {
      stage0Score = await fetchStage0Score(supabase, ventureId);
    } catch (err) {
      logger.warn('[Stage24-Acquirability] Failed to fetch Stage 0 score', { error: err.message });
    }
  }
  if (stage0Score === null) {
    warnings.push('Stage 0 acquirability score not available; using default (50).');
    stage0Score = 50;
  }

  if (stageData?.buildDeltas != null) {
    buildDeltas = stageData.buildDeltas;
  } else if (supabase) {
    try {
      buildDeltas = await fetchBuildDeltas(supabase, ventureId);
    } catch (err) {
      logger.warn('[Stage24-Acquirability] Failed to fetch build deltas', { error: err.message });
    }
  }
  if (buildDeltas.length === 0) {
    warnings.push('Build phase deltas (stages 18-22) not available; using neutral delta (0).');
  }

  if (stageData?.separabilityScore != null) {
    separabilityData = stageData.separabilityScore;
  } else if (supabase) {
    try {
      separabilityData = await fetchSeparabilityScore(supabase, ventureId);
    } catch (err) {
      logger.warn('[Stage24-Acquirability] Failed to fetch separability score', { error: err.message });
    }
  }
  if (!separabilityData) {
    warnings.push('Separability score not available; using default (50).');
  }

  // ── 2. Compute aggregated scores ──────────────────────────

  // Stage 0: clamp to 0-100
  const clampedStage0 = Math.max(0, Math.min(100, stage0Score));

  // Build deltas: normalize average to 0-100
  let avgDeltaRaw = 0;
  if (buildDeltas.length > 0) {
    avgDeltaRaw = buildDeltas.reduce((sum, d) => sum + d.delta, 0) / buildDeltas.length;
  }
  const normalizedBuildDelta = normalizeDelta(avgDeltaRaw);

  // Separability: use overall_score or default
  const separabilityScore = separabilityData?.overall_score != null
    ? Math.max(0, Math.min(100, Number(separabilityData.overall_score)))
    : 50;

  // Weighted average
  const overallScore = Math.round(
    (clampedStage0 * WEIGHTS.stage0)
    + (normalizedBuildDelta * WEIGHTS.buildDelta)
    + (separabilityScore * WEIGHTS.separability),
  );

  // ── 3. Build dimension breakdown ──────────────────────────

  const dimensionBreakdown = {
    stage0_acquirability: {
      raw_score: clampedStage0,
      weight: WEIGHTS.stage0,
      weighted_contribution: Math.round(clampedStage0 * WEIGHTS.stage0 * 10) / 10,
      source: stageData?.stage0 != null ? 'stageData' : 'database',
    },
    build_phase_delta: {
      raw_delta: Math.round(avgDeltaRaw * 100) / 100,
      normalized_score: Math.round(normalizedBuildDelta * 10) / 10,
      weight: WEIGHTS.buildDelta,
      weighted_contribution: Math.round(normalizedBuildDelta * WEIGHTS.buildDelta * 10) / 10,
      stages_with_data: buildDeltas.length,
      per_stage: buildDeltas.map(d => ({
        stage: d.stage,
        delta: d.delta,
        normalized: Math.round(normalizeDelta(d.delta) * 10) / 10,
      })),
      source: stageData?.buildDeltas != null ? 'stageData' : 'database',
    },
    separability: {
      raw_score: separabilityScore,
      weight: WEIGHTS.separability,
      weighted_contribution: Math.round(separabilityScore * WEIGHTS.separability * 10) / 10,
      dimensions: separabilityData ? {
        infrastructure_independence: separabilityData.infrastructure_independence ?? null,
        data_portability: separabilityData.data_portability ?? null,
        ip_clarity: separabilityData.ip_clarity ?? null,
        team_dependency: separabilityData.team_dependency ?? null,
        operational_autonomy: separabilityData.operational_autonomy ?? null,
      } : null,
      scored_at: separabilityData?.scored_at ?? null,
      source: stageData?.separabilityScore != null ? 'stageData' : 'database',
    },
  };

  // ── 4. Trend, recommendations, risks ──────────────────────

  const deltaValues = buildDeltas.map(d => d.delta);
  const trend = computeTrend(deltaValues);

  const recommendations = generateRecommendations({
    stage0Score: clampedStage0,
    normalizedBuildDelta,
    separabilityScore,
    overall: overallScore,
  });

  const riskFactors = identifyRiskFactors({
    stage0Score: stageData?.stage0 != null ? clampedStage0 : (stage0Score !== 50 ? clampedStage0 : null),
    buildDeltas,
    separabilityData,
    warnings,
  });

  // ── 5. Build report ───────────────────────────────────────

  const report = {
    overall_score: overallScore,
    dimension_breakdown: dimensionBreakdown,
    trend,
    recommendations,
    risk_factors: riskFactors,
    warnings,
    data_sources: {
      stage0_available: stageData?.stage0 != null || stage0Score !== 50,
      build_deltas_count: buildDeltas.length,
      separability_available: separabilityData !== null,
    },
    generated_at: new Date().toISOString(),
    venture_id: ventureId,
  };

  // ── 6. Write to DB (if supabase provided) ─────────────────

  if (supabase) {
    try {
      // Check if a current exit profile exists
      const { data: profile, error: profileError } = await supabase
        .from('venture_exit_profiles')
        .select('id')
        .eq('venture_id', ventureId)
        .eq('is_current', true)
        .maybeSingle();

      if (profileError) {
        logger.warn('[Stage24-Acquirability] Failed to query exit profile', { error: profileError.message });
        warnings.push(`DB query error when looking up exit profile: ${profileError.message}`);
      } else if (!profile) {
        logger.warn('[Stage24-Acquirability] No current exit profile found, skipping DB write');
        warnings.push('No current venture_exit_profiles row found; readiness_assessment not persisted to DB.');
      } else {
        const { error: updateError } = await supabase
          .from('venture_exit_profiles')
          .update({ readiness_assessment: report })
          .eq('id', profile.id);

        if (updateError) {
          logger.warn('[Stage24-Acquirability] Failed to write readiness_assessment', { error: updateError.message });
          warnings.push(`DB write error for readiness_assessment: ${updateError.message}`);
        } else {
          logger.log('[Stage24-Acquirability] Readiness assessment persisted to venture_exit_profiles', { profileId: profile.id });
        }
      }
    } catch (err) {
      logger.warn('[Stage24-Acquirability] Unexpected error during DB write', { error: err.message });
      warnings.push(`Unexpected DB write error: ${err.message}`);
    }
  }

  // ── 7. Return ─────────────────────────────────────────────

  const latencyMs = Date.now() - startTime;
  logger.log('[Stage24-Acquirability] Aggregation complete', {
    overallScore,
    trend,
    warningCount: warnings.length,
    latencyMs,
  });

  return {
    ...report,
    _soft_gate: true,
    _latencyMs: latencyMs,
  };
}

export { WEIGHTS, BUILD_PHASE_STAGES, normalizeDelta, computeTrend };
