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
 * The standalone /fleet-ui session view, retired 2026-07-27 (chairman-ratified).
 *
 * TWO AXES, both learned the hard way — the first version of this matcher was circumventable and
 * shipped that way. It read `/^\/fleet-ui\/session-view\.[^/]*$/`:
 *
 *   CASE — express.static resolves through a case-INSENSITIVE filesystem on the host, so it served
 *   /fleet-ui/Session-View.html, /fleet-ui/SESSION-VIEW.HTML, /FLEET-UI/session-view.html and
 *   /Fleet-UI/session-view.html with a 200 while the case-SENSITIVE matcher never fired.
 *
 *   SEPARATORS — anchoring on exactly one slash let /fleet-ui//session-view.html and
 *   /fleet-ui///session-view.html through untouched.
 *
 * All of the above were measured returning 200 against the running server. Hence `i` and `\/+`.
 *
 * STILL FILE-SCOPED, NOT ROUTE-SCOPED, which is the original and still-correct design: session-view.*,
 * fleet-panel.* and vision.* share the SAME /fleet-ui static mount, so anything looser than this
 * would retire live sibling pages too. `[^/]*` cannot cross a segment boundary, so a nested
 * /fleet-ui/sub/session-view.html is deliberately NOT matched, and the literal `\.` means an
 * extensionless /fleet-ui/session-view is not matched either.
 *
 * NO `g` FLAG, deliberately: a global regex carries lastIndex between calls, so a per-request
 * matcher would alternate true/false and silently serve the retired page every other hit.
 */
export const RETIRED_SESSION_VIEW_RE = /^\/+fleet-ui\/+session-view\.[^/]*$/i;
