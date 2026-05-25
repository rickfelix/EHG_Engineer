/**
 * suggest-resolution-links — advisory matcher for the QF close-the-loop (FR-3)
 * SD-LEO-INFRA-AUTO-CLOSE-QUICK-001
 *
 * Finds OPEN quick-fixes that a given SD plausibly supersedes, by token overlap
 * between the SD (title/scope/description) and each QF (title/description/files_changed).
 *
 * This is a DELIBERATELY WEAK, ADVISORY signal (testing-agent R6): file/topic
 * overlap is noisy (shared utils, empty files_changed). It NEVER auto-links —
 * callers surface candidates for an operator to confirm. The function is
 * non-blocking by contract: it never throws; on any error it returns [].
 */

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'to', 'from', 'with', 'of', 'for', 'in',
  'on', 'at', 'is', 'are', 'be', 'when', 'not', 'no', 'sd', 'qf', 'fix', 'fixes',
  'add', 'use', 'via', 'into', 'that', 'this', 'it', 'its', 'by', 'so',
]);

/** Tokenize text into a Set of meaningful lowercased words (len >= 4, non-stopword). */
export function tokenize(text) {
  if (!text || typeof text !== 'string') return new Set();
  return new Set(
    text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w)),
  );
}

/** Jaccard-ish overlap score (0..1): shared tokens / smaller set size. */
export function overlapScore(aTokens, bTokens) {
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let shared = 0;
  for (const t of bTokens) if (aTokens.has(t)) shared++;
  return shared / Math.min(aTokens.size, bTokens.size);
}

/**
 * @param {object} opts
 * @param {object} opts.supabase - supabase client
 * @param {object} opts.sd - SD row (needs sd_key/id + title + scope/description)
 * @param {number} [opts.threshold=0.34] - minimum overlap to suggest
 * @param {number} [opts.limit=5] - max candidates returned
 * @returns {Promise<Array<{id,title,severity,score}>>} ranked candidates (never throws)
 */
export async function findResolutionLinkCandidates({ supabase, sd, threshold = 0.34, limit = 5 }) {
  try {
    if (!supabase || !sd) return [];
    const sdTokens = tokenize(
      [sd.title, sd.scope, sd.description].filter(Boolean).join(' '),
    );
    if (sdTokens.size === 0) return [];

    const { data, error } = await supabase
      .from('quick_fixes')
      .select('id, title, description, severity, files_changed, status, resolution_sd_id')
      .in('status', ['open', 'in_progress'])
      .is('resolution_sd_id', null)
      .limit(200);
    if (error || !Array.isArray(data)) return [];

    const sdKey = sd.sd_key || sd.id;
    const candidates = [];
    for (const qf of data) {
      const filesText = Array.isArray(qf.files_changed) ? qf.files_changed.join(' ') : (qf.files_changed || '');
      const qfTokens = tokenize([qf.title, qf.description, filesText].filter(Boolean).join(' '));
      const score = overlapScore(sdTokens, qfTokens);
      if (score >= threshold) {
        candidates.push({ id: qf.id, title: qf.title, severity: qf.severity, score: Number(score.toFixed(2)), suggested_sd: sdKey });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, limit);
  } catch {
    // Advisory + non-blocking: never throw.
    return [];
  }
}
