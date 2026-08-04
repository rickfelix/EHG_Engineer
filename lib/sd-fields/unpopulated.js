/**
 * SD-LEO-INFRA-STRUCTURED-FIELDS-HONEST-001 — the shared vocabulary for "this field has no real
 * content", and the detector for the legacy filler it replaces.
 *
 * THE THESIS, in one line: a field that reads plausible and means nothing is worse than a field
 * that is empty, because emptiness is detectable and plausible filler is not.
 *
 * MEASURED, not asserted (2026-08-03, whole-table, count-verified and fully paginated): of 5,536
 * SDs, 1,096 carry exact-equality filler in success_criteria.measure and 1,292 in
 * key_changes.impact. Only 34 of the 1,096 are not completed/cancelled — the rest are historical,
 * which is why this SD counts them and deliberately does NOT rewrite them.
 *
 * WHY A SENTINEL RATHER THAN null OR AN OMITTED KEY. Both were considered and both break a live
 * consumer: transition-readiness.js validates success_criteria entries as
 * `m.criterion && m.measure` (Format 2), so a null/absent measure makes every entry INVALID and
 * the gate hard-blocks at -25 on an SD whose author simply had nothing measurable to state. The
 * sentinel keeps the shape valid while being unmistakable — no human and no relevance check reads
 * "[UNPOPULATED]" as content, whereas "See description for details" is designed to.
 *
 * THE POINT IS NOT THE STRING, IT IS THE DETECTABILITY. Filler is only a problem because it is
 * indistinguishable from content; a marker that announces itself is not filler.
 */

/** The explicit marker. Bracketed and screaming so it cannot be mistaken for prose. */
export const UNPOPULATED = '[UNPOPULATED]';

/**
 * The legacy filler constants, EXACT strings as emitted by the two producers.
 *
 * EXACT-EQUALITY IS LOAD-BEARING AND EMPIRICALLY JUSTIFIED — this is not a style preference.
 * A substring/ilike detector returns 1,097 against exact-equality's 1,096, and the single false
 * positive is SD-LEO-INFRA-STRUCTURED-FIELDS-HONEST-001 itself, whose HONEST criterion quotes the
 * filler phrase while describing it. A detector that cannot tell a row DESCRIBING the defect from
 * a row HAVING it misreports the very population it exists to count.
 *
 * Sources (verified at file:line during LEAD):
 *   scripts/modules/validate-sd-fields.js:44,:54  -> 'See description for details'
 *   scripts/modules/validate-sd-fields.js:119     -> 'Implementation verified and tests passing'
 *   scripts/modules/validate-sd-fields.js:131     -> 'See SD description for details'
 */
export const LEGACY_FILLER = Object.freeze([
  'See description for details',
  'See SD description for details',
  'Implementation verified and tests passing',
]);

/** True when a value is the explicit unpopulated marker. */
export function isUnpopulated(value) {
  return value === UNPOPULATED;
}

/**
 * True when a value is legacy filler — EXACT equality only, never substring.
 * See LEGACY_FILLER for why that distinction is load-bearing rather than pedantic.
 */
export function isLegacyFiller(value) {
  return typeof value === 'string' && LEGACY_FILLER.includes(value);
}

/** True when a value carries no real content: either the marker or legacy filler. */
export function isContentless(value) {
  return isUnpopulated(value) || isLegacyFiller(value);
}

/**
 * Classify ONE array entry of a structured SD field.
 *
 * HANDLES BOTH SHAPES ON PURPOSE. The default generators emit arrays of STRINGS, and
 * autoEnrichStructure coerces those into OBJECTS — so the same logical field exists in the wild in
 * two shapes, and a detector that only understands one silently under-reports. Because that
 * coercion runs PRE-INSERT, every post-creation lint sees 100% populated fields, which is why this
 * went unmeasured across 1,096 rows.
 *
 * @param {*} entry - a string or an object from success_criteria / key_changes / etc.
 * @param {string} valueKey - the content-bearing key ('measure' for success_criteria, 'impact' for key_changes)
 * @returns {'unpopulated'|'legacy_filler'|'content'|'empty'}
 */
export function classifyEntry(entry, valueKey) {
  if (entry === null || entry === undefined) return 'empty';

  if (typeof entry === 'string') {
    const t = entry.trim();
    if (!t) return 'empty';
    if (isUnpopulated(t)) return 'unpopulated';
    if (isLegacyFiller(t)) return 'legacy_filler';
    return 'content';
  }

  if (typeof entry === 'object') {
    const v = entry[valueKey];
    if (v === null || v === undefined || (typeof v === 'string' && !v.trim())) return 'empty';
    if (isUnpopulated(v)) return 'unpopulated';
    if (isLegacyFiller(v)) return 'legacy_filler';
    return 'content';
  }

  return 'empty';
}

/**
 * True when an entire field array carries no real content — every entry is marker, filler or empty.
 *
 * An EMPTY array returns false, not true. That is deliberate: "absent" and "present but hollow" are
 * different states and collapsing them is the exact conflation this SD exists to end. Callers that
 * need "absent" should test length themselves.
 */
export function isFieldContentless(arr, valueKey) {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  return arr.every((e) => classifyEntry(e, valueKey) !== 'content');
}

/** The content-bearing key per structured field, so callers stop hardcoding it in four places. */
export const VALUE_KEY_BY_FIELD = Object.freeze({
  success_criteria: 'measure',
  key_changes: 'impact',
  success_metrics: 'target',
});
