/**
 * OKR Monthly Generator
 *
 * SD: SD-EHG-ORCH-GOVERNANCE-STACK-001-D (US-002, US-003, US-006)
 *
 * Generates new monthly OKRs from three inputs:
 *   1. EVA vision gap analysis (top-down)
 *   2. Strategy layer objectives (top-down)
 *   3. Completed SD retrospectives & issue pattern trends (bottom-up)
 *
 * Supports configurable 40% top-down / 60% bottom-up ratio.
 *
 * @module lib/eva/jobs/okr-monthly-generator
 */

const DEFAULT_TOP_DOWN_RATIO = parseFloat(process.env.OKR_TOP_DOWN_RATIO || '0.40');
const MIN_BOTTOM_UP_SDS = parseInt(process.env.OKR_MIN_BOTTOM_UP_SDS || '3', 10);
const _TARGET_KRS_PER_OBJECTIVE = 3;

/**
 * Run monthly OKR generation.
 *
 * @param {Object} deps
 * @param {Object} deps.supabase - Supabase client (service-role)
 * @param {Object} [deps.logger]  - Logger (defaults to console)
 * @param {boolean} [deps.dryRun] - If true, report plan without inserting
 * @returns {Promise<{generationId: string, objectivesCreated: number, krsCreated: number, ratio: {topDown: number, bottomUp: number}}>}
 */
export async function runOkrMonthlyGeneration({ supabase, logger = console, dryRun = false }) {
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const generationDate = now.toISOString().slice(0, 10);

  logger.log(`[OKR-Gen] Starting monthly generation for period: ${period}`);

  // 0. Check for existing generation this period
  const { data: existing } = await supabase
    .from('okr_generation_log')
    .select('id')
    .eq('period', period)
    .eq('status', 'completed')
    .limit(1);

  if (existing && existing.length > 0) {
    logger.log(`[OKR-Gen] Generation already completed for ${period} — skipping`);
    return { generationId: existing[0].id, objectivesCreated: 0, krsCreated: 0, ratio: { topDown: 0, bottomUp: 0 }, skipped: true };
  }

  // 1. Get active vision
  const { data: visions } = await supabase
    .from('strategic_vision')
    .select('id, code, title')
    .eq('is_active', true)
    .limit(1);

  const vision = visions?.[0];
  if (!vision) {
    throw new Error('No active strategic vision found');
  }

  // 2. Gather top-down inputs (vision gaps)
  const topDownKRs = await gatherTopDownInputs(supabase, vision.id, logger);

  // 3. Gather bottom-up inputs (SD retrospectives, patterns)
  const bottomUpKRs = await gatherBottomUpInputs(supabase, period, logger);

  // 4. Compute actual ratio
  const hasEnoughBottomUp = bottomUpKRs.length >= MIN_BOTTOM_UP_SDS;
  const targetTopDown = hasEnoughBottomUp ? DEFAULT_TOP_DOWN_RATIO : 1.0;
  const _targetBottomUp = hasEnoughBottomUp ? (1 - DEFAULT_TOP_DOWN_RATIO) : 0;

  const totalCandidates = topDownKRs.length + bottomUpKRs.length;
  const targetTopDownCount = Math.max(1, Math.round(totalCandidates * targetTopDown));
  const targetBottomUpCount = totalCandidates - targetTopDownCount;

  const selectedTopDown = topDownKRs.slice(0, targetTopDownCount);
  const selectedBottomUp = bottomUpKRs.slice(0, targetBottomUpCount);

  logger.log(`[OKR-Gen] Candidates: ${topDownKRs.length} top-down, ${bottomUpKRs.length} bottom-up`);
  logger.log(`[OKR-Gen] Selected: ${selectedTopDown.length} top-down, ${selectedBottomUp.length} bottom-up`);

  if (!hasEnoughBottomUp) {
    logger.log(`[OKR-Gen] Fallback: < ${MIN_BOTTOM_UP_SDS} completed SDs → 100% top-down`);
  }

  if (dryRun) {
    logger.log('[OKR-Gen] DRY RUN — no records inserted');
    return {
      generationId: null,
      objectivesCreated: 0,
      krsCreated: selectedTopDown.length + selectedBottomUp.length,
      ratio: { topDown: selectedTopDown.length, bottomUp: selectedBottomUp.length },
      candidates: { topDown: selectedTopDown, bottomUp: selectedBottomUp },
    };
  }

  // 5. Create generation log entry
  const { data: genLog, error: genLogError } = await supabase
    .from('okr_generation_log')
    .insert({
      generation_date: generationDate,
      period,
      vision_id: vision.id,
      top_down_count: selectedTopDown.length,
      bottom_up_count: selectedBottomUp.length,
      total_krs_generated: selectedTopDown.length + selectedBottomUp.length,
      top_down_ratio: selectedTopDown.length / Math.max(1, selectedTopDown.length + selectedBottomUp.length),
      bottom_up_ratio: selectedBottomUp.length / Math.max(1, selectedTopDown.length + selectedBottomUp.length),
      source_breakdown: {
        vision_gaps: selectedTopDown.map(kr => kr.source),
        sd_patterns: selectedBottomUp.map(kr => kr.source),
      },
      status: 'running',
    })
    .select('id')
    .single();

  if (genLogError) {
    throw new Error(`Failed to create generation log: ${genLogError.message}`);
  }

  // 6. Create objective for this period
  const objCode = `O-${period}-AUTO`;
  const { data: objective, error: objError } = await supabase
    .from('objectives')
    .upsert({
      vision_id: vision.id,
      code: objCode,
      title: `Monthly Objectives for ${period}`,
      description: `Auto-generated objectives for period ${period}`,
      cadence: 'quarterly',
      period,
      is_active: true,
      generation_id: genLog.id,
      created_by: 'okr-generator',
    }, { onConflict: 'code' })
    .select('id')
    .single();

  if (objError) {
    throw new Error(`Failed to create objective: ${objError.message}`);
  }

  // 7. Insert KRs
  let krsCreated = 0;
  const allKRs = [
    ...selectedTopDown.map((kr, i) => ({ ...kr, source_type: 'top_down', seq: i + 1 })),
    ...selectedBottomUp.map((kr, i) => ({ ...kr, source_type: 'bottom_up', seq: selectedTopDown.length + i + 1 })),
  ];

  for (const kr of allKRs) {
    const krCode = `KR-${period}-${String(kr.seq).padStart(2, '0')}`;
    const { error: krError } = await supabase
      .from('key_results')
      .upsert({
        objective_id: objective.id,
        code: krCode,
        title: kr.title,
        description: kr.description,
        metric_type: kr.metric_type || 'percentage',
        baseline_value: kr.baseline || 0,
        current_value: kr.current || 0,
        target_value: kr.target || 100,
        unit: kr.unit || '%',
        direction: kr.direction || 'increase',
        source_type: kr.source_type,
        vision_dimension_code: kr.vision_dimension_code || null,
        is_active: true,
        sequence: kr.seq,
        created_by: 'okr-generator',
      }, { onConflict: 'code' });

    if (krError) {
      logger.warn(`[OKR-Gen] Failed to insert KR ${krCode}: ${krError.message}`);
    } else {
      krsCreated++;
    }
  }

  // 8. Mark generation as completed
  await supabase
    .from('okr_generation_log')
    .update({ status: 'completed', total_krs_generated: krsCreated })
    .eq('id', genLog.id);

  logger.log(`[OKR-Gen] Complete: 1 objective, ${krsCreated} KRs for ${period}`);

  return {
    generationId: genLog.id,
    objectivesCreated: 1,
    krsCreated,
    ratio: { topDown: selectedTopDown.length, bottomUp: selectedBottomUp.length },
  };
}

/**
 * Gather top-down KR candidates from EVA vision gaps and strategy.
 * eva_vision_scores stores dimension_scores as JSONB: { "V01": { name, score, ... }, ... }
 */
async function gatherTopDownInputs(supabase, visionId, logger) {
  const krs = [];

  // Source 1: Latest EVA vision scores (dimensions with low scores)
  const { data: scores } = await supabase
    .from('eva_vision_scores')
    .select('dimension_scores')
    .order('scored_at', { ascending: false })
    .limit(1);

  if (scores && scores.length > 0 && scores[0].dimension_scores) {
    const dims = scores[0].dimension_scores;
    for (const [code, dim] of Object.entries(dims)) {
      const score = dim.score ?? 0;
      if (score < 70) {
        krs.push({
          title: `Improve ${dim.name || code} score from ${score}% to 80%`,
          description: `Vision dimension ${code} currently at ${score}%. Target 80% by end of period.`,
          metric_type: 'percentage',
          baseline: score,
          current: score,
          target: 80,
          unit: '%',
          direction: 'increase',
          vision_dimension_code: code,
          source: { type: 'vision_gap', dimension: code, current_score: score },
        });
      }
    }
  }

  // Source 2: EVA vision gaps table (if exists)
  const { data: gapRows } = await supabase
    .from('eva_vision_gaps')
    .select('dimension_code, dimension_name, gap_score, gap_description')
    .eq('status', 'open')
    .order('gap_score', { ascending: true })
    .limit(5);

  if (gapRows) {
    for (const gap of gapRows) {
      // Avoid duplicates from dimension_scores
      if (krs.some(kr => kr.vision_dimension_code === gap.dimension_code)) continue;
      krs.push({
        title: `Address gap: ${gap.gap_description?.slice(0, 80) || gap.dimension_name || gap.dimension_code}`,
        description: `Vision gap in ${gap.dimension_code}: ${gap.gap_description || 'Identified gap'}`,
        metric_type: 'percentage',
        baseline: gap.gap_score || 0,
        current: gap.gap_score || 0,
        target: 80,
        unit: '%',
        direction: 'increase',
        vision_dimension_code: gap.dimension_code,
        source: { type: 'vision_gap', dimension: gap.dimension_code, gap_score: gap.gap_score },
      });
    }
  }

  logger.log(`[OKR-Gen] Top-down candidates: ${krs.length} from vision gaps`);
  return krs;
}

/**
 * Gather bottom-up KR candidates from completed SD retrospectives and patterns.
 */
async function gatherBottomUpInputs(supabase, period, logger) {
  const krs = [];

  // Source: Recently completed SDs with retrospectives
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: retros } = await supabase
    .from('retrospectives')
    .select('sd_id, key_learnings, improvement_areas')
    .gte('created_at', thirtyDaysAgo)
    .eq('status', 'PUBLISHED')
    .limit(10);

  if (retros) {
    for (const retro of retros) {
      const areas = retro.improvement_areas;
      if (Array.isArray(areas) && areas.length > 0) {
        const area = areas[0];
        krs.push({
          title: `Address improvement area: ${typeof area === 'string' ? area : area.area || 'Process improvement'}`,
          description: `From retrospective of SD ${retro.sd_id}: ${typeof area === 'string' ? area : area.analysis || 'Identified improvement area'}`,
          metric_type: 'percentage',
          baseline: 0,
          current: 0,
          target: 100,
          unit: '%',
          direction: 'increase',
          source: { type: 'retrospective', sd_id: retro.sd_id },
        });
      }
    }
  }

  // Source: Active issue patterns with high frequency
  const { data: patterns } = await supabase
    .from('issue_patterns')
    .select('id, pattern_description, frequency_count, severity')
    .eq('status', 'active')
    .order('frequency_count', { ascending: false })
    .limit(5);

  if (patterns) {
    for (const pat of patterns) {
      krs.push({
        title: `Resolve pattern: ${pat.pattern_description?.slice(0, 80) || 'Recurring issue'}`,
        description: `Issue pattern with ${pat.frequency_count} occurrences, severity: ${pat.severity}`,
        metric_type: 'number',
        baseline: pat.frequency_count || 0,
        current: pat.frequency_count || 0,
        target: 0,
        unit: 'occurrences',
        direction: 'decrease',
        source: { type: 'issue_pattern', pattern_id: pat.id },
      });
    }
  }

  logger.log(`[OKR-Gen] Bottom-up candidates: ${krs.length} (${retros?.length || 0} retros, ${patterns?.length || 0} patterns)`);
  return krs;
}
