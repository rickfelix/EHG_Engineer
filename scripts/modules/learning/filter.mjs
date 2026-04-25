/**
 * /learn Composite Scorer Noise Filter
 *
 * SD-LEO-FIX-PLAN-LEARN-COMPOSITE-001
 *
 * Pure function. Rejects low-signal issue_patterns BEFORE composite scoring so
 * /learn stops auto-filing LEARN-FIX SDs from noise (auto_rca / unreviewed /
 * already-assigned-to-open-SD / ghost-UUID-fingerprint).
 *
 * Persistence (metadata.filter_log[] append) is a SEPARATE concern handled by
 * persistFilterLog() so this module stays unit-testable without a DB connection.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_ALLOW_SOURCES = new Set(['retrospective', 'feedback_cluster']);

const DEFAULT_BLOCK_SD_STATUSES = new Set([
  'draft',
  'planning',
  'executing',
  'completed',
  'pending_approval',
]);

export const REJECT_REASONS = Object.freeze({
  LOW_SIGNAL_SOURCE: 'LOW_SIGNAL_SOURCE',
  AUTO_CAPTURED_UNREVIEWED: 'AUTO_CAPTURED_UNREVIEWED',
  ALREADY_ASSIGNED_OPEN_SD: 'ALREADY_ASSIGNED_OPEN_SD',
  UUID_FINGERPRINT: 'UUID_FINGERPRINT',
});

const REASON_SEVERITY = {
  [REJECT_REASONS.LOW_SIGNAL_SOURCE]: 'INFO',
  [REJECT_REASONS.AUTO_CAPTURED_UNREVIEWED]: 'INFO',
  [REJECT_REASONS.ALREADY_ASSIGNED_OPEN_SD]: 'INFO',
  [REJECT_REASONS.UUID_FINGERPRINT]: 'INFO',
};

function checkSource(pattern, allowSources) {
  const source = pattern.source;
  if (allowSources.has(source)) {
    if (pattern?.metadata?.origin === 'auto_rca') {
      return REJECT_REASONS.LOW_SIGNAL_SOURCE;
    }
    return null;
  }
  return REJECT_REASONS.LOW_SIGNAL_SOURCE;
}

function checkAutoCaptured(pattern) {
  const md = pattern?.metadata;
  if (!md || md.auto_captured !== true) return null;
  if (md.human_reviewed === true) return null;
  return REJECT_REASONS.AUTO_CAPTURED_UNREVIEWED;
}

function checkAssignedSd(pattern, sdStatusMap, blockStatuses) {
  const sdId = pattern.assigned_sd_id;
  if (!sdId) return null;
  const status = sdStatusMap.get(sdId);
  if (status === undefined) return REJECT_REASONS.ALREADY_ASSIGNED_OPEN_SD;
  if (status === 'cancelled') return null;
  if (blockStatuses.has(status)) return REJECT_REASONS.ALREADY_ASSIGNED_OPEN_SD;
  return null;
}

function checkFingerprint(pattern) {
  const fp = pattern.dedup_fingerprint;
  if (!fp) return null;
  if (UUID_REGEX.test(fp)) return REJECT_REASONS.UUID_FINGERPRINT;
  return null;
}

/**
 * @param {Array<object>} patterns
 * @param {object} [options]
 * @param {Iterable<string>} [options.allowSources]
 * @param {Iterable<string>} [options.blockStatuses]
 * @param {Map<string,string>} [options.sdStatusMap]
 * @param {boolean} [options.bypass=false]
 * @returns {{kept: Array, rejected: Array<{pattern: object, reason: string, severity: string}>}}
 */
export function filterPatternsForLearning(patterns, options = {}) {
  if (!Array.isArray(patterns)) {
    throw new TypeError('filterPatternsForLearning: patterns must be an array');
  }

  if (options.bypass === true) {
    return { kept: patterns.slice(), rejected: [] };
  }

  const allowSources = options.allowSources
    ? new Set(options.allowSources)
    : DEFAULT_ALLOW_SOURCES;
  const blockStatuses = options.blockStatuses
    ? new Set(options.blockStatuses)
    : DEFAULT_BLOCK_SD_STATUSES;
  const sdStatusMap = options.sdStatusMap || new Map();

  const kept = [];
  const rejected = [];

  for (const pattern of patterns) {
    const reason =
      checkSource(pattern, allowSources) ||
      checkAutoCaptured(pattern) ||
      checkAssignedSd(pattern, sdStatusMap, blockStatuses) ||
      checkFingerprint(pattern);

    if (reason) {
      rejected.push({ pattern, reason, severity: REASON_SEVERITY[reason] });
    } else {
      kept.push(pattern);
    }
  }

  return { kept, rejected };
}

/**
 * Build the SD-status lookup map needed by FR-3. Single batched query to
 * strategic_directives_v2 keyed by id. Caller passes the supabase client to
 * preserve the pure-function shape of filterPatternsForLearning.
 *
 * @param {object} supabase - Supabase client
 * @param {Array<object>} patterns
 * @returns {Promise<Map<string,string>>} Map<sdId, status>
 */
export async function fetchAssignedSdStatuses(supabase, patterns) {
  const ids = [...new Set(
    patterns
      .map((p) => p.assigned_sd_id)
      .filter((id) => typeof id === 'string' && id.length > 0)
  )];

  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, status')
    .in('id', ids);

  if (error) {
    throw new Error(`fetchAssignedSdStatuses failed: ${error.message}`);
  }

  const map = new Map();
  for (const row of data || []) map.set(row.id, row.status);
  return map;
}

/**
 * Append one entry per rejection to issue_patterns.metadata.filter_log[] with
 * FIFO truncation at LEARN_FILTER_LOG_MAX_ENTRIES (default 50).
 *
 * Side-effect function; intentionally outside filterPatternsForLearning so unit
 * tests of the filter need no DB.
 *
 * @param {object} supabase - Supabase client
 * @param {Array<{pattern: object, reason: string, severity: string}>} rejected
 * @param {string} scorerRunId
 * @param {object} [options]
 * @param {number} [options.maxEntries=50]
 */
export async function persistFilterLog(supabase, rejected, scorerRunId, options = {}) {
  const maxEntries = Number.isFinite(options.maxEntries) && options.maxEntries > 0
    ? Math.floor(options.maxEntries)
    : Number(process.env.LEARN_FILTER_LOG_MAX_ENTRIES) || 50;

  const ts = new Date().toISOString();

  for (const { pattern, reason, severity } of rejected) {
    const id = pattern?.pattern_id || pattern?.id;
    if (!id) continue;

    const newEntry = { ts, reason, scorer_run_id: scorerRunId, severity };

    let existing = [];
    if (Array.isArray(pattern?.metadata?.filter_log)) {
      existing = pattern.metadata.filter_log;
    }
    const next = [...existing, newEntry];
    const truncated = next.length > maxEntries
      ? next.slice(next.length - maxEntries)
      : next;

    const nextMetadata = { ...(pattern.metadata || {}), filter_log: truncated };

    const { error } = await supabase
      .from('issue_patterns')
      .update({ metadata: nextMetadata })
      .eq('pattern_id', id);

    if (error) {
      console.warn(`[filter-log] persist failed for ${id}: ${error.message}`);
    }
  }
}
