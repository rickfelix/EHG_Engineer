/**
 * QF-20260728-458 — the retired /fleet-ui session view must be blocked on EVERY spelling of the
 * path, not on an enumerated list of them.
 *
 * WHY THIS FILE EXISTS, and why it has now been rewritten twice. The matcher has been circumvented
 * three times, each by a spelling the previous fix did not enumerate:
 *   v1  exact literal                     → defeated by filename case, directory case, repeated separators
 *   v2  8bdb6eccd0b, added `i` and `\/+`  → defeated by percent-encoding
 *   v3  this one                          → normalise the path once, then match once
 *
 * The original suite's cases were invented from the same mental model that wrote the pattern, so
 * the proof inherited the pattern's blind spot. These cases are NOT invented — the axes below were
 * MEASURED LIVE against the running server (localhost:3000, running pre-8bdb6eccd0b) before the fix:
 *   /fleet-ui/session-view.html      410   control, the one axis that held
 *   /FLEET-UI/session-view.html      200   STILL SERVED
 *   /fleet-ui/SESSION-VIEW.HTML      200   STILL SERVED
 *   /fleet-ui//session-view.html     200   STILL SERVED
 *   /fleet-ui/session%2Dview.html    200   STILL SERVED
 *
 * ROOT CAUSE, measured rather than reasoned: Express does NOT percent-decode the pathname before
 * route matching, but express.static DOES decode before resolving on disk. The guard and the file
 * server were matching different strings. Normalising to the form static will actually resolve is
 * what makes the axis list finite.
 *
 * WHY EACH AXIS IS ASSERTED SEPARATELY, never in aggregate: an aggregate ratio over a mixed list
 * hides a wholly-failing axis behind passing ones. blocked/attempted must be 1 PER AXIS with a
 * stated denominator. A suite asserting only "the lowercase path is blocked" is INVALID — that is
 * exactly what passed while three other spellings served the page.
 *
 * The matcher is IMPORTED, never re-declared: a test that copies the pattern proves only that its
 * own copy behaves, which is precisely how the original defect passed review. Imported from
 * server/retired-routes.js rather than server/index.js because the latter calls startServer() at
 * import time, so asserting a matcher would otherwise open DB connections and bind a port.
 */
import { describe, it, expect } from 'vitest';
import {
  isRetiredSessionView,
  normalizeRequestPath,
  RETIRED_SESSION_VIEW_RE as RE,
} from '../../../server/retired-routes.js';

/**
 * The bypass axes. Each is asserted on its OWN, so a regression reopening one axis cannot be
 * masked by the other four passing.
 */
const AXES = [
  ['lowercase', [
    '/fleet-ui/session-view.html',
    '/fleet-ui/session-view.js',
    '/fleet-ui/session-view.css',
  ]],
  ['filename case', [
    '/fleet-ui/Session-View.html',
    '/fleet-ui/SESSION-VIEW.HTML',
    '/fleet-ui/Session-View.js',
  ]],
  ['directory case', [
    '/FLEET-UI/session-view.html',
    '/Fleet-UI/session-view.html',
  ]],
  ['duplicate separator', [
    '/fleet-ui//session-view.html',
    '/fleet-ui///session-view.html',
    '//fleet-ui/session-view.html',
  ]],
  ['percent-encoded', [
    '/fleet-ui/session%2Dview.html',
    '/fleet-ui/session%2dview.html',   // lowercase hex — a distinct spelling of the same byte
  ]],
];

/**
 * FORWARD COVER: axes NOT known to fail today. The point of normalising rather than enumerating is
 * that spellings nobody has tried yet are already closed. If any of these ever needs its own case
 * added to the matcher, the normalise-then-match design has failed and a fourth enumeration pass
 * has begun.
 */
const FORWARD_COVER = [
  ['encoded separator', '/fleet-ui%2Fsession-view.html'],
  ['encoded separator, lowercase hex', '/fleet-ui%2fsession-view.html'],
  ['backslash separator', '\\fleet-ui\\session-view.html'],
  ['mixed backslash and slash', '/fleet-ui\\session-view.html'],
  ['mixed case and encoding together', '/FLEET-UI/SESSION%2DVIEW.HTML'],
  ['encoded separator plus duplicate slash', '/fleet-ui%2F/session-view.html'],
];

/**
 * MUST PASS THROUGH. The retirement is FILE-scoped, not ROUTE-scoped: session-view.*,
 * fleet-panel.* and vision.* share the same /fleet-ui static mount, so an over-broad matcher takes
 * live sibling pages down. Normalising makes over-matching EASIER to do by accident, so this half
 * is pinned at least as hard as the bypasses.
 */
const MUST_PASS_THROUGH = [
  ['/fleet-ui/fleet-panel.html', 'sibling page, live'],
  ['/fleet-ui/vision.html', 'sibling page, live'],
  ['/fleet-ui/fleet-panel-format.js', 'sibling asset'],
  ['/FLEET-UI/FLEET-PANEL.HTML', 'sibling page upper — case-folding must not widen the match'],
  ['/fleet-ui/sub/session-view.html', 'nested path — [^/] must not cross a segment'],
  ['/fleet-ui//sub//session-view.html', 'nested with duplicated separators — still nested after collapse'],
  ['/fleet-ui/session-view', 'no extension — the dot is required'],
  ['/fleet-ui/session-viewXhtml', 'the dot is literal, not any-char'],
  ['/fleet-ui/session-view-notes.html', 'longer filename sharing the prefix'],
  ['/api/fleet/sessions/abc/open', 'the live EHG route family, explicitly fenced'],
  ['/fleet-ui/session%252Dview.html', 'DOUBLE-encoded — static decodes once, so this resolves a file literally named %2Dview and never reaches session-view'],
];

describe('QF-20260728-458: every spelling of the retired path is blocked — per axis', () => {
  it.each(AXES)('axis "%s": blocked/attempted === 1', (_axis, spellings) => {
    const attempted = spellings.length;
    const blocked = spellings.filter((p) => isRetiredSessionView(p)).length;
    expect(attempted).toBeGreaterThan(0);   // a zero denominator would pass vacuously
    expect(`${blocked}/${attempted}`).toBe(`${attempted}/${attempted}`);
  });

  it('the historically-failing axes are covered as DISTINCT axes, not one blob', () => {
    // Guards the SHAPE of this suite. Collapsing these into a single list would let a wholly-broken
    // axis hide behind passing siblings — which is how this guard shipped circumventable twice.
    const names = AXES.map(([n]) => n);
    for (const axis of ['lowercase', 'filename case', 'directory case', 'duplicate separator', 'percent-encoded']) {
      expect(names).toContain(axis);
    }
  });
});

describe('QF-20260728-458: forward cover — spellings nobody has tried yet', () => {
  it.each(FORWARD_COVER)('blocks %s', (_label, path) => {
    expect(isRetiredSessionView(path)).toBe(true);
  });
});

describe('QF-20260728-458: the retirement stays FILE-scoped', () => {
  it.each(MUST_PASS_THROUGH)('does NOT match %s (%s)', (path) => {
    expect(isRetiredSessionView(path)).toBe(false);
  });
});

describe('QF-20260728-458: the normaliser does the work, by construction', () => {
  // These replace the previous source-text pins on RE.flags/RE.source, which asserted the regex
  // carried `i` and `\/+` — properties this design deliberately REMOVES, because the normaliser now
  // owns case and separators. Pinning behaviour instead of spelling keeps the same regressions
  // caught without re-coupling the suite to one implementation.
  it('case-folds', () => {
    expect(normalizeRequestPath('/FLEET-UI/Session-View.HTML')).toBe('/fleet-ui/session-view.html');
  });

  it('collapses duplicate separators', () => {
    expect(normalizeRequestPath('/fleet-ui///session-view.html')).toBe('/fleet-ui/session-view.html');
  });

  it('percent-decodes — the axis that defeated the previous fix', () => {
    expect(normalizeRequestPath('/fleet-ui/session%2Dview.html')).toBe('/fleet-ui/session-view.html');
  });

  it('decodes ONCE, matching what express.static does', () => {
    // Not a loop. %252D is a request for a file literally named %2D, which static will not resolve
    // to '-', so decoding further would retire a path the file server never serves.
    expect(normalizeRequestPath('/fleet-ui/session%252Dview.html')).toBe('/fleet-ui/session%2dview.html');
  });

  it('decodes BEFORE collapsing, so the step order cannot be swapped unnoticed', () => {
    // If collapse ran before decode, %2F would still be encoded at collapse time and the '%2F/'
    // pair would survive as two separators.
    expect(normalizeRequestPath('/fleet-ui%2F/session-view.html')).toBe('/fleet-ui/session-view.html');
  });

  it('never throws on a malformed escape — a guard must not turn a weird URL into a 500', () => {
    for (const bad of ['/fleet-ui/%ZZ.html', '/fleet-ui/%', '/fleet-ui/session-view.html%']) {
      expect(() => normalizeRequestPath(bad)).not.toThrow();
      expect(() => isRetiredSessionView(bad)).not.toThrow();
    }
  });

  it('a global-flag regex would be stateful across calls — guard against that regression', () => {
    // `g` makes lastIndex persist between requests, so alternating calls silently return false and
    // Express serves the retired page every other hit.
    expect(RE.flags).not.toContain('g');
  });
});
