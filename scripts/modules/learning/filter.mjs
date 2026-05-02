/**
 * /learn Composite Scorer Noise Filter
 *
 * SD-LEO-FIX-PLAN-LEARN-COMPOSITE-001 (FR-1..FR-5)
 * SD-LEO-INFRA-LEARN-NOISE-FILTER-001 (FR-6..FR-8): single-SD source-SD filters
 *
 * Pure function. Rejects low-signal issue_patterns BEFORE composite scoring so
 * /learn stops auto-filing LEARN-FIX SDs from noise (auto_rca / unreviewed /
 * already-assigned-to-open-SD / ghost-UUID-fingerprint / single-SD handoff-retry-loop).
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

const DEFAULT_CLOSED_SOURCE_STATUSES = new Set(['completed', 'cancelled']);
const DEFAULT_STALE_OPEN_AGE_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const DEFAULT_MIN_OCCURRENCE_FOR_UNPROVEN = 3;
const FINGERPRINT_STEM_LENGTH = 8;

const RETRO_LIKE_CATEGORIES_REQUIRING_MULTI_SD = new Set([
  'session_retrospective',
  'handoff_failure',
]);

export const REJECT_REASONS = Object.freeze({
  LOW_SIGNAL_SOURCE: 'LOW_SIGNAL_SOURCE',
  AUTO_CAPTURED_UNREVIEWED: 'AUTO_CAPTURED_UNREVIEWED',
  ALREADY_ASSIGNED_OPEN_SD: 'ALREADY_ASSIGNED_OPEN_SD',
  UUID_FINGERPRINT: 'UUID_FINGERPRINT',
  SINGLE_SD_CLOSED_SOURCE: 'SINGLE_SD_CLOSED_SOURCE',
  SINGLE_SD_STALE_OPEN_SOURCE: 'SINGLE_SD_STALE_OPEN_SOURCE',
  SESSION_RETRO_NEEDS_MULTI_SD: 'SESSION_RETRO_NEEDS_MULTI_SD',
  HANDOFF_FAILURE_NEEDS_MULTI_SD: 'HANDOFF_FAILURE_NEEDS_MULTI_SD',
  EMPTY_PROVEN_LOW_OCCURRENCE: 'EMPTY_PROVEN_LOW_OCCURRENCE',
  FINGERPRINT_STEM_DUP: 'FINGERPRINT_STEM_DUP',
});

const REASON_SEVERITY = {
  [REJECT_REASONS.LOW_SIGNAL_SOURCE]: 'INFO',
  [REJECT_REASONS.AUTO_CAPTURED_UNREVIEWED]: 'INFO',
  [REJECT_REASONS.ALREADY_ASSIGNED_OPEN_SD]: 'INFO',
  [REJECT_REASONS.UUID_FINGERPRINT]: 'INFO',
  [REJECT_REASONS.SINGLE_SD_CLOSED_SOURCE]: 'INFO',
  [REJECT_REASONS.SINGLE_SD_STALE_OPEN_SOURCE]: 'INFO',
  [REJECT_REASONS.SESSION_RETRO_NEEDS_MULTI_SD]: 'INFO',
  [REJECT_REASONS.HANDOFF_FAILURE_NEEDS_MULTI_SD]: 'INFO',
  [REJECT_REASONS.EMPTY_PROVEN_LOW_OCCURRENCE]: 'INFO',
  [REJECT_REASONS.FINGERPRINT_STEM_DUP]: 'INFO',
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
 * Pattern's first_seen_sd_id == last_seen_sd_id AND source SD is closed
 * (status in closedStatuses, default {completed, cancelled}). Catches the
 * highest-confidence single-SD-noise case: handoff-rejection retry loop on
 * an SD that has since closed. Pure function.
 */
function checkSingleSDClosedSource(pattern, sourceSdStatusMap, closedStatuses) {
  const firstId = pattern?.first_seen_sd_id;
  const lastId = pattern?.last_seen_sd_id;
  if (!firstId || !lastId) return null;
  if (firstId !== lastId) return null;
  const status = sourceSdStatusMap.get(firstId);
  if (status === undefined) return null;
  if (closedStatuses.has(status)) return REJECT_REASONS.SINGLE_SD_CLOSED_SOURCE;
  return null;
}

/**
 * Pattern's first_seen_sd_id == last_seen_sd_id AND source SD is OPEN
 * (status not in closedStatuses) AND pattern's recency timestamp is older
 * than ageThresholdDays. Catches the "open SD stuck in retry loop" case
 * that checkSingleSDClosedSource misses. Defensive — gives open SDs a
 * grace period to resolve before flagging the pattern as noise.
 *
 * Age computed from pattern.last_seen_at if present, else pattern.updated_at.
 * If neither is present, function abstains (returns null).
 */
function checkSingleSDStaleOpenSource(pattern, sourceSdStatusMap, closedStatuses, ageThresholdDays, nowMs) {
  const firstId = pattern?.first_seen_sd_id;
  const lastId = pattern?.last_seen_sd_id;
  if (!firstId || !lastId) return null;
  if (firstId !== lastId) return null;
  const status = sourceSdStatusMap.get(firstId);
  if (status === undefined) return null;
  if (closedStatuses.has(status)) return null;
  const ts = pattern?.last_seen_at || pattern?.updated_at;
  if (!ts) return null;
  const tsMs = Date.parse(ts);
  if (Number.isNaN(tsMs)) return null;
  const ageDays = (nowMs - tsMs) / MS_PER_DAY;
  if (ageDays > ageThresholdDays) return REJECT_REASONS.SINGLE_SD_STALE_OPEN_SOURCE;
  return null;
}

/**
 * Category-specific gate: when category is in retroLikeCategories
 * (default {session_retrospective, handoff_failure}), require occurrences
 * across >=2 distinct SDs. These categories track per-SD failure histories —
 * single-SD shape is structurally noise, not recurrence. Pure data check.
 *
 * Returns SESSION_RETRO_NEEDS_MULTI_SD for category=session_retrospective and
 * HANDOFF_FAILURE_NEEDS_MULTI_SD for category=handoff_failure so suppression
 * audits can attribute the rejection to the source category.
 */
function checkSingleSDRetroLikeCategory(pattern, retroLikeCategories) {
  const cat = pattern?.category;
  if (!cat || !retroLikeCategories.has(cat)) return null;
  const firstId = pattern?.first_seen_sd_id;
  const lastId = pattern?.last_seen_sd_id;
  if (!firstId || !lastId) return null;
  if (firstId !== lastId) return null;
  if (cat === 'handoff_failure') return REJECT_REASONS.HANDOFF_FAILURE_NEEDS_MULTI_SD;
  return REJECT_REASONS.SESSION_RETRO_NEEDS_MULTI_SD;
}

/**
 * Backward-compatible alias for the original FR-8 helper. Kept so external
 * callers and tests that imported the old name continue to work without
 * exposing the new category-set parameter.
 */
function checkSessionRetroRequiresMultiSD(pattern) {
  return checkSingleSDRetroLikeCategory(pattern, RETRO_LIKE_CATEGORIES_REQUIRING_MULTI_SD);
}

/**
 * Reject patterns with no proven_solutions, no related_sub_agents, and
 * occurrence_count below the configured threshold. Catches the noise vector
 * where /learn auto-approve graduates a one-off pattern that has neither
 * recurred enough to demonstrate a problem nor accumulated diagnostic
 * evidence (proven solutions or sub-agent attribution).
 *
 * Threshold reads from options.minOccurrenceForUnproven, falling back to
 * env LEO_LEARN_NOISE_MIN_OCCURRENCE, then to DEFAULT_MIN_OCCURRENCE_FOR_UNPROVEN.
 */
export function checkEmptyProvenSolutions(pattern, threshold) {
  const proven = pattern?.proven_solutions;
  const subAgents = pattern?.related_sub_agents;
  const provenEmpty = !Array.isArray(proven) || proven.length === 0;
  const subAgentsEmpty = subAgents == null || (Array.isArray(subAgents) && subAgents.length === 0);
  if (!provenEmpty || !subAgentsEmpty) return null;
  const count = Number.isFinite(pattern?.occurrence_count) ? pattern.occurrence_count : 0;
  if (count < threshold) return REJECT_REASONS.EMPTY_PROVEN_LOW_OCCURRENCE;
  return null;
}

/**
 * Return the leading FINGERPRINT_STEM_LENGTH characters of a pattern's
 * canonical fingerprint, or null if no fingerprint is present. Used as the
 * dedup key for cross-source duplicates (e.g. PAT-HF-PLANTOEXEC-211b3c47 +
 * PAT-RETRO-PLANTOEXEC-211b3c47 sharing stem "211b3c47").
 *
 * Falls back through dedup_fingerprint -> fingerprint to tolerate either
 * column name; both are observed in production rows.
 */
export function extractFingerprintStem(pattern) {
  const fp = pattern?.dedup_fingerprint || pattern?.fingerprint;
  if (typeof fp !== 'string' || fp.length < FINGERPRINT_STEM_LENGTH) return null;
  return fp.slice(0, FINGERPRINT_STEM_LENGTH);
}

/**
 * Resolve the suppression-reason mapping used for emitSuppressionLog's "reason"
 * field. Maps the internal UPPER_SNAKE enum to the external lowercase code
 * surfaced in stdout. Closed enum (six values plus the legacy ones).
 */
function suppressionReasonCode(reason) {
  switch (reason) {
    case REJECT_REASONS.SINGLE_SD_CLOSED_SOURCE: return 'fr6';
    case REJECT_REASONS.SINGLE_SD_STALE_OPEN_SOURCE: return 'fr7';
    case REJECT_REASONS.SESSION_RETRO_NEEDS_MULTI_SD: return 'fr8';
    case REJECT_REASONS.HANDOFF_FAILURE_NEEDS_MULTI_SD: return 'handoff_failure_single_sd';
    case REJECT_REASONS.EMPTY_PROVEN_LOW_OCCURRENCE: return 'empty_proven';
    case REJECT_REASONS.FINGERPRINT_STEM_DUP: return 'fingerprint_stem_dup';
    case REJECT_REASONS.LOW_SIGNAL_SOURCE: return 'low_signal_source';
    case REJECT_REASONS.AUTO_CAPTURED_UNREVIEWED: return 'auto_captured_unreviewed';
    case REJECT_REASONS.ALREADY_ASSIGNED_OPEN_SD: return 'already_assigned_open_sd';
    case REJECT_REASONS.UUID_FINGERPRINT: return 'uuid_fingerprint';
    default: return 'unknown';
  }
}

/**
 * Emit a single-line JSON record describing a pattern suppression. Default
 * writer is process.stdout; tests inject a custom writer to capture output
 * without touching the real stream.
 *
 * Shape: {event:"learn.filter.suppressed", pattern_id, reason, details, ts}
 */
export function emitSuppressionLog(pattern, reason, details = {}, writer) {
  const w = writer || (typeof process !== 'undefined' && process.stdout) || null;
  if (!w || typeof w.write !== 'function') return;
  const line = JSON.stringify({
    event: 'learn.filter.suppressed',
    pattern_id: pattern?.pattern_id || pattern?.id || null,
    reason: suppressionReasonCode(reason),
    details,
    ts: new Date().toISOString(),
  }) + '\n';
  try {
    w.write(line);
  } catch (_err) {
    // Never let suppression-log emit break the filter pipeline.
  }
}

/**
 * Pre-pass that collapses patterns sharing the same canonical fingerprint stem
 * AND the same first_seen_sd_id. The winner is the row with the highest
 * occurrence_count; ties broken by pattern_id ascending. Suppressed dupes
 * are returned as rejected entries with reason FINGERPRINT_STEM_DUP and a
 * details.kept_pattern_id link for audit.
 *
 * Patterns with no fingerprint stem or no first_seen_sd_id are passed through
 * unchanged — the dedup key is undefined for them.
 */
function dedupByFingerprintStem(patterns) {
  const groups = new Map(); // key="stem||sdId" -> Array<pattern>
  const passthrough = [];
  for (const p of patterns) {
    const stem = extractFingerprintStem(p);
    const sdId = p?.first_seen_sd_id;
    if (!stem || !sdId) {
      passthrough.push(p);
      continue;
    }
    const key = `${stem}||${sdId}`;
    const arr = groups.get(key) || [];
    arr.push(p);
    groups.set(key, arr);
  }

  const kept = [...passthrough];
  const rejected = [];
  for (const arr of groups.values()) {
    if (arr.length === 1) {
      kept.push(arr[0]);
      continue;
    }
    arr.sort((a, b) => {
      const ca = Number.isFinite(a?.occurrence_count) ? a.occurrence_count : 0;
      const cb = Number.isFinite(b?.occurrence_count) ? b.occurrence_count : 0;
      if (cb !== ca) return cb - ca;
      const ia = String(a?.pattern_id || a?.id || '');
      const ib = String(b?.pattern_id || b?.id || '');
      return ia.localeCompare(ib);
    });
    const winner = arr[0];
    kept.push(winner);
    for (let i = 1; i < arr.length; i++) {
      rejected.push({
        pattern: arr[i],
        reason: REJECT_REASONS.FINGERPRINT_STEM_DUP,
        severity: REASON_SEVERITY[REJECT_REASONS.FINGERPRINT_STEM_DUP],
        details: { kept_pattern_id: winner?.pattern_id || winner?.id || null },
      });
    }
  }
  return { kept, rejected };
}

/**
 * @param {Array<object>} patterns
 * @param {object} [options]
 * @param {Iterable<string>} [options.allowSources]
 * @param {Iterable<string>} [options.blockStatuses]
 * @param {Map<string,string>} [options.sdStatusMap]
 * @param {Map<string,string>} [options.sourceSdStatusMap] - SD-status lookup keyed by first/last_seen_sd_id (FR-6/FR-7)
 * @param {Iterable<string>} [options.closedSourceStatuses] - statuses considered "closed" for FR-6 (default: completed, cancelled)
 * @param {number} [options.staleOpenAgeDays] - FR-7 age threshold in days (default 7)
 * @param {number} [options.nowMs] - injectable clock for FR-7 testing (default Date.now())
 * @param {number} [options.minOccurrenceForUnproven] - threshold for checkEmptyProvenSolutions; defaults to env LEO_LEARN_NOISE_MIN_OCCURRENCE then 3
 * @param {Iterable<string>} [options.retroLikeCategories] - categories requiring multi-SD evidence (default: session_retrospective, handoff_failure)
 * @param {object} [options.suppressionWriter] - custom writer for emitSuppressionLog; default process.stdout. Pass null to disable emit.
 * @param {boolean} [options.bypass=false]
 * @returns {{kept: Array, rejected: Array<{pattern: object, reason: string, severity: string, details?: object}>}}
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
  const sourceSdStatusMap = options.sourceSdStatusMap || new Map();
  const closedSourceStatuses = options.closedSourceStatuses
    ? new Set(options.closedSourceStatuses)
    : DEFAULT_CLOSED_SOURCE_STATUSES;
  const staleOpenAgeDays = Number.isFinite(options.staleOpenAgeDays) && options.staleOpenAgeDays > 0
    ? options.staleOpenAgeDays
    : DEFAULT_STALE_OPEN_AGE_DAYS;
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const retroLikeCategories = options.retroLikeCategories
    ? new Set(options.retroLikeCategories)
    : RETRO_LIKE_CATEGORIES_REQUIRING_MULTI_SD;
  // suppressionWriter: explicit null disables emit; undefined falls back to process.stdout.
  const suppressionWriter = options.suppressionWriter === undefined
    ? (typeof process !== 'undefined' ? process.stdout : null)
    : options.suppressionWriter;

  const minOccurrenceForUnproven = Number.isFinite(options.minOccurrenceForUnproven) && options.minOccurrenceForUnproven > 0
    ? Math.floor(options.minOccurrenceForUnproven)
    : (Number.parseInt(process.env.LEO_LEARN_NOISE_MIN_OCCURRENCE, 10) || DEFAULT_MIN_OCCURRENCE_FOR_UNPROVEN);

  const dedupResult = dedupByFingerprintStem(patterns);
  const survivors = dedupResult.kept;
  const rejected = [...dedupResult.rejected];

  for (const entry of dedupResult.rejected) {
    if (suppressionWriter) emitSuppressionLog(entry.pattern, entry.reason, entry.details || {}, suppressionWriter);
  }

  const kept = [];
  for (const pattern of survivors) {
    const reason =
      checkSource(pattern, allowSources) ||
      checkAutoCaptured(pattern) ||
      checkAssignedSd(pattern, sdStatusMap, blockStatuses) ||
      checkFingerprint(pattern) ||
      checkSingleSDClosedSource(pattern, sourceSdStatusMap, closedSourceStatuses) ||
      checkSingleSDStaleOpenSource(pattern, sourceSdStatusMap, closedSourceStatuses, staleOpenAgeDays, nowMs) ||
      checkSingleSDRetroLikeCategory(pattern, retroLikeCategories) ||
      checkEmptyProvenSolutions(pattern, minOccurrenceForUnproven);

    if (reason) {
      const severity = REASON_SEVERITY[reason];
      rejected.push({ pattern, reason, severity });
      if (suppressionWriter) emitSuppressionLog(pattern, reason, {}, suppressionWriter);
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
 * Build the source-SD-status lookup map needed by FR-6 and FR-7. Single batched
 * query to strategic_directives_v2 keyed by id, covering the union of every
 * pattern's first_seen_sd_id and last_seen_sd_id values. Caller passes the
 * supabase client to preserve the pure-function shape of filterPatternsForLearning.
 *
 * @param {object} supabase - Supabase client
 * @param {Array<object>} patterns
 * @returns {Promise<Map<string,string>>} Map<sdId, status>
 */
export async function fetchPatternSourceSDStatuses(supabase, patterns) {
  const ids = new Set();
  for (const p of patterns) {
    if (typeof p?.first_seen_sd_id === 'string' && p.first_seen_sd_id.length > 0) {
      ids.add(p.first_seen_sd_id);
    }
    if (typeof p?.last_seen_sd_id === 'string' && p.last_seen_sd_id.length > 0) {
      ids.add(p.last_seen_sd_id);
    }
  }

  if (ids.size === 0) return new Map();

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, status')
    .in('id', [...ids]);

  if (error) {
    throw new Error(`fetchPatternSourceSDStatuses failed: ${error.message}`);
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
