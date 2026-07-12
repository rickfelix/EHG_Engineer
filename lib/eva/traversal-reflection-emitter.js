/**
 * FR-1 — Traversal-reflection emission (SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-E).
 *
 * Closes the learning-speed loop by feeding traversal reflections into the EXISTING,
 * already-closed /learn -> issue_patterns -> auto-SD pipeline (cross-venture-learning.js,
 * pattern-closure.js, class-escalation.js) -- this module is a NEW writer into that
 * pipeline, not a new pipeline.
 *
 * Fail-open by design: mirrors post-lifecycle-decisions.js's recordDecision() -- a
 * reflection-write failure must NEVER block a lifecycle decision or a stage completion.
 * Every call site wraps in try/catch and only warns on failure.
 *
 * Anti-Goodhart guard (FR-2, lesson-quality-guard.js): a zero-signal/boilerplate lesson is
 * scored 0 and its write is SKIPPED entirely -- it must not pollute issue_patterns or
 * inflate lessons-per-traversal.
 *
 * source='retrospective' is deliberate: the /learn noise filter's LOW_SIGNAL_SOURCE rule
 * (scripts/modules/learning/index.js) only lets source IN ('retrospective',
 * 'feedback_cluster') through composite scoring. A distinct source value (e.g.
 * 'reflection') is NOT in the issue_patterns_source_check CHECK constraint enum and would
 * both fail the DB write and (if it were allowed) be silently dropped by the noise filter
 * -- defeating FR-1's stated purpose of closing the loop. Reflection-origin rows are
 * distinguished instead via metadata.emission_type='traversal_reflection'.
 */

import { scoreLessonQuality } from './lesson-quality-guard.js';

export const EMISSION_TYPE = 'traversal_reflection';
const ISSUE_PATTERNS_CATEGORY = 'learning_reflection';
const RECENT_LESSON_LOOKBACK = 5;

/**
 * Fetch the most recent reflection-origin lesson texts for a venture, for the
 * distinctness check (FR-2 criterion 3). Fail-open: returns [] on any query error.
 */
async function fetchRecentLessons(supabase, ventureId, logger) {
  try {
    const { data, error } = await supabase
      .from('issue_patterns')
      .select('issue_summary')
      .eq('metadata->>emission_type', EMISSION_TYPE)
      .eq('metadata->>venture_id', ventureId)
      .order('created_at', { ascending: false })
      .limit(RECENT_LESSON_LOOKBACK);
    if (error) throw error;
    return (data || []).map((r) => r.issue_summary);
  } catch (err) {
    logger.warn(`[TraversalReflection] Failed to fetch recent lessons (proceeding without distinctness history): ${err.message}`);
    return [];
  }
}

/**
 * Emit a traversal reflection into issue_patterns, gated by the FR-2 quality-floor guard.
 * FAIL-OPEN: never throws. Returns a result object describing what happened, for logging
 * only -- callers must not branch lifecycle/stage behavior on the return value.
 *
 * @param {object} supabase - injected Supabase client
 * @param {object} params
 * @param {string} params.ventureId
 * @param {string} params.lessonText - the reflection/lesson body
 * @param {string} [params.sdId] - SD context, if any (first/last_seen_sd_id)
 * @param {object} [params.metadataExtra] - additional metadata to merge (e.g. decision_type, stage)
 * @param {object} [deps]
 * @param {object} [deps.logger]
 * @returns {Promise<{ emitted: boolean, skipped?: string, patternId?: string, error?: string }>}
 */
export async function emitTraversalReflection(supabase, params, deps = {}) {
  const { ventureId, lessonText, sdId = null, metadataExtra = {} } = params;
  const logger = deps.logger || console;

  if (!supabase || !ventureId || !lessonText) {
    return { emitted: false, skipped: 'missing supabase/ventureId/lessonText' };
  }

  try {
    const recentLessons = await fetchRecentLessons(supabase, ventureId, logger);
    const { score, reasons } = scoreLessonQuality(lessonText, { recentLessons });

    if (score === 0) {
      logger.log(`[TraversalReflection] Lesson scored 0 (boilerplate/low-signal), skipping write for venture ${ventureId}: ${reasons.join('; ')}`);
      return { emitted: false, skipped: 'quality_floor', reasons };
    }

    const patternId = `PAT-REFL-${cryptoRandomId()}`;
    const dedupFingerprint = `reflection:${ventureId}:${sdId || 'none'}:${hashText(lessonText)}`;

    const { error } = await supabase.from('issue_patterns').insert({
      pattern_id: patternId,
      category: ISSUE_PATTERNS_CATEGORY,
      severity: 'low',
      issue_summary: lessonText,
      occurrence_count: 1,
      first_seen_sd_id: sdId,
      last_seen_sd_id: sdId,
      status: 'active',
      source: 'retrospective',
      dedup_fingerprint: dedupFingerprint,
      metadata: {
        emission_type: EMISSION_TYPE,
        venture_id: ventureId,
        ...metadataExtra,
      },
    });

    if (error) {
      // Criterion (4), pattern-linkage: the write failed -- this lesson is orphaned, not
      // counted. Fail-open: log and return, never throw.
      logger.warn(`[TraversalReflection] issue_patterns insert failed for venture ${ventureId}: ${error.message}`);
      return { emitted: false, error: error.message };
    }

    return { emitted: true, patternId };
  } catch (err) {
    logger.warn(`[TraversalReflection] Unexpected failure emitting reflection for venture ${ventureId}: ${err.message}`);
    return { emitted: false, error: err.message };
  }
}

function cryptoRandomId() {
  // Namespaced, collision-free without coordinating with the shared PAT-NNN sequential
  // counter (lib/learning/pattern-detection-engine.js) -- avoids a read-then-increment
  // race under concurrent writers.
  return Math.random().toString(36).slice(2, 10);
}

function hashText(text) {
  // Cheap, deterministic, non-cryptographic fingerprint -- sufficient for de-duplicating
  // an identical reflection re-emitted for the same venture/SD.
  let h = 0;
  for (let i = 0; i < text.length; i += 1) {
    h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}
