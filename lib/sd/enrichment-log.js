/**
 * Append-only authorship log for SD metadata enrichment. QF-20260903-909.
 *
 * THE DEFECT. Every seat that enriches an SD hand-rolls the write as
 * `metadata.lead_enrichment = { ... }`, so the last writer silently replaces the previous one and
 * the victim is unidentifiable from the row afterwards. Measured live on
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-D: one seat's success_criteria were overwritten by another,
 * the fleet needed a broadcast plus a follow-up correction to establish who did it, and the first
 * attribution named the WRONG seat. A row that cannot answer "who wrote this, and over what" turns
 * an ordinary collision into a fleet-wide investigation.
 *
 * There was no canonical writer to fix — grep found only one-off scripts assigning the whole
 * object, and `enrichment_log` did not exist anywhere. So this is the writer, not a patch to one.
 *
 * THE RULE THIS ENCODES, adopted fleet-wide by the coordinator:
 *   "Assert the delta you INTENDED is the delta you GOT. A count catches an interleaved write; a
 *    set-difference catches a clobber that PRESERVES the count."
 * A length check is the assertion everyone reaches for first, and it is exactly the one that
 * cannot see a same-size replacement — the shape of the clobber that actually happened.
 */

/** Deep-enough clone for plain JSON metadata; never mutates the caller's object. */
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/**
 * Append one authored entry to metadata.enrichment_log, preserving everything already there.
 *
 * Deliberately does NOT delete or rewrite `lead_enrichment`: existing readers (and several
 * one-off scripts that read `metadata.lead_enrichment.prior_success_criteria`) still depend on it,
 * and breaking them to tidy the shape would trade one silent failure for another. The scalar keeps
 * meaning "most recent"; the log is what makes the earlier authors recoverable.
 *
 * @param {object} metadata - the SD's existing metadata (not mutated).
 * @param {object} entry - { by, session_id, summary, ...anything else the author wants recorded }.
 * @returns {object} new metadata with the entry appended.
 */
export function appendEnrichmentEntry(metadata = {}, entry = {}) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error('appendEnrichmentEntry: entry must be an object');
  }
  if (!entry.by || !String(entry.by).trim()) {
    // Authorship is the whole point. An anonymous entry would log that SOMETHING happened while
    // leaving the same question unanswerable.
    throw new Error('appendEnrichmentEntry: entry.by is required — an unattributed entry cannot identify a clobber');
  }

  const next = clone(metadata) ?? {};
  const existing = Array.isArray(next.enrichment_log) ? next.enrichment_log : [];

  next.enrichment_log = [
    ...existing,
    { at: new Date().toISOString(), ...clone(entry) }
  ];
  return next;
}

/**
 * Compare two collections by IDENTITY, not by size.
 *
 * @param {Array} before
 * @param {Array} after
 * @param {(item:any)=>string} identify - how to name an element; defaults to stable JSON.
 * @returns {{added:string[], removed:string[], kept:string[], count_before:number, count_after:number}}
 */
export function setDifference(before = [], after = [], identify = (x) => JSON.stringify(x)) {
  const b = (Array.isArray(before) ? before : []).map(identify);
  const a = (Array.isArray(after) ? after : []).map(identify);
  const bSet = new Set(b);
  const aSet = new Set(a);
  return {
    added: a.filter((x) => !bSet.has(x)),
    removed: b.filter((x) => !aSet.has(x)),
    kept: b.filter((x) => aSet.has(x)),
    count_before: b.length,
    count_after: a.length
  };
}

/**
 * Assert that the change you made is the change you meant to make.
 *
 * Throws when anything was removed that you did not declare you were removing. A same-size
 * replacement — the clobber shape actually observed — passes every count check and fails here.
 *
 * @param {Array} before
 * @param {Array} after
 * @param {object} opts - { expectRemoved?: string[], identify?: fn, subject?: string }
 */
export function assertIntendedDelta(before, after, { expectRemoved = [], identify, subject = 'collection' } = {}) {
  const diff = setDifference(before, after, identify);
  const allowed = new Set(expectRemoved.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))));
  const unexpected = diff.removed.filter((x) => !allowed.has(x));

  if (unexpected.length > 0) {
    throw new Error(
      `UNINTENDED_DELTA (${subject}): ${unexpected.length} element(s) removed that the caller did not `
      + `declare. Counts were ${diff.count_before} -> ${diff.count_after}, so a length check would have `
      + `passed${diff.count_before === diff.count_after ? ' (identical counts — this is the clobber shape)' : ''}. `
      + `Removed: ${unexpected.map((x) => String(x).slice(0, 120)).join(' | ')}`
    );
  }
  return diff;
}
