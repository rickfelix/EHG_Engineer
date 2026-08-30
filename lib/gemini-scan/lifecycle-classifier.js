/**
 * GA-vs-preview lifecycle classifier (SD-LEO-ORCH-GEMINI-MODEL-SCAN-001-I).
 *
 * Google's models-list response has no reliable dedicated lifecycle field, so this
 * classifies from the model id's naming convention. Default-refuse on ambiguity: an
 * unrecognized pattern is treated as non-GA, since a missed GA model is far cheaper
 * than silently recommending an unvetted preview model (PRD risk R1).
 */

const NON_GA_MARKERS = ['preview', 'exp', 'experimental', 'thinking', 'test'];

// Only an id matching this recognized Gemini naming convention (gemini-<version>-<variant>)
// is eligible to be classified GA at all -- anything that doesn't match is treated as
// unrecognized-conservative ('preview'), never silently defaulted to GA.
const RECOGNIZED_GEMINI_ID = /^gemini-\d/;

/**
 * @param {string} modelId e.g. 'gemini-2.5-flash', 'gemini-3.0-flash-preview'
 * @returns {'GA'|'preview'|'experimental'}
 */
export function classifyLifecycle(modelId) {
  const id = String(modelId || '').toLowerCase();
  if (id.includes('experimental') || /(^|-)exp(-|$)/.test(id)) return 'experimental';
  if (NON_GA_MARKERS.some((marker) => id.includes(marker))) return 'preview';
  if (!RECOGNIZED_GEMINI_ID.test(id)) return 'preview';
  return 'GA';
}

export function isGa(modelId) {
  return classifyLifecycle(modelId) === 'GA';
}
