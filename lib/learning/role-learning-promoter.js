#!/usr/bin/env node
/**
 * SD-LEO-INFRA-ROLE-SESSIONS-FORCED-001 (FR-1..FR-3) — RECONNECT ROLE LEARNINGS TO /learn.
 *
 * WHY THIS EXISTS. Role sessions were believed to have no retrospective capture at all; the
 * sourcing measured that by grepping role scripts for the word "retrospective" (adam-* 0,
 * coordinator-* 0, solomon-* 1). That grep reproduces exactly — and it measured a TOKEN, not a
 * CAPABILITY. The machinery is named self-review / self-adherence-review, and it is prolific:
 * 639 rows across feedback.category IN (coordinator_review, coordinator_adam_review), median
 * description 1,401 chars, 83% over 1,000 chars. Long-form prose, not telemetry.
 *
 * THE ACTUAL DEFECT IS PROMOTION, NOT CAPTURE. issue_patterns holds 1,662 rows and
 * source='feedback_cluster' holds ZERO. The /learn noise filter (scripts/modules/learning/
 * filter.mjs:77-84) admits only source IN ('retrospective','feedback_cluster'), so with that lane
 * empty every admitted pattern is necessarily worker-originated — exactly why a live /learn run
 * returned "Lessons: 5, every one carrying a Source SD id". The roles are not filtered out at the
 * gate; THEY NEVER ARRIVE AT IT.
 *
 * WHY NOT ROUTE THROUGH lib/learning/feedback-clusterer.js — TWO INDEPENDENT BLOCKS, MEASURED:
 *   (1) Its query filters .not('error_hash','is',null) (:56-62). ALL 639 role rows have
 *       error_hash NULL. Control: 2,133 rows table-wide DO carry one, so the column is live and
 *       the zero is specific to this lane.
 *   (2) THRESHOLDS.MIN_OCCURRENCES=5 within 14 days — it promotes an error that RECURS five
 *       times. Role learnings are unique one-off prose. They would never cluster.
 * The clusterer is an ERROR-DEDUPLICATION instrument and this content is the opposite shape. It
 * is NOT dead code (shebang, process.argv, isMainModule guard at :466 — it is CLI-executable);
 * it is simply the wrong instrument.
 *
 * SHAPE COPIED FROM THE WORKING PRECEDENT, lib/eva/traversal-reflection-emitter.js:
 *   - write DIRECTLY to issue_patterns with source='retrospective' (already admitted by the
 *     filter, so filter.mjs is NOT modified — FR-2)
 *   - distinguish origin via metadata.emission_type rather than a new source value. That is not
 *     stylistic: issue_patterns_source_check is a CHECK enum on source, so a value like
 *     'role_review' would FAIL THE WRITE OUTRIGHT (same class as system_settings.valid_setting_keys,
 *     which refuted a store choice earlier in this same session)
 *   - a quality floor that SKIPS the write, so promotion cannot pollute issue_patterns
 *   - an explicit idempotency pre-check (FR-3) — but NOT on dedup_fingerprint, which the database
 *     overwrites; see roleLearningDedupKey below for the measurement that forced that change
 *
 * ONE DELIBERATE DEPARTURE FROM THE PRECEDENT: it uses category='learning_reflection', which has
 * ZERO live rows — an unproven value. This uses 'process' (297 live rows, proven accepted) and
 * leans on metadata.emission_type for distinguishability, which is what the precedent's own header
 * argues for anyway.
 *
 * WHAT THIS DOES NOT DO: it does not FORCE a role to capture anything. That is FR-4..FR-6 and a
 * separate mechanism. Existing capture is opportunistic — it happens when a seat chooses to write
 * a review — and a role that freezes mid-iteration contributes whatever it had already written.
 * This module reconnects what is already being written; it does not make writing unavoidable.
 */
import { scoreLessonQuality } from '../eva/lesson-quality-guard.js';

/** feedback.category values populated by the role self-review scripts. */
export const ROLE_FEEDBACK_CATEGORIES = Object.freeze([
  'coordinator_review', 'coordinator_adam_review', 'adam_adherence_drift', 'fleet_retro',
]);

/** Marks a promoted row's origin. The source column cannot carry this (CHECK enum). */
export const EMISSION_TYPE = 'role_review';

/** Proven-accepted category. See the header note on 'learning_reflection'. */
export const ISSUE_PATTERNS_CATEGORY = 'process';

const RECENT_LESSON_LOOKBACK = 5;

/**
 * IDEMPOTENCY KEY — metadata.source_feedback_id, NOT dedup_fingerprint.
 *
 * MEASURED THE HARD WAY: supplying dedup_fingerprint='role_review:<uuid>' and reading it back
 * live returned '44352f420731cbcb659fc1008977d42b' — a computed 32-char hash. Something on the
 * DB side (trigger/default) OVERWRITES whatever the client supplies, so a pre-check keyed on it
 * matches NOTHING and every re-run would insert a duplicate. The unit-test double accepted the
 * supplied value verbatim, so 18 green tests said the idempotency worked while it did not — the
 * same permissive-mock failure that refuted a store choice earlier in this session.
 *
 * metadata.source_feedback_id survives the write intact (verified on the same live row), so the
 * provenance field doubles as the dedup key. This module therefore does NOT supply
 * dedup_fingerprint at all: writing a value the database silently replaces is a lie in the record.
 */
export function roleLearningDedupKey(row) {
  return row && row.id ? String(row.id) : null;
}

/**
 * Recent role-originated lessons, for the quality guard's repetition check.
 * Fail-soft: on error the guard simply sees no history.
 */
async function fetchRecentRoleLessons(supabase, logger) {
  try {
    const { data, error } = await supabase.from('issue_patterns')
      .select('issue_summary')
      .eq('metadata->>emission_type', EMISSION_TYPE)
      .order('created_at', { ascending: false })
      .limit(RECENT_LESSON_LOOKBACK);
    if (error) { logger.warn(`[RolePromoter] recent-lesson lookup failed: ${error.message}`); return []; }
    return (data || []).map((r) => r.issue_summary).filter(Boolean);
  } catch (e) {
    logger.warn(`[RolePromoter] recent-lesson lookup threw: ${e.message}`);
    return [];
  }
}

/**
 * Promote ONE role-originated feedback row into issue_patterns.
 * Never throws — a promotion failure must never abort the caller's operating tick.
 *
 * @returns {Promise<{promoted:boolean, skipped?:string, patternId?:string, error?:string, reasons?:string[]}>}
 */
export async function promoteOne(supabase, row, deps = {}) {
  const logger = deps.logger || console;
  if (!supabase || !row || !row.id) return { promoted: false, skipped: 'missing supabase/row' };

  const lessonText = String(row.description || '').trim();
  if (!lessonText) return { promoted: false, skipped: 'empty_description' };

  try {
    const dedupKey = roleLearningDedupKey(row);

    // IDEMPOTENCY BY EXPLICIT PRE-CHECK on a field the database PRESERVES (see roleLearningDedupKey).
    // Fail CLOSED: an unreadable dedup state must not fall through into a duplicate insert.
    const { data: existing, error: existErr } = await supabase.from('issue_patterns')
      .select('pattern_id').eq('metadata->>source_feedback_id', dedupKey).limit(1);
    if (existErr) return { promoted: false, error: `dedup check failed: ${existErr.message}` };
    if (existing && existing.length) return { promoted: false, skipped: 'already_promoted' };

    const recentLessons = deps.recentLessons || await fetchRecentRoleLessons(supabase, logger);
    const { score, reasons } = scoreLessonQuality(lessonText, { recentLessons });
    if (score === 0) {
      // The precedent SKIPS rather than downgrades, precisely so promotion cannot inflate the
      // pattern corpus with low-signal rows. 639 promoted unfiltered would grow a 1,662-row
      // corpus by ~38%.
      return { promoted: false, skipped: 'quality_floor', reasons };
    }

    const patternId = `PAT-ROLE-${fingerprintSuffix(row.id)}`;
    const { error } = await supabase.from('issue_patterns').insert({
      pattern_id: patternId,
      category: ISSUE_PATTERNS_CATEGORY,
      severity: row.severity === 'critical' || row.severity === 'high' ? 'medium' : 'low',
      issue_summary: lessonText,
      occurrence_count: 1,
      status: 'active',
      source: 'retrospective',
      metadata: {
        emission_type: EMISSION_TYPE,
        source_feedback_id: row.id,          // FR-3 provenance: traceable to the originating row
        source_feedback_category: row.category,
        source_feedback_created_at: row.created_at,
        promoted_at: new Date().toISOString(),
      },
    });
    if (error) {
      logger.warn(`[RolePromoter] insert failed for feedback ${row.id}: ${error.message}`);
      return { promoted: false, error: error.message };
    }
    return { promoted: true, patternId };
  } catch (err) {
    logger.warn(`[RolePromoter] unexpected failure for feedback ${row.id}: ${err.message}`);
    return { promoted: false, error: err.message };
  }
}

function fingerprintSuffix(id) {
  return String(id).replace(/-/g, '').slice(0, 12);
}

/**
 * Promote a batch of role-originated feedback rows.
 *
 * NOTE ON STATUS: rows are NOT filtered by feedback.status. 308 of the 639 are already
 * 'resolved', but that records the FEEDBACK ITEM being actioned — it says nothing about whether
 * the LEARNING inside it is still valid. Filtering on it would discard half the corpus for a
 * reason unrelated to learning value. The quality floor is the filter that matters.
 *
 * @returns {Promise<{scanned:number, promoted:number, skipped:object, errors:number}>}
 */
export async function promoteRoleLearnings(supabase, opts = {}) {
  const { limit = 100, categories = ROLE_FEEDBACK_CATEGORIES, logger = console } = opts;
  const summary = { scanned: 0, promoted: 0, skipped: {}, errors: 0 };
  if (!supabase) return summary;

  const { data, error } = await supabase.from('feedback')
    .select('id, category, description, severity, created_at')
    .in('category', categories)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { logger.warn(`[RolePromoter] feedback query failed: ${error.message}`); summary.errors += 1; return summary; }

  const recentLessons = await fetchRecentRoleLessons(supabase, logger);
  for (const row of data || []) {
    summary.scanned += 1;
    const r = await promoteOne(supabase, row, { logger, recentLessons });
    if (r.promoted) summary.promoted += 1;
    else if (r.error) summary.errors += 1;
    else summary.skipped[r.skipped] = (summary.skipped[r.skipped] || 0) + 1;
  }
  return summary;
}

export default {
  promoteOne, promoteRoleLearnings, roleLearningDedupKey,
  ROLE_FEEDBACK_CATEGORIES, EMISSION_TYPE, ISSUE_PATTERNS_CATEGORY,
};
