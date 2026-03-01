/**
 * Chairman DFE Feedback Loop — Decision Outcome Learning
 * SD: SD-MAN-ORCH-VISION-HEAL-SCORE-93-002-03-A
 *
 * Wires chairman decision outcomes back to DFE scoring preferences,
 * enabling the Decision Framework Engine to learn from override patterns.
 * Also enriches override audit records with before/after context
 * and rationale classification.
 *
 * @module lib/eva/chairman-dfe-feedback-loop
 */

const OVERRIDE_PATTERN_THRESHOLD = 3; // Min overrides of same type to detect pattern
const ADJUSTMENT_DAMPENING = 0.25; // 25% dampening factor to prevent oscillation
// Score-type thresholds are clamped to 0-100; cost thresholds are unbounded
const SCORE_PREFERENCE_KEYS = new Set([
  'filter.min_score',
  'filter.chairman_review_score',
  'filter.vision_score_exec_threshold',
]);

const RATIONALE_CATEGORIES = Object.freeze([
  'risk_accept',       // Chairman accepts known risk
  'scope_change',      // Scope changed, making trigger obsolete
  'priority_override', // Business priority overrides technical concern
  'false_positive',    // Trigger fired incorrectly
  'context_specific',  // One-time context not worth adjusting threshold
]);

// ── Feedback Analysis ────────────────────────────

/**
 * Analyze override patterns from chairman decisions.
 * Identifies systematic overrides that suggest threshold adjustments.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @param {number} [options.lookbackDays] - Days to look back (default: 30)
 * @param {number} [options.patternThreshold] - Min occurrences for pattern (default: 3)
 * @returns {Promise<{ patterns: Array, totalOverrides: number, error?: string }>}
 */
export async function analyzeOverridePatterns(supabase, options = {}) {
  const {
    logger = console,
    lookbackDays = 30,
    patternThreshold = OVERRIDE_PATTERN_THRESHOLD,
  } = options;

  if (!supabase) {
    return { patterns: [], totalOverrides: 0, error: 'No supabase client' };
  }

  try {
    const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: overrides, error: queryError } = await supabase
      .from('chairman_decisions')
      .select('id, decision_type, status, context, created_at')
      .eq('status', 'approved')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false });

    if (queryError) {
      logger.warn(`[DFEFeedback] Override query failed: ${queryError.message}`);
      return { patterns: [], totalOverrides: 0, error: queryError.message };
    }

    const all = overrides || [];
    const triggerGroups = groupByTriggerType(all);
    const patterns = [];

    for (const [triggerType, group] of Object.entries(triggerGroups)) {
      if (group.length >= patternThreshold) {
        patterns.push({
          triggerType,
          overrideCount: group.length,
          suggestion: computeSuggestion(triggerType, group),
          confidence: Math.min(group.length / (patternThreshold * 2), 1.0),
          examples: group.slice(0, 3).map((d) => ({
            decisionId: d.id,
            createdAt: d.created_at,
          })),
        });
      }
    }

    patterns.sort((a, b) => b.overrideCount - a.overrideCount);

    return { patterns, totalOverrides: all.length };
  } catch (err) {
    logger.warn(`[DFEFeedback] Pattern analysis error: ${err.message}`);
    return { patterns: [], totalOverrides: 0, error: err.message };
  }
}

// ── Feedback Application ─────────────────────────

/**
 * Apply decision feedback to DFE preferences.
 * Updates threshold values based on override pattern analysis.
 *
 * @param {Object} supabase - Supabase client
 * @param {Array} patterns - Patterns from analyzeOverridePatterns()
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @param {number} [options.dampening] - Dampening factor (default: 0.25)
 * @returns {Promise<{ adjustments: Array, error?: string }>}
 */
export async function applyDecisionFeedback(supabase, patterns, options = {}) {
  const {
    logger = console,
    dampening = ADJUSTMENT_DAMPENING,
  } = options;

  if (!supabase) {
    return { adjustments: [], error: 'No supabase client' };
  }

  if (!patterns || patterns.length === 0) {
    return { adjustments: [], error: 'No patterns to apply' };
  }

  const adjustments = [];

  for (const pattern of patterns) {
    if (!pattern.suggestion || !pattern.suggestion.preferenceKey) continue;

    const { preferenceKey, currentValue, suggestedValue } = pattern.suggestion;

    // Apply dampening to prevent oscillation
    const dampenedValue = currentValue + (suggestedValue - currentValue) * dampening;
    const rounded = Math.round(dampenedValue);
    // Only clamp score-type preferences to 0-100; cost/other thresholds are unbounded
    const clampedValue = SCORE_PREFERENCE_KEYS.has(preferenceKey)
      ? Math.max(0, Math.min(100, rounded))
      : Math.max(0, rounded);

    if (clampedValue === currentValue) continue;

    try {
      const { error: upsertError } = await supabase
        .from('chairman_preferences')
        .upsert({
          key: preferenceKey,
          value: JSON.stringify(clampedValue),
          venture_id: null, // Global preference
          source: 'dfe_feedback_loop',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key,venture_id' });

      if (upsertError) {
        logger.warn(`[DFEFeedback] Preference update failed for ${preferenceKey}: ${upsertError.message}`);
        adjustments.push({
          preferenceKey,
          beforeValue: currentValue,
          afterValue: clampedValue,
          applied: false,
          error: upsertError.message,
        });
        continue;
      }

      adjustments.push({
        preferenceKey,
        beforeValue: currentValue,
        afterValue: clampedValue,
        triggerType: pattern.triggerType,
        overrideCount: pattern.overrideCount,
        confidence: pattern.confidence,
        applied: true,
      });

      logger.info(`[DFEFeedback] Adjusted ${preferenceKey}: ${currentValue} → ${clampedValue}`);
    } catch (err) {
      logger.warn(`[DFEFeedback] Apply error for ${preferenceKey}: ${err.message}`);
      adjustments.push({
        preferenceKey,
        beforeValue: currentValue,
        afterValue: clampedValue,
        applied: false,
        error: err.message,
      });
    }
  }

  return { adjustments };
}

// ── Feedback Summary ─────────────────────────────

/**
 * Get a summary of recent feedback adjustments.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{ summary: Object, error?: string }>}
 */
export async function getFeedbackSummary(supabase, options = {}) {
  const { logger = console } = options;

  if (!supabase) {
    return {
      summary: {
        totalAdjustments: 0,
        recentAdjustments: [],
        generatedAt: new Date().toISOString(),
      },
      error: 'No supabase client',
    };
  }

  try {
    const { data: prefs, error: prefError } = await supabase
      .from('chairman_preferences')
      .select('key, value, source, updated_at')
      .eq('source', 'dfe_feedback_loop')
      .order('updated_at', { ascending: false })
      .limit(20);

    if (prefError) {
      logger.warn(`[DFEFeedback] Summary query failed: ${prefError.message}`);
      return {
        summary: {
          totalAdjustments: 0,
          recentAdjustments: [],
          generatedAt: new Date().toISOString(),
        },
        error: prefError.message,
      };
    }

    const recent = (prefs || []).map((p) => ({
      key: p.key,
      currentValue: safeJsonParse(p.value),
      updatedAt: p.updated_at,
    }));

    return {
      summary: {
        totalAdjustments: recent.length,
        recentAdjustments: recent,
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    logger.warn(`[DFEFeedback] Summary error: ${err.message}`);
    return {
      summary: {
        totalAdjustments: 0,
        recentAdjustments: [],
        generatedAt: new Date().toISOString(),
      },
      error: err.message,
    };
  }
}

// ── Override Audit Enrichment ────────────────────

/**
 * Enrich an override audit record with context.
 *
 * @param {Object} params
 * @param {Object} params.decision - Original decision record
 * @param {Object} [params.beforeState] - State before override
 * @param {Object} [params.afterState] - State after override
 * @param {string} [params.rationale] - Override rationale text
 * @param {string[]} [params.affectedSDs] - SD keys affected by override
 * @param {Object} [options]
 * @returns {{ enriched: Object }}
 */
export function enrichOverrideAudit(params, options = {}) {
  const { decision, beforeState, afterState, rationale, affectedSDs = [] } = params;

  const rationaleCategory = classifyRationale(rationale || '');
  const scoreDelta = computeScoreDelta(beforeState, afterState);

  return {
    enriched: {
      decisionId: decision?.id || null,
      decisionType: decision?.decision_type || null,
      beforeState: beforeState || null,
      afterState: afterState || null,
      rationaleCategory,
      rationaleText: rationale || null,
      affectedSDs,
      impactAssessment: {
        affectedSDCount: affectedSDs.length,
        estimatedScoreDelta: scoreDelta,
      },
      enrichedAt: new Date().toISOString(),
    },
  };
}

/**
 * Get valid rationale categories.
 * @returns {string[]}
 */
export function getRationaleCategories() {
  return [...RATIONALE_CATEGORIES];
}

// ── Internal Helpers ─────────────────────────────

function groupByTriggerType(decisions) {
  const groups = {};
  for (const d of decisions) {
    const ctx = d.context || {};
    const triggerType = ctx.guardrail_id || ctx.trigger_type || d.decision_type || 'unknown';
    if (!groups[triggerType]) groups[triggerType] = [];
    groups[triggerType].push(d);
  }
  return groups;
}

function computeSuggestion(triggerType, group) {
  // Map trigger types to preference keys
  const triggerToPreference = {
    cost_threshold: { key: 'filter.cost_max_usd', default: 10000 },
    low_score: { key: 'filter.min_score', default: 7 },
    vision_score_signal: { key: 'filter.vision_score_exec_threshold', default: 50 },
  };

  const mapping = triggerToPreference[triggerType];
  if (!mapping) {
    return {
      preferenceKey: null,
      note: `No preference mapping for trigger type: ${triggerType}`,
    };
  }

  // Suggest relaxing the threshold based on override count
  const relaxFactor = Math.min(group.length * 0.05, 0.3); // Max 30% relaxation
  const currentValue = mapping.default;
  const suggestedValue = triggerType === 'cost_threshold'
    ? Math.round(currentValue * (1 + relaxFactor)) // Increase cost threshold
    : Math.round(currentValue * (1 - relaxFactor)); // Decrease score threshold

  return {
    preferenceKey: mapping.key,
    currentValue,
    suggestedValue,
    relaxFactor: Math.round(relaxFactor * 100),
  };
}

function classifyRationale(text) {
  if (!text) return 'context_specific';

  const lower = text.toLowerCase();
  if (lower.includes('risk') && (lower.includes('accept') || lower.includes('tolerat'))) {
    return 'risk_accept';
  }
  if (lower.includes('scope') && (lower.includes('change') || lower.includes('shift'))) {
    return 'scope_change';
  }
  if (lower.includes('priority') || lower.includes('business') || lower.includes('urgent')) {
    return 'priority_override';
  }
  if (lower.includes('false') || lower.includes('incorrect') || lower.includes('wrong')) {
    return 'false_positive';
  }
  return 'context_specific';
}

function computeScoreDelta(before, after) {
  if (!before || !after) return 0;
  const beforeScore = before.score || before.total_score || 0;
  const afterScore = after.score || after.total_score || 0;
  return afterScore - beforeScore;
}

function safeJsonParse(val) {
  try { return JSON.parse(val); } catch { return val; }
}
