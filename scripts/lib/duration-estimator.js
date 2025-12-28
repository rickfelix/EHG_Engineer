/**
 * Intelligent SD Duration Estimator
 *
 * Provides accurate duration estimates using multi-factor scoring:
 * 1. SD Type Baseline (median from historical data)
 * 2. Priority Multiplier (critical=1.3x, high=1.1x, etc.)
 * 3. Orchestrator Child Count adjustment
 * 4. Recency-Weighted Learning (recent SDs count more)
 * 5. Same Category Matching
 */

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

/**
 * Get historical duration data from handoffs (actual work time)
 * @param {SupabaseClient} supabase
 * @param {string} sdType - Optional filter by type
 * @param {string} category - Optional filter by category
 * @returns {Promise<Array>} Array of { sdId, sdType, category, priority, durationMinutes, completedAt }
 */
export async function getHistoricalDurations(supabase, sdType = null, category = null) {
  // Get completed SDs
  let query = supabase
    .from('strategic_directives_v2')
    .select('id, sd_type, category, priority, completion_date')
    .eq('status', 'completed');

  if (sdType) {
    query = query.eq('sd_type', sdType);
  }
  if (category) {
    query = query.eq('category', category);
  }

  const { data: sds, error } = await query;
  if (error || !sds) return [];

  const results = [];

  for (const sd of sds) {
    // Get first and last accepted handoff for this SD
    const { data: handoffs } = await supabase
      .from('sd_phase_handoffs')
      .select('created_at')
      .eq('sd_id', sd.id)
      .eq('status', 'accepted')
      .order('created_at', { ascending: true });

    if (handoffs && handoffs.length >= 2) {
      const first = new Date(handoffs[0].created_at);
      const last = new Date(handoffs[handoffs.length - 1].created_at);
      const minutes = Math.round((last - first) / (1000 * 60));

      // Filter out invalid durations (negative, zero, or > 24 hours)
      if (minutes > 0 && minutes < 1440) {
        results.push({
          sdId: sd.id,
          sdType: sd.sd_type,
          category: sd.category,
          priority: sd.priority,
          durationMinutes: minutes,
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
 * Get intelligent duration estimate for an SD
 * @param {SupabaseClient} supabase
 * @param {Object} sd - Strategic Directive { id, sd_type, category, priority }
 * @returns {Promise<Object>} Estimate with confidence and factors
 */
export async function getEstimatedDuration(supabase, sd) {
  const sdType = sd.sd_type || 'default';
  const priority = sd.priority || 'medium';
  const category = sd.category;

  // Get historical data
  const allHistory = await getHistoricalDurations(supabase, sdType);
  const categoryHistory = category
    ? allHistory.filter(h => h.category === category)
    : [];

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

  // Factor 4: Category-specific adjustment
  if (categoryHistory.length >= 3) {
    const categoryMedian = calculateMedian(categoryHistory.map(h => h.durationMinutes));
    // Blend 40% base + 60% category-specific
    estimate = Math.round(estimate * 0.4 + categoryMedian * 0.6);
    factors.push(`Category match (${categoryHistory.length} SDs): blended`);
  }

  // Factor 5: Recency adjustment (last 14 days)
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
  }

  // Determine confidence
  const sampleSize = allHistory.length;
  let confidence;
  if (sampleSize >= 10) confidence = 'high';
  else if (sampleSize >= 5) confidence = 'medium';
  else if (sampleSize >= 2) confidence = 'low';
  else confidence = 'default';

  // Get recent similar SDs for reference
  const recentSimilar = allHistory
    .filter(h => h.completedAt)
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
    .slice(0, 3);

  return {
    estimateMinutes: estimate,
    estimateFormatted: formatMinutes(estimate),
    confidence,
    sampleSize,
    factors,
    recentSimilar: recentSimilar.map(s => ({
      id: s.sdId,
      duration: formatMinutes(s.durationMinutes)
    }))
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
  lines.push(`Estimate:   ~${estimate.estimateFormatted}`);
  lines.push(`Confidence: ${estimate.confidence.charAt(0).toUpperCase() + estimate.confidence.slice(1)} (${estimate.sampleSize} ${estimate.sampleSize === 1 ? 'SD' : 'SDs'})`);

  if (estimate.factors.length > 0) {
    lines.push('');
    lines.push('Factors applied:');
    estimate.factors.forEach(f => lines.push(`  • ${f}`));
  }

  if (estimate.recentSimilar.length > 0) {
    lines.push('');
    lines.push('Recent similar SDs:');
    estimate.recentSimilar.forEach(s => lines.push(`  • ${s.id}: ${s.duration}`));
  }

  return lines;
}
