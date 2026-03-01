/**
 * OKR Cascade Resolver — Strategic Cascade Path Resolution
 * SD: SD-MAN-ORCH-VISION-HEAL-SCORE-93-002-03-B
 *
 * Resolves full cascade paths from portfolio-level objectives
 * through key results down to SD contributions. Provides coverage
 * analysis and gap detection for the strategic cascade.
 *
 * @module lib/eva/okr-cascade-resolver
 */

/**
 * Resolve the full OKR cascade from objectives to SDs.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @param {string} [options.visionId] - Filter by specific vision
 * @returns {Promise<{ cascade: Array, totalObjectives: number, totalKRs: number, totalAlignments: number, error?: string }>}
 */
export async function resolveCascade(supabase, options = {}) {
  const { logger = console, visionId } = options;

  if (!supabase) {
    return emptyCascade('No supabase client');
  }

  try {
    // Load objectives
    let objQuery = supabase.from('objectives').select('id, title, description, cadence, status, vision_id');
    if (visionId) objQuery = objQuery.eq('vision_id', visionId);
    const { data: objectives, error: objError } = await objQuery;

    if (objError) {
      logger.warn(`[CascadeResolver] Objectives query failed: ${objError.message}`);
      return emptyCascade(objError.message);
    }

    if (!objectives || objectives.length === 0) {
      return emptyCascade(null);
    }

    // Load key results
    const objectiveIds = objectives.map((o) => o.id);
    const { data: keyResults, error: krError } = await supabase
      .from('key_results')
      .select('id, objective_id, title, metric_name, baseline_value, current_value, target_value, status')
      .in('objective_id', objectiveIds);

    if (krError) {
      logger.warn(`[CascadeResolver] Key results query failed: ${krError.message}`);
    }

    const krs = keyResults || [];

    // Load SD alignments
    const krIds = krs.map((kr) => kr.id);
    let alignments = [];
    if (krIds.length > 0) {
      const { data: aligns, error: alignError } = await supabase
        .from('sd_key_result_alignment')
        .select('id, sd_id, key_result_id, contribution_type, alignment_weight')
        .in('key_result_id', krIds);

      if (alignError) {
        logger.warn(`[CascadeResolver] Alignments query failed: ${alignError.message}`);
      }
      alignments = aligns || [];
    }

    // Build cascade tree
    const cascade = buildCascadeTree(objectives, krs, alignments);

    return {
      cascade,
      totalObjectives: objectives.length,
      totalKRs: krs.length,
      totalAlignments: alignments.length,
    };
  } catch (err) {
    logger.warn(`[CascadeResolver] Resolve error: ${err.message}`);
    return emptyCascade(err.message);
  }
}

/**
 * Get objectives and key results with no SD alignments.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{ gaps: Array, totalGaps: number, error?: string }>}
 */
export async function getCoverageGaps(supabase, options = {}) {
  const { logger = console } = options;

  const { cascade, error } = await resolveCascade(supabase, options);
  if (error) {
    return { gaps: [], totalGaps: 0, error };
  }

  const gaps = [];

  for (const obj of cascade) {
    if (obj.keyResults.length === 0) {
      gaps.push({
        type: 'objective_no_krs',
        objectiveId: obj.objectiveId,
        objectiveTitle: obj.title,
        severity: 'high',
      });
      continue;
    }

    for (const kr of obj.keyResults) {
      if (kr.alignments.length === 0) {
        gaps.push({
          type: 'kr_no_alignments',
          objectiveId: obj.objectiveId,
          objectiveTitle: obj.title,
          keyResultId: kr.keyResultId,
          keyResultTitle: kr.title,
          severity: 'medium',
        });
      }
    }

    if (obj.coveragePercent === 0) {
      gaps.push({
        type: 'objective_no_sd_coverage',
        objectiveId: obj.objectiveId,
        objectiveTitle: obj.title,
        severity: 'high',
      });
    }
  }

  return { gaps, totalGaps: gaps.length };
}

/**
 * Get portfolio-level OKR coverage summary.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{ summary: Object, error?: string }>}
 */
export async function getCoverageSummary(supabase, options = {}) {
  const { cascade, totalObjectives, totalKRs, totalAlignments, error } =
    await resolveCascade(supabase, options);

  if (error) {
    return {
      summary: {
        overallCoverage: 0,
        objectivesCovered: 0,
        totalObjectives: 0,
        krsCovered: 0,
        totalKRs: 0,
        alignmentHealth: 0,
        generatedAt: new Date().toISOString(),
      },
      error,
    };
  }

  const coveredObjectives = cascade.filter((o) => o.coveragePercent > 0).length;
  const allKRs = cascade.flatMap((o) => o.keyResults);
  const coveredKRs = allKRs.filter((kr) => kr.alignments.length > 0).length;

  const overallCoverage = totalObjectives > 0
    ? Math.round((coveredObjectives / totalObjectives) * 100)
    : 0;

  const krCoverage = totalKRs > 0
    ? Math.round((coveredKRs / totalKRs) * 100)
    : 0;

  // Alignment health: weighted by contribution types
  const alignmentHealth = calculateAlignmentHealth(cascade);

  return {
    summary: {
      overallCoverage,
      objectivesCovered: coveredObjectives,
      totalObjectives,
      krsCovered: coveredKRs,
      totalKRs,
      totalAlignments,
      krCoverage,
      alignmentHealth,
      generatedAt: new Date().toISOString(),
    },
  };
}

// ── Internal Helpers ─────────────────────────────

function emptyCascade(error) {
  return {
    cascade: [],
    totalObjectives: 0,
    totalKRs: 0,
    totalAlignments: 0,
    ...(error ? { error } : {}),
  };
}

function buildCascadeTree(objectives, keyResults, alignments) {
  const krByObjective = groupBy(keyResults, 'objective_id');
  const alignByKR = groupBy(alignments, 'key_result_id');

  return objectives.map((obj) => {
    const krs = (krByObjective[obj.id] || []).map((kr) => {
      const krAligns = alignByKR[kr.id] || [];
      return {
        keyResultId: kr.id,
        title: kr.title,
        metricName: kr.metric_name,
        baseline: kr.baseline_value,
        current: kr.current_value,
        target: kr.target_value,
        status: kr.status,
        progressPercent: calculateKRProgress(kr),
        alignments: krAligns.map((a) => ({
          sdId: a.sd_id,
          contributionType: a.contribution_type,
          weight: a.alignment_weight,
        })),
      };
    });

    const totalKRsForObj = krs.length;
    const coveredKRs = krs.filter((kr) => kr.alignments.length > 0).length;
    const coveragePercent = totalKRsForObj > 0
      ? Math.round((coveredKRs / totalKRsForObj) * 100)
      : 0;

    return {
      objectiveId: obj.id,
      title: obj.title,
      description: obj.description,
      cadence: obj.cadence,
      status: obj.status,
      visionId: obj.vision_id,
      keyResults: krs,
      coveragePercent,
      depth: krs.some((kr) => kr.alignments.length > 0) ? 3 : (krs.length > 0 ? 2 : 1),
    };
  });
}

function calculateKRProgress(kr) {
  const baseline = parseFloat(kr.baseline_value) || 0;
  const current = parseFloat(kr.current_value) || 0;
  const target = parseFloat(kr.target_value) || 100;

  if (target === baseline) return current >= target ? 100 : 0;
  const progress = ((current - baseline) / (target - baseline)) * 100;
  return Math.max(0, Math.min(100, Math.round(progress)));
}

function calculateAlignmentHealth(cascade) {
  const CONTRIBUTION_WEIGHTS = { direct: 1.5, enabling: 1.0, supporting: 0.5 };
  let totalWeight = 0;
  let alignmentCount = 0;

  for (const obj of cascade) {
    for (const kr of obj.keyResults) {
      for (const align of kr.alignments) {
        totalWeight += CONTRIBUTION_WEIGHTS[align.contributionType] || 0.5;
        alignmentCount++;
      }
    }
  }

  if (alignmentCount === 0) return 0;
  // Health = average weighted contribution (normalized to 0-100)
  const avgWeight = totalWeight / alignmentCount;
  return Math.round((avgWeight / 1.5) * 100); // 1.5 is max (direct)
}

function groupBy(items, key) {
  const map = {};
  for (const item of items) {
    const val = item[key];
    if (!map[val]) map[val] = [];
    map[val].push(item);
  }
  return map;
}
