/**
 * Intelligent SD Duration Estimator
 *
 * Provides accurate duration estimates using multi-factor scoring:
 * 1. SD Type Baseline (median from historical data)
 * 2. Priority Multiplier (critical=1.3x, high=1.1x, etc.)
 * 3. Orchestrator Child Count adjustment
 * 4. Recency-Weighted Learning (recent SDs count more)
 * 5. Same Category Matching
 * 6. Session-aware calibration (rolling median from current session)
 * 7. Active-time measurement (excludes idle gaps >30m)
 * 8. SD key pattern sub-bucketing
 */

// Configurable: gaps longer than this between handoffs are considered idle time
const IDLE_GAP_THRESHOLD_MINUTES = 30;

// Minimum session completions before session calibration kicks in
const SESSION_CALIBRATION_MIN = 3;

// Minimum sub-bucket size before falling back to parent category
const SUB_BUCKET_MIN_SIZE = 5;

// SD key prefix patterns for sub-bucketing
const KEY_PREFIX_PATTERNS = [
  { pattern: /^SD-.*-OPS-/, label: 'OPS' },
  { pattern: /^SD-.*-LEARN-FIX-/, label: 'LEARN-FIX' },
  { pattern: /^SD-.*-WIRE-/, label: 'WIRE' },
  { pattern: /^SD-.*-BLUEPRINT-/, label: 'BLUEPRINT' },
  { pattern: /^SD-.*-MAN-/, label: 'MAN' },
];

// Baseline durations by SD type (median from actual data)
const TYPE_BASELINES = {
  infrastructure: 50,
  orchestrator: 155,
  documentation: 20,
  bugfix: 35,
  database: 100,
  feature: 145,
  refactor: 80,
  docs: 15,
  qa: 75,
  security: 120,
  ux_debt: 10,
  discovery_spike: 15,
  implementation: 10,
  default: 60
};

// Priority multipliers
const PRIORITY_MULTIPLIERS = {
  critical: 1.3,
  high: 1.1,
  medium: 1.0,
  low: 0.9,
  default: 1.0
};

// --- Session Completion Tracker (Tier 1) ---
// Module-level state: persists across calls within the same process
const sessionCompletions = [];

/**
 * Register a completed SD in the session tracker
 * @param {Object} completion - { sdKey, sdType, durationMinutes, sdKeyPrefix }
 */
export function registerCompletion(completion) {
  sessionCompletions.push({
    ...completion,
    completedAt: new Date(),
    sdKeyPrefix: extractKeyPrefix(completion.sdKey),
  });
}

/**
 * Get session statistics for a given SD type
 * @param {string} sdType - Filter by type (optional)
 * @returns {{ n: number, median: number, completions: Array }}
 */
export function getSessionStats(sdType = null) {
  const filtered = sdType
    ? sessionCompletions.filter(c => c.sdType === sdType)
    : sessionCompletions;
  return {
    n: filtered.length,
    median: calculateMedian(filtered.map(c => c.durationMinutes)),
    completions: filtered,
  };
}

/**
 * Extract SD key prefix for sub-bucketing
 * @param {string} sdKey
 * @returns {string|null}
 */
function extractKeyPrefix(sdKey) {
  if (!sdKey) return null;
  for (const { pattern, label } of KEY_PREFIX_PATTERNS) {
    if (pattern.test(sdKey)) return label;
  }
  return null;
}

// --- Active-Time Computation (Tier 2) ---

/**
 * Compute active-time from a sorted array of timestamps, excluding idle gaps
 * @param {string[]} timestamps - Sorted ascending
 * @returns {{ activeMinutes: number, wallClockMinutes: number, gapsExcluded: number }}
 */
function computeActiveTime(timestamps) {
  if (timestamps.length < 2) return { activeMinutes: 0, wallClockMinutes: 0, gapsExcluded: 0 };

  const first = new Date(timestamps[0]);
  const last = new Date(timestamps[timestamps.length - 1]);
  const wallClockMinutes = Math.round((last - first) / (1000 * 60));

  let activeMinutes = 0;
  let gapsExcluded = 0;
  for (let i = 0; i < timestamps.length - 1; i++) {
    const interval = Math.round((new Date(timestamps[i + 1]) - new Date(timestamps[i])) / (1000 * 60));
    if (interval <= IDLE_GAP_THRESHOLD_MINUTES) {
      activeMinutes += interval;
    } else {
      gapsExcluded++;
    }
  }

  return { activeMinutes, wallClockMinutes, gapsExcluded };
}

/**
 * Get historical duration data from handoffs (active work time, excluding idle gaps)
 * @param {SupabaseClient} supabase
 * @param {string} sdType - Optional filter by type
 * @param {string} category - Optional filter by category
 * @returns {Promise<Array>} Array of { sdId, sdKey, sdType, category, priority, durationMinutes, wallClockMinutes, completedAt, sdKeyPrefix }
 */
export async function getHistoricalDurations(supabase, sdType = null, category = null) {
  // Get completed SDs
  let query = supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, sd_type, category, priority, completion_date')
    .eq('status', 'completed');

  if (sdType) {
    query = query.eq('sd_type', sdType);
  }
  if (category) {
    query = query.eq('category', category);
  }

  const { data: sds, error } = await query;
  if (error || !sds || sds.length === 0) return [];

  // Build SD lookup map
  const sdMap = new Map();
  for (const sd of sds) {
    sdMap.set(sd.id, sd);
  }
  const sdIds = Array.from(sdMap.keys());

  // Batch fetch ALL accepted handoffs for all completed SDs in one query
  const CHUNK_SIZE = 200;
  const allHandoffs = [];
  for (let i = 0; i < sdIds.length; i += CHUNK_SIZE) {
    const chunk = sdIds.slice(i, i + CHUNK_SIZE);
    const { data: handoffs } = await supabase
      .from('sd_phase_handoffs')
      .select('sd_id, created_at')
      .in('sd_id', chunk)
      .eq('status', 'accepted')
      .order('created_at', { ascending: true });
    if (handoffs) {
      allHandoffs.push(...handoffs);
    }
  }

  // Group handoffs by sd_id
  const handoffsBySd = new Map();
  for (const h of allHandoffs) {
    if (!handoffsBySd.has(h.sd_id)) {
      handoffsBySd.set(h.sd_id, []);
    }
    handoffsBySd.get(h.sd_id).push(h.created_at);
  }

  // Compute durations using active-time (Tier 2)
  const results = [];
  for (const [sdId, timestamps] of handoffsBySd) {
    if (timestamps.length >= 2) {
      const { activeMinutes, wallClockMinutes } = computeActiveTime(timestamps);

      // Use active-time as the primary duration
      const minutes = activeMinutes > 0 ? activeMinutes : wallClockMinutes;

      // Filter out invalid durations (negative, zero, or > 24 hours)
      if (minutes > 0 && minutes < 1440) {
        const sd = sdMap.get(sdId);
        results.push({
          sdId: sd.id,
          sdKey: sd.sd_key,
          sdType: sd.sd_type,
          sdKeyPrefix: extractKeyPrefix(sd.sd_key),
          category: sd.category,
          priority: sd.priority,
          durationMinutes: minutes,
          wallClockMinutes,
          completedAt: sd.completion_date
        });
      }
    }
  }

  return results;
}

/**
 * Calculate median of an array
 */
function calculateMedian(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Get child count for an orchestrator SD
 */
async function getChildCount(supabase, sdId) {
  const { count } = await supabase
    .from('strategic_directives_v2')
    .select('id', { count: 'exact', head: true })
    .eq('parent_sd_id', sdId);
  return count || 0;
}

/**
 * Get elapsed time for an SD (from first handoff or created_at)
 * @param {SupabaseClient} supabase
 * @param {Object} sd - Strategic Directive
 * @returns {Promise<Object>} { elapsedMinutes, startedAt, source }
 */
async function getElapsedTime(supabase, sd) {
  // Try to get first handoff
  const { data: handoffs } = await supabase
    .from('sd_phase_handoffs')
    .select('created_at')
    .eq('sd_id', sd.id)
    .order('created_at', { ascending: true })
    .limit(1);

  let startedAt = null;
  let source = 'created_at';

  if (handoffs && handoffs.length > 0) {
    // Ensure UTC parsing by appending Z if not present
    const timestamp = handoffs[0].created_at.endsWith('Z')
      ? handoffs[0].created_at
      : handoffs[0].created_at + 'Z';
    startedAt = new Date(timestamp);
    source = 'first_handoff';
  } else if (sd.created_at) {
    const timestamp = sd.created_at.endsWith('Z')
      ? sd.created_at
      : sd.created_at + 'Z';
    startedAt = new Date(timestamp);
    source = 'created_at';
  }

  if (!startedAt) {
    return { elapsedMinutes: 0, startedAt: null, source: 'unknown' };
  }

  const now = new Date();
  const elapsedMinutes = Math.max(0, Math.round((now - startedAt) / (1000 * 60)));

  return { elapsedMinutes, startedAt, source };
}

/**
 * Get parent SD estimate if this is a child SD
 * @param {SupabaseClient} supabase
 * @param {Object} sd - Strategic Directive
 * @returns {Promise<Object|null>} Parent estimate info or null
 */
async function getParentEstimate(supabase, sd) {
  if (!sd.parent_sd_id) {
    return null;
  }

  const { data: parent } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, sd_type, priority, category, created_at, parent_sd_id')
    .eq('id', sd.parent_sd_id)
    .single();

  if (!parent) {
    return null;
  }

  const parentEstimate = await getEstimatedDuration(supabase, parent, { includeParent: false });
  const parentElapsed = await getElapsedTime(supabase, parent);

  const { data: siblings } = await supabase
    .from('strategic_directives_v2')
    .select('id, status')
    .eq('parent_sd_id', parent.id);

  const siblingCount = siblings?.length || 0;
  const completedCount = siblings?.filter(s => s.status === 'completed').length || 0;

  return {
    parentId: parent.id,
    parentTitle: parent.title,
    parentEstimateMinutes: parentEstimate.estimateMinutes,
    parentEstimateFormatted: parentEstimate.estimateFormatted,
    parentElapsedMinutes: parentElapsed.elapsedMinutes,
    parentElapsedFormatted: formatMinutes(parentElapsed.elapsedMinutes),
    parentRemainingMinutes: Math.max(0, parentEstimate.estimateMinutes - parentElapsed.elapsedMinutes),
    parentRemainingFormatted: formatMinutes(Math.max(0, parentEstimate.estimateMinutes - parentElapsed.elapsedMinutes)),
    siblingCount,
    completedCount,
    progressPercent: siblingCount > 0 ? Math.round((completedCount / siblingCount) * 100) : 0
  };
}

/**
 * Get intelligent duration estimate for an SD
 * @param {SupabaseClient} supabase
 * @param {Object} sd - Strategic Directive { id, sd_key, sd_type, category, priority }
 * @param {Object} options - { includeParent: true } to include parent estimate
 * @returns {Promise<Object>} Estimate with confidence and factors
 */
export async function getEstimatedDuration(supabase, sd, options = { includeParent: true }) {
  const sdType = sd.sd_type || 'default';
  const priority = sd.priority || 'medium';
  const category = sd.category;
  const sdKey = sd.sd_key || '';
  const sdKeyPrefix = extractKeyPrefix(sdKey);

  // Get historical data (now uses active-time via Tier 2)
  const allHistory = await getHistoricalDurations(supabase, sdType);
  const categoryHistory = category
    ? allHistory.filter(h => h.category === category)
    : [];

  // Track which source provided the estimate
  let estimateSource = 'default';

  // Factor 1: Base estimate from type
  let estimate = TYPE_BASELINES[sdType] || TYPE_BASELINES.default;
  const factors = [`Base (${sdType}): ${formatMinutes(estimate)}`];

  // Factor 2: Priority multiplier
  const priorityMult = PRIORITY_MULTIPLIERS[priority] || 1.0;
  if (priorityMult !== 1.0) {
    estimate = Math.round(estimate * priorityMult);
    const pctChange = Math.round((priorityMult - 1) * 100);
    factors.push(`Priority (${priority}): ${pctChange >= 0 ? '+' : ''}${pctChange}%`);
  }

  // Factor 3: Orchestrator child count
  if (sdType === 'orchestrator') {
    const childCount = await getChildCount(supabase, sd.id);
    let childMult = 1.0;
    if (childCount >= 7) childMult = 2.0;
    else if (childCount >= 4) childMult = 1.5;

    if (childMult > 1.0) {
      estimate = Math.round(estimate * childMult);
      factors.push(`Child SDs (${childCount}): +${Math.round((childMult - 1) * 100)}%`);
    }
  }

  // Factor 4: SD key prefix sub-bucketing (Tier 3)
  if (sdKeyPrefix && allHistory.length > 0) {
    const subBucket = allHistory.filter(h => h.sdKeyPrefix === sdKeyPrefix);
    if (subBucket.length >= SUB_BUCKET_MIN_SIZE) {
      const subMedian = calculateMedian(subBucket.map(h => h.durationMinutes));
      estimate = Math.round(estimate * 0.3 + subMedian * 0.7);
      factors.push(`Sub-bucket ${sdKeyPrefix} (${subBucket.length} SDs): blended`);
      estimateSource = 'historical';
    }
  }

  // Factor 5: Category-specific adjustment
  if (categoryHistory.length >= 3) {
    const categoryMedian = calculateMedian(categoryHistory.map(h => h.durationMinutes));
    // Blend 40% base + 60% category-specific
    estimate = Math.round(estimate * 0.4 + categoryMedian * 0.6);
    factors.push(`Category match (${categoryHistory.length} SDs): blended`);
    estimateSource = 'historical';
  }

  // Factor 6: Recency adjustment (last 14 days)
  const now = new Date();
  const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000);
  const recentHistory = allHistory.filter(
    h => h.completedAt && new Date(h.completedAt) > fourteenDaysAgo
  );

  if (recentHistory.length >= 3) {
    const recentMedian = calculateMedian(recentHistory.map(h => h.durationMinutes));
    // Blend 60% current + 40% recent
    estimate = Math.round(estimate * 0.6 + recentMedian * 0.4);
    factors.push(`Recent trend (${recentHistory.length} SDs): adjusted`);
    estimateSource = 'historical';
  }

  // Factor 7: Session calibration (Tier 1) — overrides when sufficient data
  const sessionStats = getSessionStats(sdType);
  if (sessionStats.n >= SESSION_CALIBRATION_MIN) {
    // Blend 70% session + 30% historical
    estimate = Math.round(sessionStats.median * 0.7 + estimate * 0.3);
    factors.push(`Session calibrated (${sessionStats.n} SDs, median ${formatMinutes(sessionStats.median)}): 70/30 blend`);
    estimateSource = 'session-calibrated';
  }

  // Determine confidence
  const sampleSize = allHistory.length;
  let confidence;
  if (estimateSource === 'session-calibrated') confidence = 'high';
  else if (sampleSize >= 10) confidence = 'high';
  else if (sampleSize >= 5) confidence = 'medium';
  else if (sampleSize >= 2) confidence = 'low';
  else confidence = 'default';

  // Get recent similar SDs for reference
  const recentSimilar = allHistory
    .filter(h => h.completedAt)
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
    .slice(0, 3);

  // Get elapsed and remaining time
  const elapsed = await getElapsedTime(supabase, sd);
  const elapsedMinutes = elapsed.elapsedMinutes;
  const remainingMinutes = Math.max(0, estimate - elapsedMinutes);

  // Get parent estimate if applicable
  let parentInfo = null;
  if (options.includeParent && sd.parent_sd_id) {
    parentInfo = await getParentEstimate(supabase, sd);
  }

  return {
    estimateMinutes: estimate,
    estimateFormatted: formatMinutes(estimate),
    elapsedMinutes,
    elapsedFormatted: formatMinutes(elapsedMinutes),
    remainingMinutes,
    remainingFormatted: formatMinutes(remainingMinutes),
    elapsedSource: elapsed.source,
    startedAt: elapsed.startedAt,
    confidence,
    sampleSize,
    estimateSource,
    factors,
    recentSimilar: recentSimilar.map(s => ({
      id: s.sdId,
      duration: formatMinutes(s.durationMinutes)
    })),
    parent: parentInfo
  };
}

/**
 * Format minutes to human readable string
 * @param {number} minutes
 * @returns {string} e.g., "1h 30m" or "45m"
 */
export function formatMinutes(minutes) {
  if (!minutes || minutes <= 0) return '0m';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) {
    return `${hours}h ${mins}m`;
  } else if (hours > 0) {
    return `${hours}h`;
  }
  return `${mins}m`;
}

/**
 * Get confidence label
 */
export function getConfidenceLabel(confidence, sampleSize) {
  switch (confidence) {
    case 'high':
      return `${sampleSize} SDs, high confidence`;
    case 'medium':
      return `${sampleSize} SDs, moderate confidence`;
    case 'low':
      return `${sampleSize} SDs, limited data`;
    default:
      return 'default estimate';
  }
}

/**
 * Format estimate for display in sd:next
 * @param {Object} estimate - From getEstimatedDuration
 * @returns {string} Single-line estimate
 */
export function formatEstimateShort(estimate) {
  const confLabel = estimate.confidence === 'high' ? '' :
    estimate.confidence === 'medium' ? ' (moderate confidence)' :
      estimate.confidence === 'low' ? ' (limited data)' : ' (default)';
  return `~${estimate.estimateFormatted}${confLabel}`;
}

/**
 * Format estimate for display in sd:start (detailed)
 * @param {Object} estimate - From getEstimatedDuration
 * @returns {Array<string>} Lines to display
 */
export function formatEstimateDetailed(estimate) {
  const lines = [];

  // Time breakdown: Total / Elapsed / Remaining
  lines.push(`Total:     ~${estimate.estimateFormatted}`);
  if (estimate.elapsedMinutes > 0) {
    lines.push(`Elapsed:    ${estimate.elapsedFormatted} (since ${estimate.elapsedSource === 'first_handoff' ? 'first handoff' : 'creation'})`);
    lines.push(`Remaining: ~${estimate.remainingFormatted}`);
  }
  lines.push(`Confidence: ${estimate.confidence.charAt(0).toUpperCase() + estimate.confidence.slice(1)} (${estimate.sampleSize} ${estimate.sampleSize === 1 ? 'SD' : 'SDs'})`);

  // ETA source label (Tier 1 / general)
  if (estimate.estimateSource) {
    const sourceLabel = estimate.estimateSource === 'session-calibrated'
      ? `Session calibrated (n=${getSessionStats().n})`
      : estimate.estimateSource === 'historical'
        ? 'Historical baseline'
        : 'Default baseline';
    lines.push(`Source:     ${sourceLabel}`);
  }

  // Parent SD info (if child)
  if (estimate.parent) {
    const p = estimate.parent;
    lines.push('');
    lines.push(`Parent SD: ${p.parentTitle}`);
    lines.push(`  Total:     ~${p.parentEstimateFormatted}`);
    if (p.parentElapsedMinutes > 0) {
      lines.push(`  Elapsed:    ${p.parentElapsedFormatted}`);
      lines.push(`  Remaining: ~${p.parentRemainingFormatted}`);
    }
    lines.push(`  Progress:   ${p.completedCount}/${p.siblingCount} children (${p.progressPercent}%)`);
  }

  if (estimate.factors.length > 0) {
    lines.push('');
    lines.push('Factors applied:');
    estimate.factors.forEach(f => lines.push(`  \u2022 ${f}`));
  }

  if (estimate.recentSimilar.length > 0) {
    lines.push('');
    lines.push('Recent similar SDs:');
    estimate.recentSimilar.forEach(s => lines.push(`  \u2022 ${s.id}: ${s.duration}`));
  }

  return lines;
}
