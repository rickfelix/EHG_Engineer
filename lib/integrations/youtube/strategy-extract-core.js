/**
 * Pure helpers for the YouTube strategy-extraction orchestrator (FR-3 of
 * SD-LEO-INFRA-YOUTUBE-STRATEGY-EXTRACTION-001).
 *
 * No I/O lives here — categorization, SD-dedup, and ledger-entry shaping are
 * pure functions so they are unit-testable in isolation. The I/O wiring
 * (Supabase reads of eva_youtube_intake, refine-score.js scoring, transcript
 * fallback, ledger file persistence, disposal) lives in
 * scripts/eva/youtube-strategy-extract.js.
 */

/** The Todoist-B1-review framework taxonomy. 'reference' is the safe default. */
export const CATEGORIES = Object.freeze(['enhancement', 'build', 'research', 'reference']);

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'how', 'why',
  'what', 'your', 'you', 'is', 'are', 'this', 'that', 'from', 'by', 'at', 'as', 'it',
  'video', 'youtube', 'part', 'ep', 'episode',
]);

/**
 * Tokenize a title/summary into meaningful lowercase tokens (>=3 chars, no stopwords).
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/**
 * Categorize an extracted framework into enhancement|build|research|reference,
 * mirroring the Todoist B1 review taxonomy. Keyword heuristic over the summary
 * plus intake metadata; defaults to 'reference' (the safe non-actionable bucket).
 *
 * @param {string} summary - the extracted framework summary
 * @param {Object} [meta] - {chairman_notes, business_function, chairman_intent}
 * @returns {'enhancement'|'build'|'research'|'reference'}
 */
export function categorizeFramework(summary, meta = {}) {
  const text = `${summary || ''} ${meta.chairman_notes || ''} ${meta.business_function || ''} ${meta.chairman_intent || ''}`.toLowerCase();
  if (/\b(infrastructure|infra|pipeline|automation|tooling|workflow|process improvement|gate|guard|orchestrat|ci\/cd|observability)\b/.test(text)) return 'enhancement';
  if (/\b(build|implement|feature|product|launch|mvp|ship|prototype|deploy)\b/.test(text)) return 'build';
  if (/\b(research|explore|investigate|study|experiment|hypothesis|benchmark|analy[sz]e)\b/.test(text)) return 'research';
  return 'reference';
}

/**
 * Dedup an extracted framework against existing SD titles by token overlap.
 * Returns { status:'novel'|'dup-of-SD', matchedSd, score } where score is the
 * best overlap ratio (fraction of the framework's tokens present in an SD title).
 *
 * Pure: the caller supplies the SD list ({ sd_key, title }).
 *
 * @param {string} frameworkTitle
 * @param {Array<{sd_key:string,title:string}>} sdList
 * @param {number} [threshold=0.5]
 * @returns {{status:'novel'|'dup-of-SD', matchedSd:string|null, score:number}}
 */
export function dedupAgainstSDs(frameworkTitle, sdList = [], threshold = 0.5) {
  const fwTokens = tokenize(frameworkTitle);
  if (fwTokens.length === 0 || !Array.isArray(sdList) || sdList.length === 0) {
    return { status: 'novel', matchedSd: null, score: 0 };
  }
  const fwSet = new Set(fwTokens);
  let best = { matchedSd: null, score: 0 };
  for (const sd of sdList) {
    if (!sd || !sd.title) continue;
    const sdSet = new Set(tokenize(sd.title));
    if (sdSet.size === 0) continue;
    let overlap = 0;
    for (const t of fwSet) if (sdSet.has(t)) overlap++;
    const ratio = overlap / fwSet.size;
    if (ratio > best.score) best = { matchedSd: sd.sd_key, score: ratio };
  }
  return best.score >= threshold
    ? { status: 'dup-of-SD', matchedSd: best.matchedSd, score: best.score }
    : { status: 'novel', matchedSd: null, score: best.score };
}

/**
 * Derive the per-video ledger entry (extraction metadata). Pure — the caller
 * stamps updated_at and persists. analysis_status is 'ok' when a summary was
 * produced, else the failure method (failed_long | failed_other).
 *
 * @param {Object} p
 * @param {string} p.videoId
 * @param {string} p.title
 * @param {string} p.method - native|transcript_fallback|failed_long|failed_other
 * @param {string|null} p.summary
 * @param {string} [p.category]
 * @param {{status:string,matchedSd:string|null}} [p.dedup]
 * @param {{composite:number,recommendation:string}|null} [p.score]
 * @returns {object}
 */
export function buildLedgerEntry({ videoId, title, method, summary, category, dedup, score }) {
  const ok = Boolean(summary);
  return {
    video_id: videoId,
    title: title || '',
    analysis_status: ok ? 'ok' : (method === 'failed_long' ? 'failed_long' : 'failed_other'),
    method: method || (ok ? 'native' : 'failed_other'),
    composite_score: score && typeof score.composite === 'number' ? score.composite : null,
    recommendation: score && score.recommendation ? score.recommendation : null,
    category: ok ? (category || 'reference') : null,
    dedup_status: ok && dedup ? dedup.status : null,
    matched_sd: ok && dedup ? dedup.matchedSd : null,
    disposed: false,
  };
}

/**
 * Decide whether an extracted framework should be flagged for chairman/coordinator
 * routing (enhancement-worthy): novel, category=enhancement, composite>=70.
 * Pure predicate over a ledger entry.
 * @param {object} entry - a buildLedgerEntry result
 * @returns {boolean}
 */
export function isEnhancementWorthy(entry) {
  return (
    !!entry &&
    entry.analysis_status === 'ok' &&
    entry.dedup_status === 'novel' &&
    entry.category === 'enhancement' &&
    typeof entry.composite_score === 'number' &&
    entry.composite_score >= 70
  );
}

/**
 * Decide whether a video is eligible for disposal (move For-Processing ->
 * Processed). Only successfully-extracted videos are eligible; failures are kept
 * in For-Processing for retry (EVA-straggler discipline). Pure predicate.
 * @param {object} entry
 * @returns {boolean}
 */
export function isDisposable(entry) {
  return !!entry && entry.analysis_status === 'ok';
}

export default {
  CATEGORIES,
  tokenize,
  categorizeFramework,
  dedupAgainstSDs,
  buildLedgerEntry,
  isEnhancementWorthy,
  isDisposable,
};
