/**
 * SD-LEO-INFRA-PARENT-SCOPE-COVERAGE-001: canonical scope-coverage utility.
 *
 * A parent orchestrator SD's children can silently fail to cover the parent's declared
 * scope — PARENT_DELEGATED_COMPLETION only checks that >=1 child row exists, never that
 * the children's union actually implements the parent's scope/success_criteria. Real
 * incident: a parent titled "Develop MarketLens Landing Page with Hero and CTA" completed
 * green with children that only built an API layer; no landing page was ever built.
 *
 * Pure, DB-free core (extractScopeElements, computeScopeCoverage) so both the
 * decomposition-time hook (lib/sd/child-linkage.js) and the completion-time gate
 * (scripts/modules/handoff/executors/exec-to-plan/parent-orchestrator.js) share ONE
 * implementation instead of each growing its own scope parser. Reuses the item-splitting
 * pattern from scripts/modules/handoff/executors/plan-to-lead/gates/scope-audit.js and the
 * keyword-overlap heuristic already proven in
 * scripts/modules/handoff/executors/plan-to-lead/gates/child-scope-coverage.js — no new
 * fuzzy-matching algorithm is introduced.
 *
 * Advisory-only by design: children are registered incrementally, one at a time (see
 * child-linkage.js's own JSDoc), so a strict "fully covered" check at registration time
 * would throw on the very first child. This module never throws and never blocks; callers
 * decide what to do with an incomplete-coverage result (warn, flag, or ignore).
 *
 * @module lib/sd/scope-coverage
 */

const MIN_KEYWORD_LENGTH = 4;
const STOPWORDS = new Set([
  'this', 'that', 'with', 'from', 'into', 'when', 'what', 'have', 'will',
  'shall', 'should', 'must', 'they', 'their', 'them', 'each', 'every',
  'element', 'elements', 'scope', 'parent', 'child', 'children',
]);

/**
 * Split a free-text scope string into discrete phrases.
 * Handles numbered-list markers ("1. Foo", "2) Bar"), markdown bullets ("- Baz", "* Baz"),
 * and plain newline-separated paragraphs. Never fabricates an element from blank input.
 * @param {string} text
 * @returns {string[]}
 */
function splitScopeText(text) {
  if (!text || typeof text !== 'string') return [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const phrases = [];
  for (const line of lines) {
    // Strip leading numbered/bulleted markers: "1.", "1)", "-", "*", "**1.**"
    const stripped = line.replace(/^[*_\s]*\d+[.)]\s*[*_]*/, '').replace(/^[-*]\s+/, '').trim();
    if (stripped.length > 0) phrases.push(stripped);
  }
  // Fallback: no line-level structure found (single-paragraph free text) — treat as one phrase.
  if (phrases.length === 0 && text.trim().length > 0) phrases.push(text.trim());
  return phrases;
}

/**
 * Normalize an SD success_criteria/success_metrics array entry to a plain string.
 * Handles string entries and the {criterion,measure} / {description,title} object shapes
 * used elsewhere in the codebase (scope-audit.js's same fallback chain).
 * @param {*} entry
 * @returns {string}
 */
function normalizeCriterionEntry(entry) {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object') {
    return entry.criterion || entry.criteria || entry.description || entry.title || '';
  }
  return '';
}

/**
 * PURE: parse an SD's declared scope + success_criteria into discrete, checkable elements.
 * Returns an empty array (never a fabricated element) when both fields are blank/unparseable.
 * @param {object} sd - SD row with .scope (string) and/or .success_criteria (array)
 * @returns {Array<{element: string, source: 'scope'|'success_criteria'}>}
 */
export function extractScopeElements(sd) {
  if (!sd || typeof sd !== 'object') return [];
  const elements = [];

  for (const phrase of splitScopeText(sd.scope)) {
    elements.push({ element: phrase, source: 'scope' });
  }

  if (Array.isArray(sd.success_criteria)) {
    for (const entry of sd.success_criteria) {
      const text = normalizeCriterionEntry(entry).trim();
      if (text.length > 0) elements.push({ element: text, source: 'success_criteria' });
    }
  }

  return elements;
}

/**
 * Extract lowercase keywords (length > MIN_KEYWORD_LENGTH, stopwords removed) from text.
 * @param {string} text
 * @returns {string[]}
 */
function extractKeywords(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > MIN_KEYWORD_LENGTH && !STOPWORDS.has(w));
}

/**
 * Build the searchable text blob for a single child (title + scope + scope_slice).
 * @param {object} child
 * @returns {string}
 */
function childSearchText(child) {
  if (!child) return '';
  const parts = [child.title || '', child.scope || ''];
  if (child.scope_slice && typeof child.scope_slice === 'object') {
    if (Array.isArray(child.scope_slice.stages)) parts.push(child.scope_slice.stages.join(' '));
    if (Array.isArray(child.scope_slice.deliverable_globs)) parts.push(child.scope_slice.deliverable_globs.join(' '));
  }
  return parts.filter(Boolean).join(' ');
}

/**
 * Same substring/word-overlap heuristic already proven in
 * scripts/modules/handoff/executors/plan-to-lead/gates/child-scope-coverage.js
 * (lines 88-101) — reused verbatim rather than inventing a new fuzzy matcher.
 * @param {string} elementText
 * @param {string} childText (already lowercased)
 * @returns {boolean}
 */
function isElementCoveredByChildText(elementText, childText) {
  const el = elementText.toLowerCase();
  if (childText.includes(el) || el.includes(childText)) return true;
  const keywords = extractKeywords(elementText);
  return keywords.some((word) => childText.includes(word));
}

/**
 * PURE: compute scope-coverage of a parent's declared scope/success_criteria against its
 * current children set. Never throws. Advisory-only — callers decide how to act on an
 * incomplete result (warn, flag, ignore); this function performs no side effects.
 * @param {object} sd - parent SD row (.scope, .success_criteria)
 * @param {Array<object>} children - child SD rows (.title, .scope, .scope_slice, .sd_key)
 * @returns {{elements: Array<{element:string, source:string, covered:boolean, coveringChildren:string[]}>,
 *            coverage_pct: number, computed_at: string}}
 */
export function computeScopeCoverage(sd, children) {
  const elements = extractScopeElements(sd);
  const childList = Array.isArray(children) ? children : [];
  const childTexts = childList.map((c) => ({ sd_key: c?.sd_key || null, text: childSearchText(c).toLowerCase() }));

  const scored = elements.map(({ element, source }) => {
    const coveringChildren = childTexts
      .filter(({ text }) => text.length > 0 && isElementCoveredByChildText(element, text))
      .map(({ sd_key }) => sd_key)
      .filter(Boolean);
    return { element, source, covered: coveringChildren.length > 0, coveringChildren };
  });

  const coveredCount = scored.filter((s) => s.covered).length;
  const coverage_pct = scored.length === 0 ? 100 : Math.round((coveredCount / scored.length) * 100);

  return {
    elements: scored,
    coverage_pct,
    computed_at: new Date().toISOString(),
  };
}

export default { extractScopeElements, computeScopeCoverage };
