/**
 * Unit tests for lib/apa/venture-step-executors.js.
 *
 * SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001 FR-2.
 *
 * @module tests/unit/apa/venture-step-executors.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  registerVenture,
  getVentureRegistration,
  getTestCredential,
  buildStepExecutor,
} from '../../../lib/apa/venture-step-executors.js';

function makeMockPage({ locatorCounts = {}, gotoResponses = {}, waitForVisible = {}, currentUrl = 'http://fixture/current', clickNavigations = {} } = {}) {
  const calls = { goto: [], fill: [], click: [] };
  let url = currentUrl;
  return {
    calls,
    async goto(gotoUrl) {
      calls.goto.push(gotoUrl);
      const configured = gotoResponses[gotoUrl];
      if (configured === undefined) return { status: () => 200 };
      return configured;
    },
    locator(selector) {
      const count = Object.prototype.hasOwnProperty.call(locatorCounts, selector) ? locatorCounts[selector] : 0;
      // waitForVisible defaults to count>0 so existing count-only fixtures behave unchanged.
      // Set it explicitly, independent of count, to simulate a real Playwright waitFor()
      // finding an element that an instant, non-waiting count() snapshot would have missed
      // (SEC-001 regression coverage).
      const visible = Object.prototype.hasOwnProperty.call(waitForVisible, selector) ? waitForVisible[selector] : count > 0;
      const locator = {
        count: async () => count,
        click: async () => { calls.click.push(selector); },
        waitFor: async ({ state } = {}) => {
          if (state === 'visible' && visible) return;
          throw new Error(`waitFor timeout: "${selector}" not ${state}`);
        },
        // .first() scopes to a single node in real Playwright (avoiding a strict-mode
        // violation on a multi-match locator) -- for this fixture it's a same-shape no-op.
        first() { return locator; },
      };
      return locator;
    },
    async fill(selector, value) { calls.fill.push([selector, value]); },
    // clickNavigations lets a fixture simulate a click causing real navigation (e.g. an
    // "Continue" selector that matches more than one button, actually hitting "Continue with Google" and redirecting
    // off-origin) -- the post-click url() call then reflects the new location, matching real
    // Playwright behavior where url() always reads the page's current location.
    async click(selector) {
      calls.click.push(selector);
      if (Object.prototype.hasOwnProperty.call(clickNavigations, selector)) {
        url = clickNavigations[selector];
      }
    },
    url: () => url,
  };
}

describe('getTestCredential()', () => {
  const ENV_KEY = 'VENTURE_UAT_TEST_ACCOUNT_TESTVENTURE';
  afterEach(() => { delete process.env[ENV_KEY]; });

  it('returns null when unset', () => {
    expect(getTestCredential('TESTVENTURE')).toBeNull();
  });

  it('returns null on malformed JSON rather than throwing', () => {
    process.env[ENV_KEY] = '{not json';
    expect(getTestCredential('TESTVENTURE')).toBeNull();
  });

  it('returns null when email/password are missing', () => {
    process.env[ENV_KEY] = JSON.stringify({ email: 'x@example.com' });
    expect(getTestCredential('TESTVENTURE')).toBeNull();
  });

  it('parses a well-formed credential', () => {
    process.env[ENV_KEY] = JSON.stringify({ email: 'x@example.com', password: 'secret' });
    expect(getTestCredential('TESTVENTURE')).toEqual({ email: 'x@example.com', password: 'secret' });
  });

  it('is case-insensitive on ventureKey', () => {
    process.env[ENV_KEY] = JSON.stringify({ email: 'x@example.com', password: 'secret' });
    expect(getTestCredential('testventure')).toEqual({ email: 'x@example.com', password: 'secret' });
  });

  it('defaults to personaType "existing" when omitted', () => {
    process.env[ENV_KEY] = JSON.stringify({ email: 'x@example.com', password: 'secret' });
    expect(getTestCredential('TESTVENTURE')).toEqual(getTestCredential('TESTVENTURE', 'existing'));
  });
});

describe('getTestCredential() — dual persona (M2, Solomon/Oracle completeness finding)', () => {
  const BASE = 'VENTURE_UAT_TEST_ACCOUNT_PERSONATEST';
  afterEach(() => {
    delete process.env[BASE];
    delete process.env[`${BASE}_EXISTING`];
    delete process.env[`${BASE}_FRESH`];
  });

  it('reads the _EXISTING-suffixed var for personaType "existing"', () => {
    process.env[`${BASE}_EXISTING`] = JSON.stringify({ email: 'existing@example.com', password: 'pw1' });
    expect(getTestCredential('PERSONATEST', 'existing')).toEqual({ email: 'existing@example.com', password: 'pw1' });
  });

  it('reads the _FRESH-suffixed var for personaType "fresh"', () => {
    process.env[`${BASE}_FRESH`] = JSON.stringify({ email: 'fresh@example.com', password: 'pw2' });
    expect(getTestCredential('PERSONATEST', 'fresh')).toEqual({ email: 'fresh@example.com', password: 'pw2' });
  });

  it('the two persona slots are independent — setting one does not satisfy the other', () => {
    process.env[`${BASE}_EXISTING`] = JSON.stringify({ email: 'existing@example.com', password: 'pw1' });
    expect(getTestCredential('PERSONATEST', 'fresh')).toBeNull();
  });

  it('falls back to the un-suffixed var when the typed var is unset (backward compatible)', () => {
    process.env[BASE] = JSON.stringify({ email: 'legacy@example.com', password: 'pw3' });
    expect(getTestCredential('PERSONATEST', 'existing')).toEqual({ email: 'legacy@example.com', password: 'pw3' });
    expect(getTestCredential('PERSONATEST', 'fresh')).toEqual({ email: 'legacy@example.com', password: 'pw3' });
  });

  it('prefers the typed var over the un-suffixed fallback when both are set', () => {
    process.env[BASE] = JSON.stringify({ email: 'legacy@example.com', password: 'pw3' });
    process.env[`${BASE}_EXISTING`] = JSON.stringify({ email: 'existing@example.com', password: 'pw1' });
    expect(getTestCredential('PERSONATEST', 'existing')).toEqual({ email: 'existing@example.com', password: 'pw1' });
  });
});

describe('getVentureRegistration()', () => {
  it('returns an empty-but-shaped default for an unregistered venture', () => {
    expect(getVentureRegistration('NOT-REGISTERED-XYZ')).toEqual({ preflightChecks: [], stepOverrides: {} });
  });

  it('returns the registered venture config, case-insensitively', () => {
    registerVenture('CaseTest', { preflightChecks: [{ name: 'x', run: async () => ({}) }], stepOverrides: {} });
    expect(getVentureRegistration('casetest').preflightChecks).toHaveLength(1);
  });
});

describe('buildStepExecutor() fallback — no registered override', () => {
  const step = { step_id: 'stp-abc123-do-a-thing', goal: 'do a thing' };
  const ENV_KEY = 'VENTURE_UAT_TEST_ACCOUNT_FALLBACKVENTURE';
  afterEach(() => { delete process.env[ENV_KEY]; });

  it('reports "auth required" honestly when no test credential is configured — never attempts registration', async () => {
    const executor = buildStepExecutor(step, 'FALLBACKVENTURE');
    const page = makeMockPage();

    await expect(executor(page, {}, { baseUrl: 'http://fixture', authenticated: false }))
      .rejects.toThrow(/auth required.*no existing test credential configured/i);
    // Never navigated anywhere in pursuit of registering an account.
    expect(page.calls.goto).toHaveLength(0);
    expect(page.calls.fill).toHaveLength(0);
  });

  it('signs in (never registers) when a credential is configured, then honestly reports no verified UI mapping', async () => {
    process.env[ENV_KEY] = JSON.stringify({ email: 'tester@example.com', password: 'pw' });
    const executor = buildStepExecutor(step, 'FALLBACKVENTURE');
    const page = makeMockPage({ locatorCounts: { 'text=Already have an account? Sign in': 1 } });

    await expect(executor(page, {}, { baseUrl: 'http://fixture', authenticated: false }))
      .rejects.toThrow(/authenticated, but no verified UI mapping/i);

    expect(page.calls.goto).toEqual(['http://fixture/register']);
    expect(page.calls.click).toContain('text=Already have an account? Sign in');
    expect(page.calls.fill).toContainEqual(['input[name="emailAddress"], input[type="email"]', 'tester@example.com']);
    expect(page.calls.fill).toContainEqual(['input[name="password"], input[type="password"]', 'pw']);
  });

  it('does not re-attempt auth when ctx.authenticated is already true', async () => {
    const executor = buildStepExecutor(step, 'FALLBACKVENTURE');
    const page = makeMockPage();

    await expect(executor(page, {}, { baseUrl: 'http://fixture', authenticated: true }))
      .rejects.toThrow(/no verified UI mapping/i);
    expect(page.calls.goto).toHaveLength(0);
  });
});

describe('buildStepExecutor() fallback — persona.type selects the credential slot (M2)', () => {
  const step = { step_id: 'stp-abc123-do-a-thing', goal: 'do a thing' };
  const EXISTING_KEY = 'VENTURE_UAT_TEST_ACCOUNT_PERSONAVENTURE_EXISTING';
  const FRESH_KEY = 'VENTURE_UAT_TEST_ACCOUNT_PERSONAVENTURE_FRESH';
  afterEach(() => {
    delete process.env[EXISTING_KEY];
    delete process.env[FRESH_KEY];
  });

  it('persona.type "existing" signs in with the _EXISTING credential', async () => {
    process.env[EXISTING_KEY] = JSON.stringify({ email: 'existing@example.com', password: 'pw1' });
    const executor = buildStepExecutor(step, 'PERSONAVENTURE');
    const page = makeMockPage({ locatorCounts: { 'text=Already have an account? Sign in': 1 } });

    await expect(executor(page, { type: 'existing' }, { baseUrl: 'http://fixture', authenticated: false }))
      .rejects.toThrow(/authenticated, but no verified UI mapping/i);
    expect(page.calls.fill).toContainEqual(['input[name="emailAddress"], input[type="email"]', 'existing@example.com']);
  });

  it('persona.type "fresh" signs in with the _FRESH credential, not the _EXISTING one', async () => {
    process.env[EXISTING_KEY] = JSON.stringify({ email: 'existing@example.com', password: 'pw1' });
    process.env[FRESH_KEY] = JSON.stringify({ email: 'fresh@example.com', password: 'pw2' });
    const executor = buildStepExecutor(step, 'PERSONAVENTURE');
    const page = makeMockPage({ locatorCounts: { 'text=Already have an account? Sign in': 1 } });

    await expect(executor(page, { type: 'fresh' }, { baseUrl: 'http://fixture', authenticated: false }))
      .rejects.toThrow(/authenticated, but no verified UI mapping/i);
    expect(page.calls.fill).toContainEqual(['input[name="emailAddress"], input[type="email"]', 'fresh@example.com']);
    expect(page.calls.fill).not.toContainEqual(['input[name="emailAddress"], input[type="email"]', 'existing@example.com']);
  });

  it('an unrecognized persona.type value falls back to "existing" rather than throwing', async () => {
    process.env[EXISTING_KEY] = JSON.stringify({ email: 'existing@example.com', password: 'pw1' });
    const executor = buildStepExecutor(step, 'PERSONAVENTURE');
    const page = makeMockPage({ locatorCounts: { 'text=Already have an account? Sign in': 1 } });

    await expect(executor(page, { type: 'bogus' }, { baseUrl: 'http://fixture', authenticated: false }))
      .rejects.toThrow(/authenticated, but no verified UI mapping/i);
    expect(page.calls.fill).toContainEqual(['input[name="emailAddress"], input[type="email"]', 'existing@example.com']);
  });

  it('the "auth required" error names which persona type was missing', async () => {
    const executor = buildStepExecutor(step, 'PERSONAVENTURE');
    const page = makeMockPage();

    await expect(executor(page, { type: 'fresh' }, { baseUrl: 'http://fixture', authenticated: false }))
      .rejects.toThrow(/no fresh test credential configured/i);
  });
});

describe('buildStepExecutor() fallback — sign-in toggle race (SECURITY finding SEC-001)', () => {
  const step = { step_id: 'stp-abc123-do-a-thing', goal: 'do a thing' };
  const ENV_KEY = 'VENTURE_UAT_TEST_ACCOUNT_RACEVENTURE_EXISTING';
  const TOGGLE = 'text=Already have an account? Sign in';
  afterEach(() => { delete process.env[ENV_KEY]; });

  it('clicks the sign-in toggle when it is slow to mount (count()=0) but genuinely present (waitFor succeeds) -- proves the fix does not race a real Playwright load', async () => {
    process.env[ENV_KEY] = JSON.stringify({ email: 'tester@example.com', password: 'pw' });
    const executor = buildStepExecutor(step, 'RACEVENTURE');
    // count() says "not there yet" (an instant snapshot before the widget mounts); waitFor()
    // says "there, once you actually wait for it" -- exactly the measured real-world gap
    // between Playwright's non-waiting count() and its waiting waitFor().
    const page = makeMockPage({ locatorCounts: { [TOGGLE]: 0 }, waitForVisible: { [TOGGLE]: true } });

    await expect(executor(page, {}, { baseUrl: 'http://fixture', authenticated: false }))
      .rejects.toThrow(/authenticated, but no verified UI mapping/i);

    expect(page.calls.click).toContain(TOGGLE);
  });

  it('regression guard: a count()-only check would have missed this and fallen through to /register -- fails if the fix reverts to count()', async () => {
    process.env[ENV_KEY] = JSON.stringify({ email: 'tester@example.com', password: 'pw' });
    const executor = buildStepExecutor(step, 'RACEVENTURE');
    const page = makeMockPage({ locatorCounts: { [TOGGLE]: 0 }, waitForVisible: { [TOGGLE]: true } });

    await expect(executor(page, {}, { baseUrl: 'http://fixture', authenticated: false }))
      .rejects.toThrow(/authenticated, but no verified UI mapping/i);

    // The bug this guards against: on a real /register page with no toggle click, fill()+click()
    // submit against the actual registration form -- a PRD-violating account-creation attempt.
    // This assertion is the one that fails under the pre-fix count()-only code.
    expect(page.calls.click).toEqual([TOGGLE, 'button:has-text("Continue")']);
  });

  it('SEC-001 residual (found by security-agent re-verification): refuses to submit credentials when the toggle is never found -- FAIL-CLOSED, not a fallthrough to fill+submit', async () => {
    process.env[ENV_KEY] = JSON.stringify({ email: 'tester@example.com', password: 'pw' });
    const executor = buildStepExecutor(step, 'RACEVENTURE');
    const page = makeMockPage({ locatorCounts: { [TOGGLE]: 0 }, waitForVisible: { [TOGGLE]: false } });

    // The first version of this fix only closed the RACE (slow-but-present toggle). It still
    // fell through to fill+submit when the toggle was never found at all -- the DEFAULT outcome
    // for any venture with different copy, i18n, a non-Clerk provider, or a genuinely
    // registration-only page. That is exactly the case where submitting is most likely to
    // create a real account, so "toggle not found" must refuse, not proceed.
    await expect(executor(page, {}, { baseUrl: 'http://fixture', authenticated: false }))
      .rejects.toThrow(/could not confirm a sign-in affordance.*refusing to submit credentials/i);

    // The bug this guards against: no credential fields ever filled, no Continue click --
    // nothing reaches a form when a sign-in surface can't be confirmed.
    expect(page.calls.click).toEqual([]);
    expect(page.calls.fill).toEqual([]);
  });

  it('SEC-003 (bundled -- same fix shape): refuses to submit the password if the page navigated away from the expected origin after clicking the toggle', async () => {
    process.env[ENV_KEY] = JSON.stringify({ email: 'tester@example.com', password: 'pw' });
    const executor = buildStepExecutor(step, 'RACEVENTURE');
    const page = makeMockPage({
      locatorCounts: { [TOGGLE]: 1 },
      currentUrl: 'http://attacker.example/phish',
    });

    await expect(executor(page, {}, { baseUrl: 'http://fixture', authenticated: false }))
      .rejects.toThrow(/refusing to submit credentials.*navigated away from expected origin/i);

    expect(page.calls.click).toEqual([TOGGLE]); // toggle clicked, but no email/password ever filled
    expect(page.calls.fill).toEqual([]);
  });

  it('same-origin, different path is accepted (the check is origin equality, not exact-URL equality)', async () => {
    process.env[ENV_KEY] = JSON.stringify({ email: 'tester@example.com', password: 'pw' });
    const executor = buildStepExecutor(step, 'RACEVENTURE');
    const page = makeMockPage({ locatorCounts: { [TOGGLE]: 1 }, currentUrl: 'http://fixture/some/other/path' });

    await expect(executor(page, {}, { baseUrl: 'http://fixture', authenticated: false }))
      .rejects.toThrow(/authenticated, but no verified UI mapping/i);

    expect(page.calls.fill).toContainEqual(['input[name="emailAddress"], input[type="email"]', 'tester@example.com']);
  });

  it('SEC-003 subdomain-prefix residual (found by a second security-agent re-verification): a host that merely STARTS WITH the expected origin is rejected, not accepted', async () => {
    process.env[ENV_KEY] = JSON.stringify({ email: 'tester@example.com', password: 'pw' });
    const executor = buildStepExecutor(step, 'RACEVENTURE');
    // startsWith() is a PREFIX match, not an origin comparison -- an origin has no
    // terminating delimiter, so "http://fixture.evil.com".startsWith("http://fixture") is
    // true. An attacker controlling the redirect target arranges exactly this by naming a
    // subdomain after the victim host. True origin equality (new URL(...).origin) must
    // reject it.
    const page = makeMockPage({ locatorCounts: { [TOGGLE]: 1 }, currentUrl: 'http://fixture.evil.com/register' });

    await expect(executor(page, {}, { baseUrl: 'http://fixture', authenticated: false }))
      .rejects.toThrow(/refusing to submit credentials.*navigated away from expected origin/i);

    expect(page.calls.fill).toEqual([]);
  });

  it('an unparseable current URL fails closed (refuses) rather than silently passing', async () => {
    process.env[ENV_KEY] = JSON.stringify({ email: 'tester@example.com', password: 'pw' });
    const executor = buildStepExecutor(step, 'RACEVENTURE');
    const page = makeMockPage({ locatorCounts: { [TOGGLE]: 1 }, currentUrl: 'not-a-valid-url' });

    await expect(executor(page, {}, { baseUrl: 'http://fixture', authenticated: false }))
      .rejects.toThrow(/could not be parsed to verify its origin/i);

    expect(page.calls.fill).toEqual([]);
  });

  it('fresh-E2E finding (2026-09-01, live run against altifyai.rickfelix2000.workers.dev): a post-submit redirect to a THIRD-PARTY origin (e.g. a "Continue" selector matching more than one button, hitting "Continue with Google") is never read as "authenticated" -- even though its path does not match the sign-in/login denylist', async () => {
    vi.useFakeTimers();
    try {
      process.env[ENV_KEY] = JSON.stringify({ email: 'tester@example.com', password: 'pw' });
      const executor = buildStepExecutor(step, 'RACEVENTURE');
      // Real repro: page.click('button:has-text("Continue")') matched "Continue with Google"
      // and landed on accounts.google.com/v3/signin/identifier -- a path that contains none of
      // NOT_YET_AUTHENTICATED_PATH_RE's tokens (sign-in/login/register/verify/factor/mfa/
      // challenge), so a path-only check reads it as authenticated. It must not: the origin is
      // not the venture's own.
      const page = makeMockPage({
        locatorCounts: { [TOGGLE]: 1 },
        currentUrl: 'http://fixture/register',
        clickNavigations: { 'button:has-text("Continue")': 'https://accounts.google.com/v3/signin/identifier?client_id=abc' },
      });

      const assertion = expect(executor(page, {}, { baseUrl: 'http://fixture', authenticated: false }))
        .rejects.toThrow(/auth required.*neither a verification-code challenge nor an authenticated-state signal/i);
      // Both 15s bounded waits (code-challenge locator, authenticated-URL poll) must exhaust
      // for the fallback executor to resolve; advance fake time past both.
      await vi.advanceTimersByTimeAsync(16000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('buildStepExecutor() — explicit stepOverrides take precedence', () => {
  it('uses the registered override instead of the generic fallback', async () => {
    const overrideFn = vi.fn(async () => ({ url: 'http://fixture/verified', renderedStateSummary: 'hand-verified step' }));
    registerVenture('OVERRIDE-TEST', { preflightChecks: [], stepOverrides: { 'stp-known': overrideFn } });

    const executor = buildStepExecutor({ step_id: 'stp-known', goal: 'known step' }, 'OVERRIDE-TEST');
    const result = await executor(makeMockPage(), {}, { baseUrl: 'http://fixture' });

    expect(overrideFn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ url: 'http://fixture/verified', renderedStateSummary: 'hand-verified step' });
  });
});

describe('buildStepExecutor() — Object.hasOwn guard against inherited step_id (SECURITY finding SEC-002)', () => {
  it('a step_id matching an Object.prototype member ("constructor") never resolves to that inherited value', async () => {
    registerVenture('PROTO-TEST', { preflightChecks: [], stepOverrides: {} });

    // Bare bracket access (`stepOverrides[step.step_id]`) on step_id="constructor" would
    // resolve to Object.prototype.constructor -- a truthy, wrong-shaped "executor" that the
    // caller (browser-executor.js's executeJourneyStep) would invoke, silently fabricating a
    // PASS with zero real navigation, feeding a false-green verdict into FR-3's PLAN-TO-LEAD
    // gate. Object.hasOwn must reject this and fall through to the honest fallback executor.
    const executor = buildStepExecutor({ step_id: 'constructor', goal: 'do a thing' }, 'PROTO-TEST');

    // The fallback executor (not the Object.prototype constructor function) is what runs --
    // proven by it producing this fallback's characteristic honest failure, not silently
    // returning success or throwing an unrelated "not a function" / "invalid step" error.
    await expect(executor(makeMockPage(), {}, { baseUrl: 'http://fixture', authenticated: false }))
      .rejects.toThrow(/auth required.*no existing test credential configured/i);
  });

  it('other inherited names ("toString", "hasOwnProperty") are equally rejected', async () => {
    registerVenture('PROTO-TEST-2', { preflightChecks: [], stepOverrides: {} });
    for (const stepId of ['toString', 'hasOwnProperty', '__proto__']) {
      const executor = buildStepExecutor({ step_id: stepId, goal: 'do a thing' }, 'PROTO-TEST-2');
      await expect(executor(makeMockPage(), {}, { baseUrl: 'http://fixture', authenticated: false }))
        .rejects.toThrow(/auth required.*no existing test credential configured/i);
    }
  });

  it('a genuinely registered override for an inherited-sounding name still works (hasOwn, not a blanket ban)', async () => {
    const overrideFn = vi.fn(async () => ({ url: 'http://fixture/verified', renderedStateSummary: 'explicitly registered' }));
    registerVenture('PROTO-TEST-3', { preflightChecks: [], stepOverrides: { toString: overrideFn } });

    const executor = buildStepExecutor({ step_id: 'toString', goal: 'explicitly overridden' }, 'PROTO-TEST-3');
    const result = await executor(makeMockPage(), {}, { baseUrl: 'http://fixture' });

    expect(overrideFn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ url: 'http://fixture/verified', renderedStateSummary: 'explicitly registered' });
  });
});

describe('ALTIFYAI registration — grounded in FR-0 live evidence', () => {
  it('registers 4 preflight checks and zero step overrides (no fine-grained selector work done yet)', () => {
    const config = getVentureRegistration('ALTIFYAI');
    expect(config.preflightChecks.map((c) => c.name)).toEqual(['land', 'signupFormRenders', 'uploadRouteReachable', 'feedbackWidget']);
    expect(config.stepOverrides).toEqual({});
  });

  it('land preflight passes when the "Start free" CTA renders', async () => {
    const { preflightChecks } = getVentureRegistration('ALTIFYAI');
    const land = preflightChecks.find((c) => c.name === 'land');
    const page = makeMockPage({ locatorCounts: { 'text=Start free': 1 } });

    const result = await land.run(page, { baseUrl: 'http://altifyai.fixture' });
    expect(result.renderedStateSummary).toMatch(/Start free/);
    expect(result.verifiedAt).toBeTruthy();
    expect(result.matchedSelector).toBe('text=Start free');
  });

  it('land preflight fails only when NEITHER the CTA nor the /register identifier field renders, and never swallows the underlying error', async () => {
    const { preflightChecks } = getVentureRegistration('ALTIFYAI');
    const land = preflightChecks.find((c) => c.name === 'land');
    const page = makeMockPage({ locatorCounts: { 'text=Start free': 0, 'input[name="identifier"]': 0 } });

    await expect(land.run(page, { baseUrl: 'http://altifyai.fixture' })).rejects.toThrow(/neither .* rendered.*last error/s);
  });

  // QF-20260901-455 AMENDED (coordinator/Solomon measured ruling): a plain 'text=Start free'
  // locator resolves TWO nodes live, so an unscoped waitFor() throws a Playwright strict-mode
  // violation -- .first() makes the call strict-safe. The combined shape's other half is
  // /register's Clerk identifier field, checked as a fallback when the CTA does not render.
  it('land preflight passes on the /register identifier field when the CTA has not rendered', async () => {
    const { preflightChecks } = getVentureRegistration('ALTIFYAI');
    const land = preflightChecks.find((c) => c.name === 'land');
    const page = makeMockPage({ locatorCounts: { 'text=Start free': 0, 'input[name="identifier"]': 1 } });

    const result = await land.run(page, { baseUrl: 'http://altifyai.fixture' });
    expect(result.matchedSelector).toBe('input[name="identifier"]');
    expect(result.renderedStateSummary).toMatch(/input\[name="identifier"\]/);
    expect(typeof result.msToMarker).toBe('number');
    expect(page.calls.goto).toContain('http://altifyai.fixture/register');
  });

  // QF-20260901-385: an immediate count()===0 would have failed here even though the element
  // genuinely renders slowly (same race class as SEC-001's sign-in toggle fix, above in this
  // file) -- waitForVisible simulates that slow-mount case independent of the count fixture.
  it('land preflight waits for a slow-to-render CTA rather than snapshotting count() immediately (SEC-001-class regression guard)', async () => {
    const { preflightChecks } = getVentureRegistration('ALTIFYAI');
    const land = preflightChecks.find((c) => c.name === 'land');
    const page = makeMockPage({ locatorCounts: { 'text=Start free': 0 }, waitForVisible: { 'text=Start free': true } });

    const result = await land.run(page, { baseUrl: 'http://altifyai.fixture' });
    expect(result.renderedStateSummary).toMatch(/Start free/);
  });

  it('signupFormRenders accepts the identifier field alongside the email selectors', async () => {
    const { preflightChecks } = getVentureRegistration('ALTIFYAI');
    const check = preflightChecks.find((c) => c.name === 'signupFormRenders');
    const page = makeMockPage({ locatorCounts: { 'input[name="emailAddress"], input[type="email"], input[name="identifier"]': 1 } });

    const result = await check.run(page, { baseUrl: 'http://altifyai.fixture' });
    expect(result.renderedStateSummary).toMatch(/Clerk/);
    expect(result.matchedSelector).toContain('identifier');
  });

  it('uploadRouteReachable passes now that /upload resolves live (QF-20260901-385: premise inverted, measured 2026-09-02)', async () => {
    const { preflightChecks } = getVentureRegistration('ALTIFYAI');
    const check = preflightChecks.find((c) => c.name === 'uploadRouteReachable');
    const page = makeMockPage({ gotoResponses: { 'http://altifyai.fixture/upload': { status: () => 200 } } });

    const result = await check.run(page, { baseUrl: 'http://altifyai.fixture' });
    expect(result.renderedStateSummary).toMatch(/upload route reachable/);
    expect(result.verifiedAt).toBeTruthy();
    expect(result.matchedSelector).toBe('http://altifyai.fixture/upload');
  });

  it('uploadRouteReachable fails loudly if the route ever goes unreachable again (regression guard)', async () => {
    const { preflightChecks } = getVentureRegistration('ALTIFYAI');
    const check = preflightChecks.find((c) => c.name === 'uploadRouteReachable');
    const page = makeMockPage({ gotoResponses: { 'http://altifyai.fixture/upload': { status: () => 404 } } });

    await expect(check.run(page, { baseUrl: 'http://altifyai.fixture' })).rejects.toThrow(/expected a reachable route/);
  });
});
