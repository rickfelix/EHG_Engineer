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

/**
 * Summarize a set of ledger entries into counts by status / method / category /
 * dedup / recommendation. Pure.
 * @param {object[]} entries
 * @returns {object}
 */
export function summarizeEntries(entries = []) {
  const bump = (o, k) => { if (k != null) o[k] = (o[k] || 0) + 1; };
  const out = { total: entries.length, by_status: {}, by_method: {}, by_category: {}, by_dedup: {}, by_recommendation: {} };
  for (const e of entries) {
    bump(out.by_status, e.analysis_status);
    bump(out.by_method, e.method);
    bump(out.by_category, e.category);
    bump(out.by_dedup, e.dedup_status);
    bump(out.by_recommendation, e.recommendation);
  }
  return out;
}

/**
 * Orchestrate extraction over candidate intake rows. Pure-ish: every external
 * effect (video analysis, scoring) is INJECTED via deps, so the whole loop is
 * unit-testable with stubs. The CLI (scripts/eva/youtube-strategy-extract.js)
 * wires the real implementations + the I/O (Supabase, ledger file, disposal).
 *
 * For each candidate: analyze (native<->transcript via deps.analyzeWithFallback),
 * categorize, dedup vs deps.sdList, then batch-score the OK entries via deps.score
 * and merge composite/recommendation back in.
 *
 * Each returned entry carries two non-persisted fields for the CLI: `_row` (the
 * source intake row) and `_summary` (the extracted text). The CLI strips
 * `_`-prefixed keys before writing the ledger.
 *
 * @param {Array<object>} candidates - eva_youtube_intake rows
 * @param {{analyzeWithFallback:Function, score?:Function, sdList?:Array}} deps
 * @param {{verbose?:boolean}} [options]
 * @returns {Promise<{entries: object[], summary: object}>}
 */
export async function runExtraction(candidates, deps, options = {}) {
  const { analyzeWithFallback, score, sdList = [] } = deps || {};
  if (typeof analyzeWithFallback !== 'function') throw new Error('runExtraction: deps.analyzeWithFallback is required');
  const list = Array.isArray(candidates) ? candidates : [];
  const entries = [];

  for (const c of list) {
    const metadata = { title: c.title, channelName: c.channel_name, durationSeconds: c.duration_seconds };
    const chairmanIntent = c.chairman_notes || c.chairman_intent || '';
    let summary = null;
    let method = 'failed_other';
    try {
      const r = await analyzeWithFallback(c.youtube_video_id, { metadata, chairmanIntent, verbose: options.verbose });
      summary = r && r.summary;
      method = (r && r.method) || 'failed_other';
    } catch {
      summary = null;
      method = 'failed_other';
    }
    const category = summary ? categorizeFramework(summary, c) : null;
    const dedup = summary ? dedupAgainstSDs(c.title, sdList) : null;
    const entry = buildLedgerEntry({ videoId: c.youtube_video_id, title: c.title, method, summary, category, dedup });
    entry._row = c;
    entry._summary = summary;
    entries.push(entry);
  }

  // Batch-score the successfully-extracted entries (one call, persona-batched).
  const okEntries = entries.filter((e) => e.analysis_status === 'ok');
  if (okEntries.length > 0 && typeof score === 'function') {
    try {
      const items = okEntries.map((e) => ({
        title: e.title,
        description: e._summary || '',
        target_application: e._row.target_application || 'ehg_engineer',
        chairman_intent: e._row.chairman_intent || 'insight',
        source_type: 'youtube',
      }));
      const scored = await score(items);
      (scored && scored.item_scores ? scored.item_scores : []).forEach((s) => {
        const e = okEntries[s.item_index - 1];
        if (e) { e.composite_score = s.composite; e.recommendation = s.recommendation; }
      });
    } catch { /* fail-open: entries keep null score */ }
  }

  return { entries, summary: summarizeEntries(entries) };
}

/**
 * Strip the non-persisted `_`-prefixed working fields from a ledger entry.
 * @param {object} entry
 * @returns {object}
 */
export function cleanLedgerEntry(entry) {
  const out = {};
  for (const [k, v] of Object.entries(entry || {})) if (!k.startsWith('_')) out[k] = v;
  return out;
}

export default {
  CATEGORIES,
  tokenize,
  categorizeFramework,
  dedupAgainstSDs,
  buildLedgerEntry,
  isEnhancementWorthy,
  isDisposable,
  summarizeEntries,
  runExtraction,
  cleanLedgerEntry,
};
