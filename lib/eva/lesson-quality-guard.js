/**
 * FR-2 — Lesson-quality floor guard (anti-Goodhart) for the traversal-reflection
 * emitter (SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-E).
 *
 * A traversal that emits zero-signal boilerplate lessons must score 0 toward the
 * learning-moat gauge, not 1 -- otherwise the gauge itself is Goodhartable (high-volume
 * low-signal emissions inflate "lessons-per-traversal" without adding real signal).
 *
 * Pinned rubric (PLAN-TO-EXEC correction, DESIGN sub-agent condition COND-FR2-RUBRIC):
 * a lesson scores 1 only if ALL of:
 *   (1) non-boilerplate length  -- body text >= MIN_SIGNAL_LENGTH chars after stripping
 *       template scaffolding
 *   (2) concrete referent       -- contains a file path, table name, error string, SD/QF
 *       key, or an issue_patterns.pattern_id reference
 *   (3) distinctness            -- token-overlap similarity < DISTINCTNESS_THRESHOLD
 *       against the last N lessons emitted for the same venture (catches templated repeats)
 * Criterion (4), pattern-linkage (the write to issue_patterns actually succeeds and is not
 * orphaned), is enforced by the caller (traversal-reflection-emitter.js) -- it is an
 * end-to-end write-path property, not a pure text-scoring input.
 */

export const MIN_SIGNAL_LENGTH = 40;
export const DISTINCTNESS_THRESHOLD = 0.8;
export const RECENT_LESSON_WINDOW = 5;

// Boilerplate scaffolding phrases stripped before measuring signal length -- generic
// template language a low-effort emission would lean on to pad length without content.
const SCAFFOLDING_RE = /\b(lesson learned|traversal completed|no issues (found|to report)|everything (worked|went) (fine|well|as expected)|process (worked|went) as (expected|planned)|nothing (notable|of note) to report)\b/gi;

// Concrete-referent patterns: a file path, a table name reference, an error string, an
// SD/QF key, or an issue_patterns pattern_id -- any ONE satisfies criterion (2).
const REFERENT_PATTERNS = [
  /(?:[\w.-]+\/)+[\w.-]+\.[a-z]{1,5}\b/i, // file path, e.g. lib/foo/bar.js
  /\b(?:table|column)\s+[a-z_][a-z0-9_]*\b/i, // table/column reference
  /\berror\s*[:=]\s*\S+/i, // "error: <something>"
  /\bSD-[A-Z0-9-]+\b/, // SD key
  /\bQF-\d{8}-\d+\b/, // QF key
  /\bPAT-[A-Z0-9-]+\b/, // issue_patterns pattern_id
];

function stripScaffolding(text) {
  return (text || '').replace(SCAFFOLDING_RE, '').trim();
}

/**
 * Simple word-token Jaccard-style overlap similarity in [0,1]. Cheap and deterministic --
 * sufficient for catching near-verbatim templated repeats without a heavier dependency.
 */
function tokenOverlapSimilarity(a, b) {
  const tokenize = (s) => new Set((s || '').toLowerCase().match(/[a-z0-9]+/g) || []);
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Score a lesson against the pinned quality-floor rubric.
 *
 * @param {string} lessonText - the lesson/reflection body text
 * @param {{ recentLessons?: string[] }} [opts] - recentLessons: up to RECENT_LESSON_WINDOW
 *   most-recent lesson texts for the SAME venture, most-recent first
 * @returns {{ score: 0|1, reasons: string[] }}
 */
export function scoreLessonQuality(lessonText, opts = {}) {
  const recentLessons = (opts.recentLessons || []).slice(0, RECENT_LESSON_WINDOW);
  const reasons = [];

  const stripped = stripScaffolding(lessonText);
  const lengthOk = stripped.length >= MIN_SIGNAL_LENGTH;
  if (!lengthOk) reasons.push(`length ${stripped.length} < ${MIN_SIGNAL_LENGTH} after stripping scaffolding`);

  const hasReferent = REFERENT_PATTERNS.some((re) => re.test(lessonText || ''));
  if (!hasReferent) reasons.push('no concrete referent (file path / table / error / SD-QF key / pattern_id)');

  let distinct = true;
  for (const prior of recentLessons) {
    const sim = tokenOverlapSimilarity(lessonText, prior);
    if (sim >= DISTINCTNESS_THRESHOLD) {
      distinct = false;
      reasons.push(`similarity ${sim.toFixed(2)} >= ${DISTINCTNESS_THRESHOLD} vs a recent lesson (templated repeat)`);
      break;
    }
  }

  const score = lengthOk && hasReferent && distinct ? 1 : 0;
  return { score, reasons };
}
