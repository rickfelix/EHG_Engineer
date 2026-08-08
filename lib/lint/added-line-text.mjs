/**
 * SD-LEO-INFRA-SWEEP-REPO-SCANNERS-001 (FR-1) — the shared convention for scanners that regex
 * ADDED-LINE TEXT from a git diff.
 *
 * ── THE DEFECT THIS EXISTS TO STOP ────────────────────────────────────────────────────────
 * A scanner that matches patterns against added-line text false-positives on its own FIXTURES and
 * worked-example COMMENTS, because a fixture or an explanation FOR a pattern-detector NECESSARILY
 * contains pattern-shaped text. The sharpest observed form: a comment written to explain a previous
 * false positive re-triggered it — the file's own explanation of the bug WAS the bug.
 *
 * ── WHY THIS IS A PUBLISHED HELPER AND NOT N PATCHES ──────────────────────────────────────
 * This fix has now been derived INDEPENDENTLY TWICE and propagated to neither of its siblings:
 *   - collectSdDiff (lib/gates/operator-contract/harness-adapter.js) solved it for SQL migrations,
 *     with the note "the file that documents itself most carefully is punished hardest, which is
 *     backwards."
 *   - detectCreator (lib/gates/operator-contract/index.js) later re-derived BOTH halves for JS,
 *     writing its own version of the same explanation.
 * Meanwhile a census found SIX further diff-reading scanners under scripts/lint carrying NEITHER
 * guard, and the fixture-path regex alone appears THREE TIMES inside index.js (lines 86, 156, 242).
 * That is a contract-discoverability failure, not an arithmetic one: the fix keeps being rebuilt at
 * the point of pain and never travels. Patching the six would close the instances and guarantee a
 * seventh rediscovery, so the deliverable is this module plus a check that makes skipping it fail.
 *
 * NO I/O, NO STATE. Pure string functions, so a scanner can adopt them without a repo or a diff.
 */

/**
 * The canonical fixture/test path predicate, extracted verbatim from the three copies in
 * lib/gates/operator-contract/index.js (86, 156, 242) so behaviour is unchanged by adoption.
 *
 * @param {string} path repo-relative path
 * @returns {boolean} true when the path is test/fixture material
 */
export function isFixturePath(path) {
  return /(?:\.test\.|\.spec\.|__tests__\/|(?:^|\/)tests\/)/.test(String(path || ''));
}

/**
 * Strip comments from a slice of ADDED LINES before pattern matching.
 *
 * THE THREE STAGES ARE NOT INTERCHANGEABLE, and the middle one is the reason to extract this rather
 * than rewrite it. An added-lines slice is a FRAGMENT: it can begin partway through a JSDoc block,
 * so continuation lines arrive WITHOUT their opening delimiter. A naive
 * `replace(/\/\*[\s\S]*?\*\//g)` misses exactly those lines, which is where documentation-shaped
 * false positives concentrate. Order matters too — block comments first, so a `//` inside a block
 * is already gone before the line-comment pass runs.
 *
 * BEST-EFFORT BY DESIGN, and the tradeoff is deliberate: this can also swallow a comment-shaped
 * substring sitting inside a string literal. Both precedents accept that, because a mention inside
 * a comment is never a real occurrence, whereas over-suppression risks a FALSE NEGATIVE. That risk
 * is real, so any adopting scanner MUST keep a test proving a genuine occurrence still fires after
 * stripping — otherwise this degrades into a blanket suppressor, which is the same blind-guard
 * shape the whole SD exists to abolish.
 *
 * @param {string} text added-line text (may be a mid-block fragment)
 * @returns {string} text with comment content replaced by spaces (offsets are not preserved)
 */
export function stripComments(text) {
  return String(text || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')  // block comments (may be partial in an added-lines slice)
    .replace(/^\s*\*.*$/gm, ' ')        // continuation lines of a JSDoc block the slice cut open
    .replace(/\/\/[^\n]*/g, ' ');       // line comments — where both observed false positives came from
}

/**
 * Convenience for the common shape: skip fixture paths outright, otherwise return comment-stripped
 * text ready to match against. Returns null when the path should not be scanned at all, so a caller
 * can `if (t === null) continue;` and keep the two decisions in one place.
 *
 * @param {{path?: string, added?: string}} file
 * @returns {string|null} matchable text, or null if the path is fixture material
 */
export function scannableText(file = {}) {
  if (isFixturePath(file.path)) return null;
  return stripComments(file.added);
}
