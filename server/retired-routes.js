/**
 * Retired-route matchers, in their own module so they can be TESTED WITHOUT BOOTING THE SERVER.
 *
 * server/index.js calls startServer() unconditionally at import time (no main-module guard), so a
 * test that imported the pattern from there would open DB connections, start chokidar watchers and
 * attempt to bind a port as a side effect of asserting a regex. That is the shape that makes a
 * guard's test flaky, and a flaky guard test is one CI-quarantine away from being no guard at all.
 *
 * QF-20260725-096.
 */

/**
 * NORMALISE, THEN MATCH — QF-20260728-458.
 *
 * THE ROOT CAUSE, MEASURED RATHER THAN REASONED: the guard and the file server disagree about what
 * the path IS. Express does NOT percent-decode the pathname before route matching, while
 * express.static DOES decode before resolving on the filesystem. So `/fleet-ui/session%2Dview.html`
 * reached the guard as the literal `session%2Dview.html` (no match) and reached the static mount as
 * `session-view.html` (served, 200). Verified live against the running server: that path returned
 * 200 while the exact-literal control returned 410.
 *
 * WHY THIS IS A NORMALISER AND NOT A FOURTH LITERAL. This is the THIRD iteration of the same shape
 * on this one guard. v1 was case-sensitive and single-slash; v2 (8bdb6eccd0b) added `i` and `\/+`
 * for casing and repeated separators; percent-encoding survived it. A fourth spelling — mixed-case
 * hex, backslash, double-encoding — would survive a fourth pass the same way. Enumeration does not
 * terminate. Normalisation does: reduce the path ONCE to the form the filesystem will actually
 * resolve, then match a single exact pattern against that.
 *
 * SINGLE DECODE, DELIBERATELY, NOT A LOOP. The normaliser must model what express.static does, and
 * static decodes exactly once. Decoding repeatedly would over-normalise: `%252Dview` is a request
 * for a file literally named `%2Dview`, which static will NOT resolve to `-view`, so collapsing it
 * would retire a path the file server never serves. Matching static's behaviour beats matching
 * every conceivable spelling.
 *
 * STILL FILE-SCOPED, NOT ROUTE-SCOPED — the original and still-correct design. session-view.*,
 * fleet-panel.* and vision.* share the SAME /fleet-ui static mount, so anything looser retires live
 * sibling pages. `[^/]*` cannot cross a segment boundary, so nested /fleet-ui/sub/session-view.html
 * is deliberately NOT matched, and the literal `\.` means extensionless /fleet-ui/session-view is
 * not matched either.
 *
 * NO `g` FLAG, deliberately: a global regex carries lastIndex between calls, so a per-request
 * matcher would alternate true/false and silently serve the retired page every other hit.
 */

/**
 * Reduce a request path to the form the static file server will actually resolve.
 *
 * Order matters: decode first (so an encoded separator becomes a real one and is then collapsed),
 * then unify separators, then collapse, then case-fold.
 *
 * @param {string} rawPath a request pathname, e.g. req.path
 * @returns {string} the normalised path
 */
export function normalizeRequestPath(rawPath) {
  let p = String(rawPath ?? '');
  try {
    p = decodeURIComponent(p);
  } catch {
    // A malformed escape (`%ZZ`, a lone `%`) throws. Keep the raw form and carry on: a guard must
    // never turn a weird URL into a 500. An undecodable path also cannot be decoded by static, so
    // the raw form is exactly what static will see — the fallback is correct, not merely safe.
  }
  return p
    .replace(/\\/g, '/')      // Windows resolves \ and / alike, so the guard must too
    .replace(/\/{2,}/g, '/')  // collapse duplicate separators
    .toLowerCase();           // the host filesystem is case-insensitive; the matcher must be too
}

/**
 * The retired path, expressed ONCE against the normalised form. Exported so the scope pins can
 * assert the pattern itself, but callers should prefer isRetiredSessionView().
 */
export const RETIRED_SESSION_VIEW_RE = /^\/fleet-ui\/session-view\.[^/]*$/;

/**
 * Is this request for the retired standalone session view?
 * @param {string} rawPath a request pathname, e.g. req.path
 */
export function isRetiredSessionView(rawPath) {
  return RETIRED_SESSION_VIEW_RE.test(normalizeRequestPath(rawPath));
}
