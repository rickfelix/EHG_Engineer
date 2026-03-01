/**
 * CLI Authority Coverage Tracker — V06 Dimension
 * SD: SD-MAN-ORCH-VISION-HEAL-SCORE-93-002-04-B
 *
 * Analyzes AEGIS enforcement rules, CLI command routing coverage,
 * and authority validation patterns. Returns authority coverage
 * metrics and uncovered command paths.
 *
 * @module lib/eva/cli-authority-tracker
 */

const VALIDATOR_TYPES = [
  'FieldCheckValidator',
  'ThresholdValidator',
  'RoleForbiddenValidator',
  'CountLimitValidator',
  'CustomValidator',
];

const ENFORCEMENT_ACTIONS = ['BLOCK', 'WARN', 'AUDIT'];

const EXPECTED_COMMAND_CATEGORIES = [
  'handoff',
  'create',
  'status',
  'heal',
  'ship',
  'learn',
  'claim',
  'session',
];

/**
 * Track CLI authority coverage and enforcement metrics.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @param {number} [options.lookbackDays] - Days to look back for enforcement events
 * @returns {Promise<{ metrics: Object, coverage: Object, gaps: Array, error?: string }>}
 */
export async function trackAuthorityCoverage(supabase, options = {}) {
  const { logger = console, lookbackDays = 30 } = options;

  if (!supabase) {
    return { metrics: emptyMetrics(), coverage: emptyCoverage(), gaps: [], error: 'No supabase client' };
  }

  try {
    const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

    // Query enforcement events from eva_event_log
    const { data: events, error: eventError } = await supabase
      .from('eva_event_log')
      .select('event_type, event_data, created_at')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false });

    if (eventError) {
      logger.warn(`[CLIAuthorityTracker] Event query failed: ${eventError.message}`);
      return { metrics: emptyMetrics(), coverage: emptyCoverage(), gaps: [], error: eventError.message };
    }

    const all = events || [];

    // Categorize events
    const enforcementEvents = all.filter((e) =>
      e.event_type?.includes('enforcement') ||
      e.event_type?.includes('violation') ||
      e.event_type?.includes('aegis')
    );

    const commandEvents = all.filter((e) =>
      e.event_type?.includes('command') ||
      e.event_type?.includes('handoff') ||
      e.event_type?.includes('gate')
    );

    // Analyze validator type coverage
    const validatorTypesSeen = new Set();
    const actionsSeen = new Set();

    for (const event of enforcementEvents) {
      const data = event.event_data || {};
      if (data.validator_type) validatorTypesSeen.add(data.validator_type);
      if (data.action) actionsSeen.add(data.action);
    }

    // Analyze command category coverage
    const commandCategoriesSeen = new Set();
    for (const event of commandEvents) {
      const type = event.event_type || '';
      for (const cat of EXPECTED_COMMAND_CATEGORIES) {
        if (type.toLowerCase().includes(cat)) {
          commandCategoriesSeen.add(cat);
        }
      }
    }

    // Identify gaps
    const gaps = [];

    const missingValidators = VALIDATOR_TYPES.filter((v) => !validatorTypesSeen.has(v));
    for (const v of missingValidators) {
      gaps.push({ category: 'validator', item: v, issue: 'Validator type not observed in enforcement events' });
    }

    const missingActions = ENFORCEMENT_ACTIONS.filter((a) => !actionsSeen.has(a));
    for (const a of missingActions) {
      gaps.push({ category: 'action', item: a, issue: 'Enforcement action not observed' });
    }

    const missingCategories = EXPECTED_COMMAND_CATEGORIES.filter((c) => !commandCategoriesSeen.has(c));
    for (const c of missingCategories) {
      gaps.push({ category: 'command', item: c, issue: 'Command category not observed in events' });
    }

    // Calculate coverage
    const validatorCoverage = Math.round((validatorTypesSeen.size / VALIDATOR_TYPES.length) * 100);
    const actionCoverage = Math.round((actionsSeen.size / ENFORCEMENT_ACTIONS.length) * 100);
    const commandCoverage = Math.round((commandCategoriesSeen.size / EXPECTED_COMMAND_CATEGORIES.length) * 100);
    const overallCoverage = Math.round((validatorCoverage + actionCoverage + commandCoverage) / 3);

    return {
      metrics: {
        totalEvents: all.length,
        enforcementEvents: enforcementEvents.length,
        commandEvents: commandEvents.length,
        validatorTypesSeen: validatorTypesSeen.size,
        actionsSeen: actionsSeen.size,
        commandCategoriesSeen: commandCategoriesSeen.size,
        lookbackDays,
        generatedAt: new Date().toISOString(),
      },
      coverage: {
        overallPercent: overallCoverage,
        validatorCoverage,
        actionCoverage,
        commandCoverage,
        expectedValidators: VALIDATOR_TYPES.length,
        expectedActions: ENFORCEMENT_ACTIONS.length,
        expectedCategories: EXPECTED_COMMAND_CATEGORIES.length,
      },
      gaps,
    };
  } catch (err) {
    logger.warn(`[CLIAuthorityTracker] Error: ${err.message}`);
    return { metrics: emptyMetrics(), coverage: emptyCoverage(), gaps: [], error: err.message };
  }
}

/**
 * Get authority enforcement summary.
 * @param {Object} supabase - Supabase client
 * @param {Object} [options]
 * @returns {Promise<{ summary: Object, error?: string }>}
 */
export async function getAuthorityEnforcementSummary(supabase, options = {}) {
  const result = await trackAuthorityCoverage(supabase, options);
  if (result.error) {
    return { summary: { coveragePercent: 0, totalEvents: 0, gapCount: 0 }, error: result.error };
  }

  return {
    summary: {
      coveragePercent: result.coverage.overallPercent,
      totalEvents: result.metrics.totalEvents,
      enforcementEvents: result.metrics.enforcementEvents,
      gapCount: result.gaps.length,
    },
  };
}

/**
 * Get dimension info.
 * @returns {Object}
 */
export function getDimensionInfo() {
  return {
    dimension: 'V06',
    name: 'CLI Authority',
    description: 'Command-level authority enforcement and routing coverage',
    validatorTypes: [...VALIDATOR_TYPES],
    enforcementActions: [...ENFORCEMENT_ACTIONS],
    commandCategories: [...EXPECTED_COMMAND_CATEGORIES],
  };
}

// ── Internal Helpers ─────────────────────────────

function emptyMetrics() {
  return {
    totalEvents: 0,
    enforcementEvents: 0,
    commandEvents: 0,
    validatorTypesSeen: 0,
    actionsSeen: 0,
    commandCategoriesSeen: 0,
    lookbackDays: 30,
    generatedAt: new Date().toISOString(),
  };
}

function emptyCoverage() {
  return {
    overallPercent: 0,
    validatorCoverage: 0,
    actionCoverage: 0,
    commandCoverage: 0,
    expectedValidators: VALIDATOR_TYPES.length,
    expectedActions: ENFORCEMENT_ACTIONS.length,
    expectedCategories: EXPECTED_COMMAND_CATEGORIES.length,
  };
}
