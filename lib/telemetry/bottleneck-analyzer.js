/**
 * Bottleneck Analyzer - Detects workflow bottlenecks from telemetry data
 *
 * SD: SD-LEO-ENH-WORKFLOW-TELEMETRY-AUTO-001B
 *
 * Queries workflow_trace_log, computes rolling baselines per dimension
 * (phase/gate/sub-agent), flags bottlenecks exceeding configurable thresholds,
 * and optionally creates improvement items in protocol_improvement_queue.
 *
 * @module telemetry/bottleneck-analyzer
 */

import { randomUUID } from 'crypto';

// Dimension types that map to workflow_trace_log columns
const DIMENSION_COLUMNS = {
  phase: 'phase',
  gate: 'gate_name',
  subagent: 'subagent_name',
};

/**
 * Load thresholds from telemetry_thresholds table with cascade:
 *   specific (type+key) > type default > global default
 *
 * @param {object} supabase - Supabase client
 * @returns {Promise<object>} Threshold config map
 */
async function loadThresholds(supabase) {
  const { data, error } = await supabase
    .from('telemetry_thresholds')
    .select('*')
    .order('dimension_type');

  if (error) {
    console.warn(`[Bottleneck] Failed to load thresholds: ${error.message}`);
    return { global: getDefaultThresholds() };
  }

  const map = {};
  for (const row of data || []) {
    const key = row.dimension_key
      ? `${row.dimension_type}:${row.dimension_key}`
      : row.dimension_type;
    map[key] = {
      threshold_ratio: Number(row.threshold_ratio),
      min_samples: row.min_samples,
      baseline_window_days: row.baseline_window_days,
      lookback_window_days: row.lookback_window_days,
      max_per_run: row.max_per_run,
      max_per_day: row.max_per_day,
      cooldown_hours: row.cooldown_hours,
      enable_auto_create: row.enable_auto_create,
    };
  }

  if (!map.global) map.global = getDefaultThresholds();
  return map;
}

function getDefaultThresholds() {
  return {
    threshold_ratio: 3.0,
    min_samples: 3,
    baseline_window_days: 7,
    lookback_window_days: 1,
    max_per_run: 3,
    max_per_day: 10,
    cooldown_hours: 24,
    enable_auto_create: true,
  };
}

/**
 * Resolve thresholds for a specific dimension, cascading from specific to global
 */
function resolveThresholds(thresholdMap, dimensionType, dimensionKey) {
  const specific = thresholdMap[`${dimensionType}:${dimensionKey}`];
  if (specific) return specific;
  const typeDefault = thresholdMap[dimensionType];
  if (typeDefault) return typeDefault;
  return thresholdMap.global || getDefaultThresholds();
}

/**
 * Compute p50 (median) from a sorted array of numbers
 */
function computeP50(values) {
  if (!values || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Main analysis function
 *
 * @param {object} supabase - Supabase client
 * @param {object} [opts={}] - Options
 * @param {number} [opts.lookbackDays] - Override lookback window
 * @param {number} [opts.thresholdMultiplier] - Override threshold ratio
 * @param {boolean} [opts.enableAutoCreate] - Override auto-create flag
 * @param {string} [opts.runId] - Correlation ID for this run
 * @returns {Promise<object>} Analysis result
 */
export async function analyzeBottlenecks(supabase, opts = {}) {
  const runId = opts.runId || randomUUID();
  const result = {
    run_id: runId,
    traces_scanned: 0,
    dimensions_evaluated: 0,
    bottlenecks: [],
    items_created: 0,
    items_skipped_rate_limit: 0,
    items_skipped_dedupe: 0,
    errors: [],
  };

  // Step 1: Load thresholds
  const thresholdMap = await loadThresholds(supabase);
  const globalThresholds = thresholdMap.global || getDefaultThresholds();

  const baselineWindowDays = opts.lookbackDays || globalThresholds.baseline_window_days;
  const lookbackWindowDays = globalThresholds.lookback_window_days;
  const enableAutoCreate = opts.enableAutoCreate ?? globalThresholds.enable_auto_create;

  const now = new Date();
  const baselineStart = new Date(now - baselineWindowDays * 86400000);
  const analysisStart = new Date(now - lookbackWindowDays * 86400000);

  console.log(`[Bottleneck] Run ${runId.substring(0, 8)}: baseline=${baselineWindowDays}d, lookback=${lookbackWindowDays}d`);

  // Step 2: Query traces for baseline window
  const { data: traces, error: queryError } = await supabase
    .from('workflow_trace_log')
    .select('span_type, span_name, phase, gate_name, subagent_name, duration_ms, start_time_ms, created_at, trace_id')
    .gte('created_at', baselineStart.toISOString())
    .not('duration_ms', 'is', null)
    .gt('duration_ms', 0)
    .order('created_at', { ascending: false })
    .limit(10000);

  if (queryError) {
    const sanitizedMsg = queryError.message.replace(/password=[^&\s]+/gi, 'password=***');
    console.error(`[Bottleneck] db_connection_error: ${sanitizedMsg}`);
    result.errors.push(`db_connection_error: ${sanitizedMsg}`);
    return result;
  }

  if (!traces || traces.length === 0) {
    console.log('[Bottleneck] No traces found in baseline window');
    return result;
  }

  result.traces_scanned = traces.length;
  console.log(`[Bottleneck] Scanned ${traces.length} traces`);

  // Step 3: Group traces by dimension
  const dimensions = new Map();
  const analysisStartMs = analysisStart.getTime();

  for (const trace of traces) {
    for (const [dimType, colName] of Object.entries(DIMENSION_COLUMNS)) {
      const dimKey = trace[colName];
      if (!dimKey) continue;

      const mapKey = `${dimType}:${dimKey}`;
      if (!dimensions.has(mapKey)) {
        dimensions.set(mapKey, {
          dimension_type: dimType,
          dimension_key: dimKey,
          baseline_durations: [],
          analysis_durations: [],
          evidence_trace_ids: [],
        });
      }

      const dim = dimensions.get(mapKey);
      const createdAt = new Date(trace.created_at).getTime();
      dim.baseline_durations.push(trace.duration_ms);

      if (createdAt >= analysisStartMs) {
        dim.analysis_durations.push(trace.duration_ms);
        if (dim.evidence_trace_ids.length < 5) {
          dim.evidence_trace_ids.push(trace.trace_id);
        }
      }
    }
  }

  result.dimensions_evaluated = dimensions.size;
  console.log(`[Bottleneck] Evaluated ${dimensions.size} dimensions`);

  // Step 4: Detect bottlenecks
  const allBottlenecks = [];

  for (const [_, dim] of dimensions) {
    if (dim.analysis_durations.length === 0) continue;

    const thresholds = resolveThresholds(thresholdMap, dim.dimension_type, dim.dimension_key);
    const thresholdRatio = opts.thresholdMultiplier || thresholds.threshold_ratio;
    const minSamples = thresholds.min_samples;

    const baselineP50 = computeP50(dim.baseline_durations);
    const analysisP50 = computeP50(dim.analysis_durations);

    if (baselineP50 <= 0) continue;

    const ratio = analysisP50 / baselineP50;
    const exceedanceCount = dim.analysis_durations.filter(
      d => d >= baselineP50 * thresholdRatio
    ).length;

    if (ratio >= thresholdRatio && exceedanceCount >= minSamples) {
      allBottlenecks.push({
        dimension_type: dim.dimension_type,
        dimension_key: dim.dimension_key,
        dimension_name: dim.dimension_key,
        baseline_p50_ms: Math.round(baselineP50),
        baseline_ms: Math.round(baselineP50),
        observed_p50_ms: Math.round(analysisP50),
        p50_ms: Math.round(analysisP50),
        ratio: Math.round(ratio * 100) / 100,
        sample_count: dim.analysis_durations.length,
        exceedance_count: exceedanceCount,
        first_seen_at: null,
        last_seen_at: null,
        evidence_trace_ids: dim.evidence_trace_ids,
        improvement_id: null,
      });
    }
  }

  // Sort by ratio desc, then observed_p50_ms desc
  allBottlenecks.sort((a, b) => b.ratio - a.ratio || b.observed_p50_ms - a.observed_p50_ms);
  result.bottlenecks = allBottlenecks;

  console.log(`[Bottleneck] Found ${allBottlenecks.length} bottleneck(s)`);

  // Step 5: Auto-create improvement items (with rate limiting)
  if (enableAutoCreate && allBottlenecks.length > 0) {
    const maxPerRun = globalThresholds.max_per_run;
    const maxPerDay = globalThresholds.max_per_day;
    const cooldownHours = globalThresholds.cooldown_hours;

    // Check daily limit
    const dayAgo = new Date(now - 86400000).toISOString();
    const { data: recentItems } = await supabase
      .from('protocol_improvement_queue')
      .select('id, description, created_at')
      .eq('source_type', 'TELEMETRY_AUTO_ANALYSIS')
      .gte('created_at', dayAgo);

    const dailyCount = recentItems?.length || 0;
    const dailyRemaining = Math.max(0, maxPerDay - dailyCount);
    const runLimit = Math.min(maxPerRun, dailyRemaining);

    let created = 0;

    for (const bottleneck of allBottlenecks) {
      if (created >= runLimit) {
        result.items_skipped_rate_limit++;
        console.log(`[Bottleneck] Rate limit: skipped ${bottleneck.dimension_type}:${bottleneck.dimension_key}`);
        continue;
      }

      // Dedupe check
      const dedupeKey = `telemetry_bottleneck:${bottleneck.dimension_type}:${bottleneck.dimension_key}`;
      const cooldownCutoff = new Date(now - cooldownHours * 3600000).toISOString();

      const { data: existing } = await supabase
        .from('protocol_improvement_queue')
        .select('id, status')
        .or('status.eq.PENDING,status.eq.APPROVED,status.eq.IN_PROGRESS')
        .eq('source_type', 'TELEMETRY_AUTO_ANALYSIS')
        .ilike('description', `%${bottleneck.dimension_type}:${bottleneck.dimension_key}%`)
        .limit(1);

      // Also check cooldown
      const { data: recentDupe } = await supabase
        .from('protocol_improvement_queue')
        .select('id')
        .eq('source_type', 'TELEMETRY_AUTO_ANALYSIS')
        .ilike('description', `%${bottleneck.dimension_type}:${bottleneck.dimension_key}%`)
        .gte('created_at', cooldownCutoff)
        .limit(1);

      if ((existing && existing.length > 0) || (recentDupe && recentDupe.length > 0)) {
        result.items_skipped_dedupe++;
        console.log(`[Bottleneck] Dedupe: skipped ${bottleneck.dimension_type}:${bottleneck.dimension_key}`);
        continue;
      }

      // Create improvement item
      const { data: inserted, error: insertError } = await supabase
        .from('protocol_improvement_queue')
        .insert({
          source_type: 'TELEMETRY_AUTO_ANALYSIS',
          improvement_type: 'PERFORMANCE_BOTTLENECK',
          target_table: 'workflow_trace_log',
          target_operation: 'ANALYZE',
          target_phase: 'ALL',
          description: `Bottleneck detected: ${bottleneck.dimension_type}:${bottleneck.dimension_key} ` +
            `(${bottleneck.ratio}x baseline, p50=${bottleneck.observed_p50_ms}ms vs baseline=${bottleneck.baseline_p50_ms}ms, ` +
            `${bottleneck.sample_count} samples)`,
          evidence_count: bottleneck.evidence_trace_ids.length,
          payload: {
            source: 'telemetry_auto_analysis',
            requires_review: true,
            run_id: runId,
            dimension_type: bottleneck.dimension_type,
            dimension_key: bottleneck.dimension_key,
            ratio: bottleneck.ratio,
            baseline_p50_ms: bottleneck.baseline_p50_ms,
            observed_p50_ms: bottleneck.observed_p50_ms,
            sample_count: bottleneck.sample_count,
            exceedance_count: bottleneck.exceedance_count,
            evidence_trace_ids: bottleneck.evidence_trace_ids,
            analysis_window_start: analysisStart.toISOString(),
            analysis_window_end: now.toISOString(),
            dedupe_key: dedupeKey,
          },
          status: 'PENDING',
          auto_applicable: false,
          risk_tier: 'GOVERNED',
          rollback_eligible: false,
        })
        .select('id')
        .single();

      if (insertError) {
        console.warn(`[Bottleneck] Failed to create item: ${insertError.message}`);
        result.errors.push(`create_failed:${bottleneck.dimension_key}: ${insertError.message}`);
        continue;
      }

      bottleneck.improvement_id = inserted.id;
      created++;
      result.items_created++;
      console.log(`[Bottleneck] Created improvement: ${inserted.id} for ${bottleneck.dimension_type}:${bottleneck.dimension_key}`);
    }

    if (allBottlenecks.length > created) {
      console.log(`[Bottleneck] ${allBottlenecks.length - created} bottleneck(s) skipped (rate limit: ${result.items_skipped_rate_limit}, dedupe: ${result.items_skipped_dedupe})`);
    }
  }

  return result;
}
