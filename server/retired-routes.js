/**
 * Retired-route matchers, in their own module so they can be TESTED WITHOUT BOOTING THE SERVER.
 *
 * server/index.js calls startServer() unconditionally at import time (no main-module guard), so a
 * test that imported the pattern from there would open DB connections, start chokidar watchers and
 * attempt to bind a port as a side effect of asserting a regex. That is the shape that makes a
 * guard's test flaky, and a flaky guard test is one CI-quarantine away from being no guard at all.
 *
 * QF-20260725-096.
 *
 * express is imported for installFleetUiSurface() below. It is a module import only — nothing here
 * binds a port or opens a connection, so the "testable without booting the server" property above
 * still holds.
 */
import express from 'express';

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

/**
 * The retired fleet panel — SD-LEO-FIX-UNOWNED-PARENT-SLICE-001.
 *
 * WHY IT IS RETIRED RATHER THAN FIXED. The page was served by plain express.static with no auth,
 * while every action it called is requireAuth — so all four buttons returned 401 for the page's
 * entire life. server/public/fleet-ui/fleet-panel.js:1-20 records that as a DISCLOSED, ACCEPTED
 * gap found by adversarial PR review. The obvious repair (put a credential in the page) is
 * FORBIDDEN: requireAuth's only non-bearer option is x-internal-api-key, a secret shared across
 * ~15 route groups, so soliciting it into an unauthenticated page converts any origin XSS into an
 * app-wide auth bypass — strictly worse than the 401. Removing the surface needs no credential.
 *
 * WHY NOTHING WAS PORTED FIRST. Three actions had no credentialed caller (respawn-fleet,
 * relaunch-under-profile, snapshot-manifest), but they are NOT unused capability: every live
 * consumer imports lib/fleet/spawn-control.js DIRECTLY (canary-guard.js:25, session-watchdog.js:30,
 * u4-drill-runner.js:26). The orphan is the HTTP route, not the verb. Note the usage count alone
 * proves nothing — no credentialed caller COULD exist while the only surface 401'd — so the
 * decision rests on the direct-import evidence. Re-open condition: an operator needing these from
 * a browser without CLI access. The fourth action, add-session, already works authenticated from
 * EHG (ehg/src/hooks/useFleetSessions.ts:420).
 *
 * SCOPE. Same normalise-then-match design as the session view, for the same measured reason. The
 * literal `\.` is load-bearing TWICE: it keeps the extensionless path out, and it keeps
 * fleet-panel-format.js OUT — that file stays servable on purpose as the canary for a
 * dot-dropped widening, so a matcher that starts swallowing it fails the scope pins.
 */
export const RETIRED_FLEET_PANEL_RE = /^\/fleet-ui\/fleet-panel\.[^/]*$/;

/**
 * Is this request for the retired fleet panel page?
 * @param {string} rawPath a request pathname, e.g. req.path
 */
export function isRetiredFleetPanel(rawPath) {
  return RETIRED_FLEET_PANEL_RE.test(normalizeRequestPath(rawPath));
}

/**
 * Every retirement on the /fleet-ui mount, in one table so adding the next one cannot forget the
 * guard-before-static ordering.
 */
const FLEET_UI_RETIREMENTS = Object.freeze([
  {
    name: 'session-view',
    matches: isRetiredSessionView,
    body:
      'Gone — the standalone fleet-ui session view was retired on 2026-07-27 (QF-20260725-096).\n\n' +
      'Session list: the Builder Sessions page in EHG.\n' +
      'Session detail (TTY, narration, agent-browser, takeover/hand-back): use the terminal.\n\n' +
      'This capability is knowingly unavailable from the web surface. If you needed this page,\n' +
      'that is a signal worth raising — the retirement is reversible.\n',
  },
  {
    name: 'fleet-panel',
    matches: isRetiredFleetPanel,
    body:
      'Gone — the fleet-ui panel was retired on 2026-07-28 (SD-LEO-FIX-UNOWNED-PARENT-SLICE-001).\n\n' +
      'Fleet manifest, account usage and spawn control: the Builder Sessions page in EHG\n' +
      '(/builder/sessions), which is authenticated and where these already work.\n\n' +
      'Its action buttons never worked from this page — they returned 401 for its entire life,\n' +
      'because the page was unauthenticated and the actions were not. respawn-fleet,\n' +
      'relaunch-under-profile and snapshot-manifest were NOT ported: every live consumer calls\n' +
      'lib/fleet/spawn-control.js directly. If you needed one of them FROM A BROWSER, that is the\n' +
      'stated re-open condition — say so and the port gets built.\n',
  },
]);

/**
 * Install the /fleet-ui surface: retirement guards FIRST, then the static mount.
 *
 * WHY THIS IS A FUNCTION AND NOT TWO CALLS IN index.js. The ordering IS the security property —
 * a 410 registered after express.static is shadowed, unreachable, and still looks correct in
 * review. While the registration lived inline in server/index.js it could not be tested at all,
 * because index.js calls startServer() at import time (no main-module guard), so importing it to
 * check a route would open DB connections and bind a port. Nothing therefore asserted the guard
 * was MOUNTED: deleting the app.use line left every matcher unit test green while the retired
 * page went back to being served. Behind this seam a test builds a bare express app, calls this,
 * and issues real requests — so ordering is EXERCISED rather than asserted, and registering the
 * static mount first makes the 410 assertions fail instead of quietly passing.
 *
 * The test uses the SAME express as production — a harness that supplied its own would only prove
 * that its own copy behaves, which is the mistake this module's header already warns about.
 *
 * @param {import('express').Express} app
 * @param {{ root: string }} opts  root = the fleet-ui static directory
 */
export function installFleetUiSurface(app, { root }) {
  app.use((req, res, next) => {
    const hit = FLEET_UI_RETIREMENTS.find((r) => r.matches(req.path));
    if (!hit) return next();
    // QF-20260727-484 — WITHOUT THIS LINE THE SOAK CANNOT PRODUCE EVIDENCE. These retirements are
    // dispositioned by a soak in which SILENCE IS THE EVIDENCE, but this server has no request
    // logging of any kind (no morgan — not even a dependency), so a 410 hit wrote nothing anywhere
    // and silence was GUARANTEED. The tag is unchanged so the documented reader still works:
    //   grep fleet-ui-410 .logs/engineer-*.log
    // Scoped to this handler on purpose: general request logging is a different change with a
    // different justification (volume, privacy, noise) and is NOT in scope.
    console.log(
      `[fleet-ui-410] ${new Date().toISOString()} ${hit.name} ${req.method} ${req.originalUrl} ` +
      `referer=${req.get('referer') || '-'}`
    );
    return res.status(410).type('text/plain').send(hit.body);
  });

  app.use('/fleet-ui', express.static(root));
}
