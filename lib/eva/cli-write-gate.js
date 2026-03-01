/**
 * CLI Write Source Gate — V06 Dimension Enhancement
 * SD: SD-MAN-GEN-CORRECTIVE-VISION-GAP-008
 *
 * Tracks database write operations and verifies they originate from
 * CLI commands. Non-CLI writes are logged as policy violations to
 * eva_event_log for audit trail.
 *
 * @module lib/eva/cli-write-gate
 */

const CLI_CONTEXT_MARKER = 'cli-authorized';
const TRACKED_TABLES = [
  'strategic_directives_v2',
  'product_requirements_v2',
  'sd_phase_handoffs',
  'user_stories',
  'retrospectives',
  'chairman_decisions',
  'eva_vision_scores',
];

/**
 * Log a database write operation with source context.
 * All writes should pass through this function for CLI authority tracking.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} options
 * @param {string} options.table - Target table name
 * @param {string} options.operation - Operation type: insert, update, delete, upsert
 * @param {string} options.source - Source context: 'cli', 'hook', 'api', 'manual', 'sub-agent'
 * @param {string} [options.command] - CLI command name (e.g., 'handoff', 'create', 'ship')
 * @param {string} [options.sdKey] - Related SD key
 * @param {Object} [options.metadata] - Additional metadata
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{logged: boolean, violation: boolean, error?: string}>}
 */
export async function trackWriteSource(supabase, options = {}) {
  const {
    table,
    operation,
    source = 'unknown',
    command = null,
    sdKey = null,
    metadata = {},
    logger = console,
  } = options;

  if (!supabase || !table || !operation) {
    return { logged: false, violation: false, error: 'Missing required parameters' };
  }

  const isCLIAuthorized = source === 'cli' || source === 'hook' || source === 'sub-agent';
  const isTrackedTable = TRACKED_TABLES.includes(table);
  const violation = !isCLIAuthorized && isTrackedTable;

  try {
    await supabase.from('eva_event_log').insert({
      event_type: violation ? 'cli_write_violation' : 'cli_write_tracked',
      event_data: {
        table,
        operation,
        source,
        command,
        sd_key: sdKey,
        cli_authorized: isCLIAuthorized,
        tracked_table: isTrackedTable,
        violation,
        ...metadata,
      },
      created_at: new Date().toISOString(),
    });

    if (violation) {
      logger.warn(`[CLIWriteGate] Non-CLI write to ${table} (source: ${source}, op: ${operation})`);
    }

    return { logged: true, violation };
  } catch (err) {
    logger.warn(`[CLIWriteGate] Event log failed: ${err.message}`);
    return { logged: false, violation, error: err.message };
  }
}

/**
 * Query CLI authority coverage metrics for recent writes.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} [options]
 * @param {number} [options.lookbackDays] - Days to analyze (default: 7)
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{coverage: Object, violations: Array, error?: string}>}
 */
export async function getWriteSourceCoverage(supabase, options = {}) {
  const { lookbackDays = 7, logger = console } = options;

  if (!supabase) {
    return { coverage: emptyCoverage(), violations: [], error: 'No supabase client' };
  }

  try {
    const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: events, error } = await supabase
      .from('eva_event_log')
      .select('event_type, event_data, created_at')
      .in('event_type', ['cli_write_tracked', 'cli_write_violation'])
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false });

    if (error) {
      logger.warn(`[CLIWriteGate] Query failed: ${error.message}`);
      return { coverage: emptyCoverage(), violations: [], error: error.message };
    }

    const all = events || [];
    const tracked = all.filter(e => e.event_type === 'cli_write_tracked');
    const violations = all.filter(e => e.event_type === 'cli_write_violation');

    const totalWrites = all.length;
    const cliAuthorized = tracked.filter(e => e.event_data?.cli_authorized).length;
    const coveragePercent = totalWrites > 0 ? Math.round((cliAuthorized / totalWrites) * 100) : 100;

    return {
      coverage: {
        totalWrites,
        cliAuthorized,
        violations: violations.length,
        coveragePercent,
        lookbackDays,
        generatedAt: new Date().toISOString(),
      },
      violations: violations.map(v => ({
        table: v.event_data?.table,
        operation: v.event_data?.operation,
        source: v.event_data?.source,
        at: v.created_at,
      })),
    };
  } catch (err) {
    logger.warn(`[CLIWriteGate] Coverage query error: ${err.message}`);
    return { coverage: emptyCoverage(), violations: [], error: err.message };
  }
}

/**
 * Validate that a template load is CLI-authorized.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} options
 * @param {string} options.templateId - Template identifier
 * @param {string} options.source - Load source context
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{authorized: boolean, logged: boolean}>}
 */
export async function validateTemplateLoad(supabase, options = {}) {
  const { templateId, source = 'unknown', logger = console } = options;

  const isCLIAuthorized = source === 'cli' || source === 'hook' || source === 'sub-agent';

  try {
    await supabase.from('eva_event_log').insert({
      event_type: isCLIAuthorized ? 'template_load_authorized' : 'template_load_violation',
      event_data: {
        template_id: templateId,
        source,
        cli_authorized: isCLIAuthorized,
      },
      created_at: new Date().toISOString(),
    });

    if (!isCLIAuthorized) {
      logger.warn(`[CLIWriteGate] Non-CLI template load: ${templateId} (source: ${source})`);
    }

    return { authorized: isCLIAuthorized, logged: true };
  } catch (err) {
    logger.warn(`[CLIWriteGate] Template log failed: ${err.message}`);
    return { authorized: isCLIAuthorized, logged: false };
  }
}

/**
 * Get module info for V06 dimension scoring.
 */
export function getWriteGateInfo() {
  return {
    dimension: 'V06',
    component: 'cli-write-gate',
    trackedTables: [...TRACKED_TABLES],
    contextMarker: CLI_CONTEXT_MARKER,
    capabilities: ['write_source_tracking', 'template_authorization', 'violation_logging'],
  };
}

function emptyCoverage() {
  return {
    totalWrites: 0,
    cliAuthorized: 0,
    violations: 0,
    coveragePercent: 0,
    lookbackDays: 7,
    generatedAt: new Date().toISOString(),
  };
}
