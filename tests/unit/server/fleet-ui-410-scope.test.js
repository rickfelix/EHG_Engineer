/**
 * QF-20260725-096 (bypass fix) — scope pins for the retired /fleet-ui session-view 410.
 *
 * WHY THIS FILE EXISTS. The first version of the matcher shipped with a hand-written "proof"
 * against nine paths, every one lowercase and single-slash, because the cases were invented from
 * the same mental model that wrote the pattern. The proof therefore inherited the pattern's blind
 * spot and the guard shipped circumventable: express.static resolves through a case-INSENSITIVE
 * filesystem on the host, so `/fleet-ui/Session-View.html` was served with a 200 while the
 * case-SENSITIVE matcher never fired. Four bypasses were live against the running server.
 *
 * So these cases are NOT invented. Every entry under BYPASSES_MEASURED_LIVE was observed returning
 * 200 from the running server before the fix, and every entry under MUST_PASS_THROUGH was observed
 * returning 200 or 404 and must keep doing so.
 *
 * The regex is IMPORTED, never re-declared. A test that copies the pattern proves only that its own
 * copy behaves — which is precisely how the original defect passed review. It is imported from
 * server/retired-routes.js rather than server/index.js because the latter calls startServer() at
 * import time, so asserting a regex would otherwise open DB connections and bind a port.
 */
import { describe, it, expect } from 'vitest';
import { RETIRED_SESSION_VIEW_RE as RE } from '../../../server/retired-routes.js';

// Observed 200 against the running server BEFORE the fix. Each is a distinct bypass axis.
const BYPASSES_MEASURED_LIVE = [
  ['/fleet-ui/Session-View.html', 'filename case'],
  ['/fleet-ui/SESSION-VIEW.HTML', 'filename case, upper'],
  ['/fleet-ui/Session-View.js', 'filename case, non-html extension'],
  ['/FLEET-UI/session-view.html', 'mount-segment case'],
  ['/Fleet-UI/session-view.html', 'mount-segment mixed case'],
  ['/fleet-ui//session-view.html', 'duplicated separator'],
  ['/fleet-ui///session-view.html', 'triplicated separator'],
];

// Already 410 before the fix — must not regress.
const ALREADY_RETIRED = [
  '/fleet-ui/session-view.html',
  '/fleet-ui/session-view.js',
  '/fleet-ui/session-view.css',
  '/fleet-ui/session-view.HTML',
  '/fleet-ui/session-view.test.js',
];

// Must keep reaching the static mount (or 404) — the retirement is file-scoped, not route-scoped.
// fleet-panel and vision live under the SAME mount; matching them would take down live pages.
const MUST_PASS_THROUGH = [
  ['/fleet-ui/fleet-panel.html', 'sibling page, live'],
  ['/fleet-ui/vision.html', 'sibling page, live'],
  ['/fleet-ui/fleet-panel-format.js', 'sibling asset'],
  ['/fleet-ui/sub/session-view.html', 'nested path — [^/] must not cross a segment'],
  ['/fleet-ui/session-view', 'no extension — the dot is required'],
  ['/fleet-ui/session-viewXhtml', 'the dot is literal, not any-char'],
  ['/api/fleet/sessions/abc/open', 'the live EHG route family, explicitly fenced'],
];

describe('QF-20260725-096: retired session-view 410 scope', () => {
  it.each(BYPASSES_MEASURED_LIVE)('closes the measured bypass %s (%s)', (path) => {
    expect(RE.test(path)).toBe(true);
  });

  it.each(ALREADY_RETIRED)('keeps retiring %s', (path) => {
    expect(RE.test(path)).toBe(true);
  });

  it.each(MUST_PASS_THROUGH)('does NOT match %s (%s)', (path) => {
    expect(RE.test(path)).toBe(false);
  });

  it('is case-insensitive and slash-tolerant by construction, not by accident', () => {
    // Pin the two axes on the flags/source themselves, so a future edit that drops either one
    // fails here even if someone also edits the case list above.
    expect(RE.flags).toContain('i');
    expect(RE.source).toContain('\\/+');
  });

  it('a global-flag regex would be stateful across calls — guard against that regression', () => {
    // A `g` flag on a matcher used per-request makes lastIndex persist between requests, so
    // alternating calls would silently return false. Express would then serve the retired page.
    expect(RE.flags).not.toContain('g');
  });
});
