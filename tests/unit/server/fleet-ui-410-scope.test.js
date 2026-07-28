/**
 * QF-20260728-458 — the retired /fleet-ui session view must be blocked on EVERY spelling of the
 * path, not on an enumerated list of them.
 *
 * >>> THAT HEADLINE IS NOT TRUE TODAY. READ THE "KNOWN-OPEN" BLOCK AT THE BOTTOM OF THIS FILE
 * >>> BEFORE TRUSTING ANY GREEN RUN. NTFS 8.3 short names (FLEET-~1.HTM, SESSIO~1.HTM) serve BOTH
 * >>> retired pages verbatim while every test here passes. 8.3 is a filesystem ALIAS resolved
 * >>> below the path string, so no normaliser can close it — the fix is structural. Measured and
 * >>> reproduced three times; raised separately. Bounded here (SD-LEO-FIX-UNOWNED-PARENT-SLICE-001)
 * >>> because a green UNIVERSAL claim is worse than no claim, and this one has now been falsified
 * >>> a fourth time by an axis the design said could not exist.
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
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const FLEET_UI_ROOT_FOR_HASH = path.join(process.cwd(), 'server', 'public', 'fleet-ui');
import {
  installFleetUiSurface,
  isRetiredFleetPanel,
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
 *
 * SCOPE CORRECTION (SD-LEO-FIX-UNOWNED-PARENT-SLICE-001): "already closed" holds only for axes
 * that are SPELLINGS OF THE PATH STRING, which is all this list contains. It does NOT hold
 * generally — NTFS 8.3 aliases resolve BELOW the string and defeat the fence today (see the
 * KNOWN-OPEN block at the bottom). The design premise was not wrong so much as
 * mis-scoped: normalisation terminates the spelling axis; it never addressed the aliasing axis.
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
 *
 * TRACKED IS NOT DEPLOYED — a correction worth keeping, because I got it wrong in both directions
 * on the same day. The DEPLOYED mount serves 13 files; git tracks 8. vision.html, mockup.html and
 * two icons exist and serve 200 in production but are UNTRACKED, so they are absent from a fresh
 * worktree. I listed a worktree, found no vision.html, and concluded "that file does not exist" —
 * generalising from a sample selected by a mechanism (git tracking) correlated with exactly what I
 * was measuring. The original defect was real: the behavioural control WAS vacuous where it runs,
 * because in CI the derived live-file population is n=1. Both halves matter — the control is weak
 * in CI, and the mount is richer in production than any test here can see.
 */
const MUST_PASS_THROUGH = [
  // NB these two are RETIRED as of SD-LEO-FIX-UNOWNED-PARENT-SLICE-001 — but by the FLEET-PANEL
  // matcher, not this one. They stay here because what they pin is cross-matcher scope: the
  // session-view matcher must not claim them. Relabelled rather than duplicated: a path carrying
  // both a green "passes through" and a green "is retired" lets a reader trust whichever they
  // read first, so the label has to say WHICH matcher it is about.
  ['/fleet-ui/fleet-panel.html', 'retired by the fleet-panel matcher — the session-view matcher must NOT claim it'],
  ['/FLEET-UI/FLEET-PANEL.HTML', 'same, upper — case-folding must not widen THIS match across files'],
  ['/fleet-ui/vision.html', 'sibling page, live'],
  ['/fleet-ui/fleet-panel-format.js', 'sibling asset, live — see the fleet-panel scope pins'],
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

/**
 * SD-LEO-FIX-UNOWNED-PARENT-SLICE-001 — the fleet panel is retired on the SAME mount.
 *
 * Reuses the session view's axis list verbatim rather than inventing a fresh one: these are the
 * spellings MEASURED to defeat this guard three times, and a second retirement on the same mount
 * gets them for free only if it is asserted for them explicitly.
 */
const FLEET_PANEL_AXES = [
  ['lowercase', ['/fleet-ui/fleet-panel.html', '/fleet-ui/fleet-panel.js', '/fleet-ui/fleet-panel.css']],
  ['filename case', ['/fleet-ui/Fleet-Panel.html', '/fleet-ui/FLEET-PANEL.HTML']],
  ['directory case', ['/FLEET-UI/fleet-panel.html', '/Fleet-UI/fleet-panel.html']],
  ['duplicate separator', ['/fleet-ui//fleet-panel.html', '//fleet-ui/fleet-panel.html']],
  ['percent-encoded', ['/fleet-ui/fleet%2Dpanel.html', '/fleet-ui/fleet%2dpanel.html', '/fleet-ui/fleet-panel%2Ehtml']],
];

/**
 * THE CANARY LIST. fleet-panel-format.js is deliberately NOT retired, and it is the reason the
 * literal dot in the matcher is load-bearing: drop the dot and this file gets swallowed while
 * every "is it retired" assertion still passes green. Keep it here permanently.
 */
const FLEET_PANEL_MUST_PASS_THROUGH = [
  ['/fleet-ui/fleet-panel-format.js', 'THE CANARY — a dot-dropped matcher swallows this first'],
  ['/fleet-ui/vision.html', 'sibling page on the same mount, live'],
  ['/fleet-ui/session-view.html', 'retired by the OTHER matcher — this one must not claim it'],
  ['/fleet-ui/fleet-panel', 'no extension — the dot is required'],
  ['/fleet-ui/sub/fleet-panel.html', 'nested — [^/] must not cross a segment'],
  ['/fleet-ui/fleet-panel-notes.html', 'longer filename sharing the prefix'],
];

describe('SD-LEO-FIX-UNOWNED-PARENT-SLICE-001: the fleet panel is retired — per axis', () => {
  it.each(FLEET_PANEL_AXES)('axis "%s": blocked/attempted === 1', (_axis, spellings) => {
    const attempted = spellings.length;
    const blocked = spellings.filter((p) => isRetiredFleetPanel(p)).length;
    expect(attempted).toBeGreaterThan(0);
    expect(`${blocked}/${attempted}`).toBe(`${attempted}/${attempted}`);
  });

  it.each(FLEET_PANEL_MUST_PASS_THROUGH)('does NOT match %s (%s)', (path) => {
    expect(isRetiredFleetPanel(path)).toBe(false);
  });
});

/**
 * THE BEHAVIOURAL BLOCK — the half that no amount of matcher testing can replace.
 *
 * Every assertion above proves a FUNCTION behaves. None of them proves the function is WIRED.
 * Before installFleetUiSurface() existed, deleting the app.use line in server/index.js left this
 * entire file green while the retired pages went back to being served — the guard's own test
 * inherited the guard's blind spot, which is the failure mode this suite's header already
 * describes for the matcher. index.js cannot be imported to check (it calls startServer() at
 * import), so the registration was extracted behind a seam and is exercised here for real:
 * same express, same static directory, real requests, real status codes.
 *
 * Ordering is EXERCISED, not asserted. Registering express.static before the guards inside
 * installFleetUiSurface turns these assertions red — no private router-stack introspection
 * (app._router) and no source-order pin, both of which break on unrelated edits.
 */
describe('SD-LEO-FIX-UNOWNED-PARENT-SLICE-001: the surface is actually mounted', () => {
  let server;
  let base;

  beforeAll(async () => {
    const app = express();
    installFleetUiSurface(app, {
      root: path.join(process.cwd(), 'server', 'public', 'fleet-ui'),
    });
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(() => server?.close());

  const RETIRED_REQUESTS = [
    ['/fleet-ui/fleet-panel.html', 'the retired panel'],
    ['/fleet-ui/fleet%2Dpanel.html', 'encoded hyphen — the axis that defeated a previous fix'],
    ['/fleet-ui/session-view.html', 'the previously retired session view, still retired'],
    ['/fleet-ui/session%2Dview.html', 'encoded, same'],
  ];

  // DERIVED FROM THE DIRECTORY, NOT INVENTED. The first draft of this control asserted
  // /fleet-ui/vision.html — a file that DOES NOT EXIST on this mount. It 404s, so it could never
  // distinguish an intact fence from a mount-wide one: a vacuous control that would have passed
  // review as a negative control. The claim came from the module header's "vision.*, session-view.*
  // and fleet-panel.* share one mount" and was propagated through the PRD without anyone listing
  // the directory. Reading the mount is what makes the control real, so read the mount.
  const FLEET_UI_ROOT = path.join(process.cwd(), 'server', 'public', 'fleet-ui');
  const RETIRED_PREFIXES = ['fleet-panel.', 'session-view.'];
  // withFileTypes: without it a SUBDIRECTORY enumerates as a file and express.static answers 301,
  // producing a red test that looks like a fence bug and invites loosening the assertion.
  const LIVE_FILES = fs.readdirSync(FLEET_UI_ROOT, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => d.name)
    .filter((f) => !RETIRED_PREFIXES.some((p) => f.toLowerCase().startsWith(p)));

  it('the derived pass-through list is non-empty — otherwise this control proves nothing', () => {
    // A zero-length list would make the it.each below vacuously green, which is exactly the
    // failure the vision.html draft had.
    expect(LIVE_FILES.length).toBeGreaterThan(0);
  });

  it.each(LIVE_FILES.map((f) => [f]))('GET /fleet-ui/%s still returns 200', async (file) => {
    const res = await fetch(`${base}/fleet-ui/${file}`, { redirect: 'manual' });
    expect(res.status).toBe(200);
  });

  it.each(RETIRED_REQUESTS)('GET %s returns 410 (%s)', async (p) => {
    const res = await fetch(base + p, { redirect: 'manual' });
    expect(res.status).toBe(410);
  });

  it('the panel 410 names where the capability actually lives', async () => {
    // A 410 that does not say where to go is a dead end. The operator needs the replacement
    // surface, not just a refusal.
    const res = await fetch(base + '/fleet-ui/fleet-panel.html');
    expect(await res.text()).toContain('/builder/sessions');
  });

  it('HEAD is fenced too, not just GET', async () => {
    // The guard is method-agnostic middleware; a route-scoped fix could easily miss this.
    const res = await fetch(base + '/fleet-ui/fleet-panel.html', { method: 'HEAD' });
    expect(res.status).toBe(410);
  });

  it('a 410 emits the soak log line — QF-20260727-484 says silence IS the evidence', async () => {
    // That console.log is LOAD-BEARING and was unpinned: deleting it left the suite fully green
    // while destroying the disposition mechanism for BOTH retirements, and renaming the tag
    // silently breaks the one documented reader (grep fleet-ui-410 .logs/engineer-*.log).
    // A routine "drop console.log from middleware" cleanup would have shipped green.
    const seen = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...a) => seen.push(a.join(' ')));
    try {
      await fetch(base + '/fleet-ui/fleet-panel.html');
    } finally {
      spy.mockRestore();
    }
    expect(seen.join('\n')).toContain('[fleet-ui-410]');
  });
});

/**
 * KNOWN-OPEN AXIS — NTFS 8.3 SHORT NAMES DEFEAT BOTH RETIREMENTS. Do not delete these tests to
 * make the suite look better; they are the honest half of it.
 *
 * MEASURED, reproduced independently three times (two sub-agents plus a direct check), against
 * both this app and the running server on 127.0.0.1:3000:
 *
 *   GET /fleet-ui/fleet-panel.html   410     the canonical spelling
 *   GET /fleet-ui/FLEET-~1.HTM       200     THE SAME FILE, sha256-identical to the on-disk bytes
 *   GET /fleet-ui/SESSIO~1.HTM       200     ditto, for the ALREADY-SHIPPED session-view retirement
 *
 * It is BROWSER-REACHABLE: the WHATWG URL parser leaves that pathname untouched, so a browser
 * sends it verbatim. No tooling required.
 *
 * WHY NO NORMALISER CAN CLOSE IT, and why this file must stop claiming otherwise. 8.3 is a
 * FILESYSTEM ALIAS resolved BELOW the path string, not another spelling of it. This module's
 * governing thesis — "reduce the path ONCE to the form the filesystem will actually resolve,
 * enumeration does not terminate but normalisation does" — is FALSE for this axis, and the
 * suite's own FORWARD_COVER block above claims "spellings nobody has tried yet are already
 * closed" while 68 tests pass green and the page is served. That green universal claim is worse
 * than no claim, so it is bounded here rather than left to be discovered a fourth time.
 *
 * NOT FIXED IN THIS SD, deliberately: the real fix is structural — allow-list the mount or move
 * retired files out of the served root — and it needs its own decision, because the deployed mount
 * also serves untracked files (vision.html, mockup.html, icons) that a tracked-file allow-list
 * would take down. Raised to the coordinator at high severity as its own item.
 *
 * These tests assert the bypass STILL EXISTS. When it is fixed they go red — which is the point:
 * whoever closes it is told exactly which claims they may now restore.
 */
describe('KNOWN-OPEN: NTFS 8.3 aliases bypass the fence (asserted as OPEN, not as fixed)', () => {
  let server;
  let base;

  beforeAll(async () => {
    const app = express();
    installFleetUiSurface(app, {
      root: path.join(process.cwd(), 'server', 'public', 'fleet-ui'),
    });
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(() => server?.close());

  it('the matcher does not see the 8.3 alias — a string normaliser structurally cannot', () => {
    expect(isRetiredFleetPanel('/fleet-ui/FLEET-~1.HTM')).toBe(false);
    expect(isRetiredSessionView('/fleet-ui/SESSIO~1.HTM')).toBe(false);
  });

  it('DOCUMENTS THE GAP: the 8.3 alias still serves the retired page (410 canonically, 200 aliased)', async () => {
    // Guard first: on a volume with 8dot3 disabled the alias 404s and this axis is moot there.
    // Skipping on 404 keeps the test honest rather than red for the wrong reason.
    const aliased = await fetch(`${base}/fleet-ui/FLEET-~1.HTM`, { redirect: 'manual' });
    if (aliased.status === 404) return;   // 8dot3 disabled on this volume — nothing to document

    const canonical = await fetch(`${base}/fleet-ui/fleet-panel.html`, { redirect: 'manual' });
    expect(canonical.status).toBe(410);
    expect(aliased.status).toBe(200);

    // PAYLOAD, not proxy: a 200 alone could be an error page. Compare the bytes.
    const served = crypto.createHash('sha256')
      .update(Buffer.from(await aliased.arrayBuffer())).digest('hex');
    const onDisk = crypto.createHash('sha256')
      .update(fs.readFileSync(path.join(FLEET_UI_ROOT_FOR_HASH, 'fleet-panel.html'))).digest('hex');
    expect(served).toBe(onDisk);
  });

  it('DOCUMENTS THE GAP: the bypass emits NO soak log line, so silence cannot mean unhit', async () => {
    const aliased0 = await fetch(`${base}/fleet-ui/FLEET-~1.HTM`, { redirect: 'manual' });
    if (aliased0.status === 404) return;

    const seen = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...a) => seen.push(a.join(' ')));
    try {
      await fetch(`${base}/fleet-ui/FLEET-~1.HTM`);
    } finally {
      spy.mockRestore();
    }
    // This is the compounding failure: the soak's disposition is "silence is the evidence", and
    // the one axis that defeats the fence is exactly the axis the instrument cannot see.
    expect(seen.join('\n')).not.toContain('[fleet-ui-410]');
  });
});
