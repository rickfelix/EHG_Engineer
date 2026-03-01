/**
 * Compute Posture Health Scorer — V07 Dimension
 * SD: SD-MAN-ORCH-VISION-HEAL-SCORE-93-002-04-B
 *
 * Evaluates compute posture configuration completeness,
 * token tracking coverage, and cost threshold configuration.
 * Returns posture health score and monitoring gap analysis.
 *
 * @module lib/eva/compute-posture-scorer
 */

const EXPECTED_STAGE_TYPES = ['LEAD', 'PLAN', 'EXEC', 'REVIEW', 'DEFAULT'];
const REQUIRED_THRESHOLD_KEYS = ['warn', 'escalate'];
const REQUIRED_POSTURE_FIELDS = ['policy', 'costThresholds', 'blockOnExceed'];

/**
 * Score compute posture health and configuration completeness.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @param {Object} [options.posture] - Override posture config for testing
 * @param {number} [options.lookbackDays] - Days to look back for token usage
 * @returns {Promise<{ health: Object, configAnalysis: Object, tokenCoverage: Object, gaps: Array, error?: string }>}
 */
export async function scoreComputePosture(supabase, options = {}) {
  const { logger = console, posture, lookbackDays = 30 } = options;

  if (!supabase) {
    return { health: emptyHealth(), configAnalysis: emptyConfig(), tokenCoverage: emptyTokenCoverage(), gaps: [], error: 'No supabase client' };
  }

  try {
    // Load posture config (injected or from module)
    let postureConfig = posture;
    if (!postureConfig) {
      try {
        const mod = await import('../../lib/governance/compute-posture.js');
        postureConfig = mod.getComputePosture();
      } catch {
        // Fallback: define minimal posture
        postureConfig = {
          policy: 'awareness-not-enforcement',
          costThresholds: {},
          blockOnExceed: false,
        };
      }
    }

    const gaps = [];

    // 1. Configuration completeness
    const configAnalysis = analyzeConfig(postureConfig, gaps);

    // 2. Token tracking coverage
    const tokenCoverage = await analyzeTokenTracking(supabase, lookbackDays, logger, gaps);

    // 3. Cost threshold coverage
    const thresholdAnalysis = analyzeThresholds(postureConfig.costThresholds || {}, gaps);

    // Calculate overall health
    const configScore = configAnalysis.completenessPercent;
    const thresholdScore = thresholdAnalysis.coveragePercent;
    const tokenScore = tokenCoverage.activePercent;

    const overallHealth = Math.round((configScore + thresholdScore + tokenScore) / 3);

    return {
      health: {
        overallPercent: overallHealth,
        configScore,
        thresholdScore,
        tokenScore,
        gapCount: gaps.length,
        policy: postureConfig.policy,
        generatedAt: new Date().toISOString(),
      },
      configAnalysis,
      tokenCoverage,
      gaps,
    };
  } catch (err) {
    logger.warn(`[ComputePostureScorer] Error: ${err.message}`);
    return { health: emptyHealth(), configAnalysis: emptyConfig(), tokenCoverage: emptyTokenCoverage(), gaps: [], error: err.message };
  }
}

/**
 * Get posture health summary.
 * @param {Object} supabase - Supabase client
 * @param {Object} [options]
 * @returns {Promise<{ summary: Object, error?: string }>}
 */
export async function getPostureHealthSummary(supabase, options = {}) {
  const result = await scoreComputePosture(supabase, options);
  if (result.error) {
    return { summary: { healthPercent: 0, policy: 'unknown', gapCount: 0 }, error: result.error };
  }

  return {
    summary: {
      healthPercent: result.health.overallPercent,
      policy: result.health.policy,
      configScore: result.health.configScore,
      thresholdScore: result.health.thresholdScore,
      tokenScore: result.health.tokenScore,
      gapCount: result.health.gapCount,
    },
  };
}

/**
 * Get dimension info.
 * @returns {Object}
 */
export function getDimensionInfo() {
  return {
    dimension: 'V07',
    name: 'Compute Posture',
    description: 'Resource monitoring, cost awareness, and compute policy configuration',
    expectedStageTypes: [...EXPECTED_STAGE_TYPES],
    requiredThresholdKeys: [...REQUIRED_THRESHOLD_KEYS],
    requiredPostureFields: [...REQUIRED_POSTURE_FIELDS],
  };
}

// ── Internal Helpers ─────────────────────────────

function analyzeConfig(postureConfig, gaps) {
  let present = 0;
  const total = REQUIRED_POSTURE_FIELDS.length;

  for (const field of REQUIRED_POSTURE_FIELDS) {
    if (postureConfig[field] != null) {
      present++;
    } else {
      gaps.push({ category: 'config', item: field, issue: `Missing posture field: ${field}` });
    }
  }

  return {
    completenessPercent: total > 0 ? Math.round((present / total) * 100) : 0,
    presentFields: present,
    totalRequired: total,
    policy: postureConfig.policy || 'undefined',
  };
}

function analyzeThresholds(costThresholds, gaps) {
  let coveredStages = 0;
  const total = EXPECTED_STAGE_TYPES.length;

  for (const stageType of EXPECTED_STAGE_TYPES) {
    const threshold = costThresholds[stageType];
    if (!threshold) {
      gaps.push({ category: 'threshold', item: stageType, issue: `No cost threshold defined for ${stageType}` });
      continue;
    }

    let hasAllKeys = true;
    for (const key of REQUIRED_THRESHOLD_KEYS) {
      if (threshold[key] == null) {
        gaps.push({ category: 'threshold', item: `${stageType}.${key}`, issue: `Missing ${key} threshold for ${stageType}` });
        hasAllKeys = false;
      }
    }

    if (hasAllKeys) coveredStages++;
  }

  return {
    coveragePercent: total > 0 ? Math.round((coveredStages / total) * 100) : 0,
    coveredStages,
    totalExpected: total,
  };
}

async function analyzeTokenTracking(supabase, lookbackDays, logger, gaps) {
  try {
    const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: entries, error } = await supabase
      .from('venture_token_ledger')
      .select('venture_id, created_at')
      .gte('created_at', cutoff)
      .limit(100);

    if (error) {
      gaps.push({ category: 'tracking', item: 'token_ledger', issue: `Query error: ${error.message}` });
      return emptyTokenCoverage();
    }

    const records = entries || [];
    const ventureIds = new Set(records.map((r) => r.venture_id));

    return {
      totalEntries: records.length,
      uniqueVentures: ventureIds.size,
      activePercent: records.length > 0 ? 100 : 0,
      lookbackDays,
    };
  } catch (err) {
    logger.warn(`[ComputePostureScorer] Token tracking query: ${err.message}`);
    gaps.push({ category: 'tracking', item: 'token_ledger', issue: err.message });
    return emptyTokenCoverage();
  }
}

function emptyHealth() {
  return {
    overallPercent: 0,
    configScore: 0,
    thresholdScore: 0,
    tokenScore: 0,
    gapCount: 0,
    policy: 'unknown',
    generatedAt: new Date().toISOString(),
  };
}

function emptyConfig() {
  return {
    completenessPercent: 0,
    presentFields: 0,
    totalRequired: REQUIRED_POSTURE_FIELDS.length,
    policy: 'undefined',
  };
}

function emptyTokenCoverage() {
  return {
    totalEntries: 0,
    uniqueVentures: 0,
    activePercent: 0,
    lookbackDays: 30,
  };
}
