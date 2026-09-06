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
  buildClerkTestModeIdentity,
  CLERK_TEST_MODE_FIXED_CODE,
  getClerkTestingKeys,
  submitCodeStep,
  redactCodeStepText,
} from '../../../lib/apa/venture-step-executors.js';
import * as imapCodeFetcher from '../../../lib/apa/imap-code-fetcher.js';
import * as clerkTesting from '@clerk/testing/playwright';
import fs from 'node:fs';

// QF-20260902-512: neither existing test in this file ever reaches the code-challenge branch
// (none makes the code input locator visible), so this mock is inert for them -- only the new
// "auth provider test mode" describe block below exercises it.
vi.mock('../../../lib/apa/imap-code-fetcher.js', () => ({
  fetchVerificationCode: vi.fn(),
  fetchVerificationCodeDetailed: vi.fn(),
}));

// QF-20260902-935: clerkSetup performs a REAL Clerk Backend API call given a real secret key --
// never let a unit test near that. Inert for every test outside this file's own testing-token
// describe block (none else registers authProviderTesting).
vi.mock('@clerk/testing/playwright', () => ({
  clerkSetup: vi.fn(),
  setupClerkTestingToken: vi.fn(),
}));

function makeMockPage({ locatorCounts = {}, gotoResponses = {}, waitForVisible = {}, waitForVisibleSequence = {}, currentUrl = 'http://fixture/current', clickNavigations = {}, clickNavigationsSequence = {}, buttonTexts = ['Continue'], bodyText = '', codeFormButtons = null, hasCodeForm = true, codeInputCompletes = true, fillNavigations = {}, locatorTexts = {}, visibleSequence = {}, setInputFilesError = null } = {}) {
  const calls = { goto: [], fill: [], click: [] };
  let url = currentUrl;
  // QF-20260902-614: getByRole('button', ...) is called fresh at each of the source module's
  // 3 submit points (sign-in, sign-up, verify) -- a per-matchedText count here (not a
  // per-locator-instance one) lets clickNavigationsSequence answer differently per submit.
  const clickCallCounts = {};
  // QF-20260902-952: shared by both the named getByRole(button, {name}) locator below AND the
  // role-only button roster (submitCodeStep's code-form scan) so a click on either path
  // advances the SAME clickNavigationsSequence index, in physical call order.
  function clickButtonByText(matchedText) {
    calls.click.push(matchedText ?? '<no-match>');
    if (matchedText !== undefined) {
      const seq = clickNavigationsSequence[matchedText];
      if (seq) {
        const idx = clickCallCounts[matchedText] || 0;
        clickCallCounts[matchedText] = idx + 1;
        const dest = seq[Math.min(idx, seq.length - 1)];
        if (dest !== undefined) url = dest;
      } else if (Object.prototype.hasOwnProperty.call(clickNavigations, matchedText)) {
        url = clickNavigations[matchedText];
      }
    }
  }
  // QF-20260902-952: the button roster submitCodeStep's role-only getByRole('button') scan
  // sees -- defaults to buttonTexts (visible+enabled) so a fixture that never sets this new
  // option behaves exactly as it did before this helper existed.
  function buttonRoster() {
    return codeFormButtons ?? buttonTexts.map((t) => ({ name: t, visible: true, enabled: true }));
  }
  function makeRosterLocator() {
    const buttons = buttonRoster();
    const nth = (i) => {
      const b = buttons[i];
      return {
        textContent: async () => (b ? b.name : null),
        isVisible: async () => !!(b && b.visible),
        isEnabled: async () => !!(b && b.enabled),
        click: async () => clickButtonByText(b ? b.name : undefined),
        waitFor: async ({ state } = {}) => {
          if (state === 'visible' && b && b.visible) return;
          throw new Error(`waitFor timeout: role-only button[${i}] not ${state}`);
        },
      };
    };
    return { count: async () => buttons.length, nth, first: () => nth(0) };
  }
  return {
    calls,
    async goto(gotoUrl) {
      calls.goto.push(gotoUrl);
      const configured = gotoResponses[gotoUrl];
      if (configured === undefined) return { status: () => 200 };
      return configured;
    },
    // getByRole('button', {name}) resolves against buttonTexts IN ORDER, mirroring real
    // Playwright's DOM-order resolution -- this is the exact mechanism QF-20260902-206 depends
    // on: Clerk's live card renders "Continue with Google" before "Continue", so a caller must
    // match by EXACT name (never a substring) to land on the right button.
    // QF-20260902-952: name omitted entirely -> role-only lookup, used by submitCodeStep's
    // code-form button scan (any accessible name).
    getByRole(role, { name } = {}) {
      if (role !== 'button') throw new Error(`mock getByRole: unsupported role "${role}"`);
      if (name === undefined) return makeRosterLocator();
      const matches = (text) => (name instanceof RegExp ? name.test(text) : text === name);
      const matchedText = buttonTexts.find(matches);
      const exists = matchedText !== undefined;
      const locator = {
        click: async () => clickButtonByText(matchedText),
        textContent: async () => matchedText ?? null,
        waitFor: async ({ state } = {}) => {
          if (state === 'visible' && exists) return;
          throw new Error(`waitFor timeout: getByRole(button, ${name}) not ${state}`);
        },
        isVisible: async () => exists,
        first() { return locator; },
      };
      return locator;
    },
    locator(selector) {
      const count = Object.prototype.hasOwnProperty.call(locatorCounts, selector) ? locatorCounts[selector] : 0;
      // waitForVisible defaults to count>0 so existing count-only fixtures behave unchanged.
      // Set it explicitly, independent of count, to simulate a real Playwright waitFor()
      // finding an element that an instant, non-waiting count() snapshot would have missed
      // (SEC-001 regression coverage).
      const visible = Object.prototype.hasOwnProperty.call(waitForVisible, selector) ? waitForVisible[selector] : count > 0;
      // QF-20260902-614: the source module calls page.locator(code selector).waitFor() twice
      // against the SAME locator instance -- once on the initial sign-in, once (only on the
      // no-account recovery path) on the sign-up leg. A sequence lets a fixture answer
      // differently per call (e.g. [false, true]); falls back to the static `visible` value
      // when no sequence is configured, so every pre-existing fixture is unaffected.
      let waitForCallCount = 0;
      // QF-20260902-033: a bounded-poll override (unlike waitFor's single call) calls
      // isVisible() repeatedly across a real loop -- visibleSequence lets a fixture answer
      // differently per call (e.g. [false, false, true]), clamping to the last entry once
      // exhausted so a fixture need not enumerate every poll tick.
      let isVisibleCallCount = 0;
      const locator = {
        count: async () => count,
        click: async () => { calls.click.push(selector); },
        waitFor: async ({ state } = {}) => {
          const seq = waitForVisibleSequence[selector];
          const thisCallVisible = seq ? seq[Math.min(waitForCallCount, seq.length - 1)] : visible;
          waitForCallCount += 1;
          if (state === 'visible' && thisCallVisible) return;
          throw new Error(`waitFor timeout: "${selector}" not ${state}`);
        },
        // isVisible() is a real Playwright locator method (synchronous-outcome check, never
        // throws) -- used post-waitFor to determine WHICH alternative in a multi-selector set
        // actually matched (FR-3, resolveVisibleSelector in the source module).
        isVisible: async () => {
          const seq = visibleSequence[selector];
          if (!seq) return visible;
          const v = seq[Math.min(isVisibleCallCount, seq.length - 1)];
          isVisibleCallCount += 1;
          return v;
        },
        textContent: async () => (Object.prototype.hasOwnProperty.call(locatorTexts, selector) ? locatorTexts[selector] : null),
        setInputFiles: async () => {
          calls.click.push(`setInputFiles:${selector}`);
          if (setInputFilesError) throw new Error(setInputFilesError);
        },
        // .first() scopes to a single node in real Playwright (avoiding a strict-mode
        // violation on a multi-match locator) -- for this fixture it's a same-shape no-op.
        first() { return locator; },
        // QF-20260902-512 re-keyed STEP 1: only page.locator('body').innerText() is ever
        // called by the source module (a generic post-submit-state snapshot on the "neither"
        // auth failure) -- this fixture just echoes the configured bodyText.
        innerText: async () => bodyText,
        // QF-20260902-952: nested scoping (page.locator(codeInput).locator('xpath=ancestor::
        // form[1]')) -- hasCodeForm toggles whether a form ancestor "exists" in the fixture;
        // its role-only getByRole('button') shares the same roster as the page-wide fallback.
        locator() {
          const formCount = hasCodeForm ? 1 : 0;
          return {
            count: async () => formCount,
            getByRole(role2) {
              if (role2 !== 'button') throw new Error(`mock getByRole: unsupported role "${role2}"`);
              return makeRosterLocator();
            },
          };
        },
      };
      return locator;
    },
    async fill(selector, value) {
      calls.fill.push([selector, value]);
      // QF-20260902-952: simulates an auto-submitting control whose fill alone (no click)
      // flips the URL -- e.g. Clerk's OTP card completing on the sixth digit.
      if (Object.prototype.hasOwnProperty.call(fillNavigations, selector)) {
        url = fillNavigations[selector];
      }
    },
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
    // QF-20260902-952: submitCodeStep's DOM-completion check. codeInputCompletes=false
    // simulates the input never reporting its own completion state within the timeout.
    async waitForFunction() {
      if (codeInputCompletes) return true;
      throw new Error('waitForFunction timeout: code input never reported completion');
    },
  };
}

// QF-20260902-952: direct fixture tests for the shared code-step helper, per the ticket's own
// FIX section -- "unit tests on fixtures: button named Verify email -> clicked and passes; no
// button plus URL flip -> passes as auto-submit; no button and no flip -> fails with the
// census in the message".
describe('submitCodeStep() (QF-20260902-952)', () => {
  const CODE_INPUT = 'input[name="code"], input[autocomplete="one-time-code"]';
  const EXPECTED_ORIGIN = 'http://fixture';

  it('a button named "Verify email" within the code form is clicked and the step passes', async () => {
    vi.useFakeTimers();
    try {
      const page = makeMockPage({
        currentUrl: 'http://fixture/sign-in',
        codeFormButtons: [{ name: 'Verify email', visible: true, enabled: true }],
        clickNavigationsSequence: { 'Verify email': ['http://fixture/dashboard'] },
      });
      // The mock never auto-submits (url only flips on click), so the first auth-vs-submit
      // race must fully elapse before submitCodeStep falls back to clicking.
      const capture = submitCodeStep(page, EXPECTED_ORIGIN, '424242');
      await vi.advanceTimersByTimeAsync(16000);
      const result = await capture;
      expect(result.authenticated).toBe(true);
      expect(result.branch).toBe('clicked:Verify email');
      expect(result.clickedButtonText).toBe('Verify email');
      expect(page.calls.fill).toContainEqual([CODE_INPUT, '424242']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('no button in the code form, but the URL flips after fill -- passes as auto-submit, never clicks', async () => {
    const page = makeMockPage({
      currentUrl: 'http://fixture/sign-in',
      codeFormButtons: [],
      fillNavigations: { [CODE_INPUT]: 'http://fixture/dashboard' },
    });
    const result = await submitCodeStep(page, EXPECTED_ORIGIN, '424242');
    expect(result.authenticated).toBe(true);
    expect(result.branch).toBe('auto_submit');
    expect(result.clickedButtonText).toBeNull();
    expect(page.calls.click).toEqual([]);
  });

  it('no button and no URL flip -- fails, and the after-snapshot carries the button census', async () => {
    vi.useFakeTimers();
    try {
      const page = makeMockPage({
        currentUrl: 'http://fixture/sign-in', // never changes -- neither signal ever fires
        codeFormButtons: [],
      });
      const capture = submitCodeStep(page, EXPECTED_ORIGIN, '424242');
      await vi.advanceTimersByTimeAsync(16000);
      const result = await capture;
      expect(result.authenticated).toBe(false);
      expect(result.branch).toBe('neither');
      expect(result.snapshotAfter.buttons).toEqual([]);
      // This is exactly the payload both call sites embed in their thrown error message --
      // proving the census is genuinely available to appear in a real failure's error text.
      expect(JSON.stringify(result.snapshotAfter.buttons)).toBe('[]');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a disabled button is never clicked -- treated as "not a submit yet", not a click target', async () => {
    vi.useFakeTimers();
    try {
      const page = makeMockPage({
        currentUrl: 'http://fixture/sign-in',
        codeFormButtons: [{ name: 'Verify', visible: true, enabled: false }],
      });
      const capture = submitCodeStep(page, EXPECTED_ORIGIN, '424242');
      await vi.advanceTimersByTimeAsync(16000);
      const result = await capture;
      expect(result.authenticated).toBe(false);
      expect(result.branch).toBe('neither');
      expect(page.calls.click).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stamps a before/after snapshot with page url and the redacted page text', async () => {
    vi.useFakeTimers();
    try {
      const page = makeMockPage({
        currentUrl: 'http://fixture/sign-in',
        codeFormButtons: [{ name: 'Verify email', visible: true, enabled: true }],
        clickNavigationsSequence: { 'Verify email': ['http://fixture/dashboard'] },
        bodyText: 'Enter the code sent to tester+clerk_test@example.com',
      });
      const capture = submitCodeStep(page, EXPECTED_ORIGIN, '424242');
      await vi.advanceTimersByTimeAsync(16000);
      const result = await capture;
      expect(result.snapshotBefore.url).toBe('http://fixture/sign-in');
      expect(result.snapshotBefore.page_text).toBe('Enter the code sent to [email]');
      expect(result.snapshotAfter.url).toBe('http://fixture/dashboard');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('redactCodeStepText() (QF-20260902-952)', () => {
  it('redacts the entered code value', () => {
    expect(redactCodeStepText('your code is 424242 today', '424242')).toBe('your code is [code] today');
  });

  it('redacts an email address', () => {
    expect(redactCodeStepText('sent to tester+clerk_test@example.com', null)).toBe('sent to [email]');
  });

  it('grep-assert: never lets an sk_/pk_ key through, live or test', () => {
    const text = redactCodeStepText('leaked sk_test_abc123 and pk_live_def456 in the page', null);
    expect(text).not.toMatch(/\b(sk|pk)_(test|live)_\w+/);
    expect(text).toBe('leaked [key] and [key] in the page');
  });

  it('passes through null/empty unchanged', () => {
    expect(redactCodeStepText(null, '424242')).toBeNull();
    expect(redactCodeStepText('', '424242')).toBe('');
  });
});

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
    expect(getTestCredential('TESTVENTURE')).toEqual({ email: 'x@example.com', password: 'secret', firstName: 'UAT', lastName: 'Walker' });
  });

  it('is case-insensitive on ventureKey', () => {
    process.env[ENV_KEY] = JSON.stringify({ email: 'x@example.com', password: 'secret' });
    expect(getTestCredential('testventure')).toEqual({ email: 'x@example.com', password: 'secret', firstName: 'UAT', lastName: 'Walker' });
  });

  it('QF-20260902-093: firstName/lastName default to a fixed fenced pair, never invented per-venture', () => {
    process.env[ENV_KEY] = JSON.stringify({ email: 'x@example.com', password: 'secret' });
    const credential = getTestCredential('TESTVENTURE');
    expect(credential.firstName).toBe('UAT');
    expect(credential.lastName).toBe('Walker');
  });

  it('QF-20260902-093: an explicit firstName/lastName on the fenced profile overrides the default', () => {
    process.env[ENV_KEY] = JSON.stringify({ email: 'x@example.com', password: 'secret', firstName: 'Fenced', lastName: 'Persona' });
    expect(getTestCredential('TESTVENTURE')).toEqual({ email: 'x@example.com', password: 'secret', firstName: 'Fenced', lastName: 'Persona' });
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
    expect(getTestCredential('PERSONATEST', 'existing')).toEqual({ email: 'existing@example.com', password: 'pw1', firstName: 'UAT', lastName: 'Walker' });
  });

  it('reads the _FRESH-suffixed var for personaType "fresh"', () => {
    process.env[`${BASE}_FRESH`] = JSON.stringify({ email: 'fresh@example.com', password: 'pw2' });
    expect(getTestCredential('PERSONATEST', 'fresh')).toEqual({ email: 'fresh@example.com', password: 'pw2', firstName: 'UAT', lastName: 'Walker' });
  });

  it('the two persona slots are independent — setting one does not satisfy the other', () => {
    process.env[`${BASE}_EXISTING`] = JSON.stringify({ email: 'existing@example.com', password: 'pw1' });
    expect(getTestCredential('PERSONATEST', 'fresh')).toBeNull();
  });

  it('falls back to the un-suffixed var when the typed var is unset (backward compatible)', () => {
    process.env[BASE] = JSON.stringify({ email: 'legacy@example.com', password: 'pw3' });
    expect(getTestCredential('PERSONATEST', 'existing')).toEqual({ email: 'legacy@example.com', password: 'pw3', firstName: 'UAT', lastName: 'Walker' });
    expect(getTestCredential('PERSONATEST', 'fresh')).toEqual({ email: 'legacy@example.com', password: 'pw3', firstName: 'UAT', lastName: 'Walker' });
  });

  it('prefers the typed var over the un-suffixed fallback when both are set', () => {
    process.env[BASE] = JSON.stringify({ email: 'legacy@example.com', password: 'pw3' });
    process.env[`${BASE}_EXISTING`] = JSON.stringify({ email: 'existing@example.com', password: 'pw1' });
    expect(getTestCredential('PERSONATEST', 'existing')).toEqual({ email: 'existing@example.com', password: 'pw1', firstName: 'UAT', lastName: 'Walker' });
  });
});

describe('getVentureRegistration()', () => {
  it('returns an empty-but-shaped default for an unregistered venture', () => {
    expect(getVentureRegistration('NOT-REGISTERED-XYZ')).toEqual({ preflightChecks: [], stepOverrides: {}, authOrigins: [], authProviderTestMode: 'production', authProviderTesting: null });
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
    expect(page.calls.fill).toContainEqual(['input[name="identifier"], input[name="emailAddress"], input[type="email"]', 'tester@example.com']);
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
    expect(page.calls.fill).toContainEqual(['input[name="identifier"], input[name="emailAddress"], input[type="email"]', 'existing@example.com']);
  });

  it('persona.type "fresh" signs in with the _FRESH credential, not the _EXISTING one', async () => {
    process.env[EXISTING_KEY] = JSON.stringify({ email: 'existing@example.com', password: 'pw1' });
    process.env[FRESH_KEY] = JSON.stringify({ email: 'fresh@example.com', password: 'pw2' });
    const executor = buildStepExecutor(step, 'PERSONAVENTURE');
    const page = makeMockPage({ locatorCounts: { 'text=Already have an account? Sign in': 1 } });

    await expect(executor(page, { type: 'fresh' }, { baseUrl: 'http://fixture', authenticated: false }))
      .rejects.toThrow(/authenticated, but no verified UI mapping/i);
    expect(page.calls.fill).toContainEqual(['input[name="identifier"], input[name="emailAddress"], input[type="email"]', 'fresh@example.com']);
    expect(page.calls.fill).not.toContainEqual(['input[name="identifier"], input[name="emailAddress"], input[type="email"]', 'existing@example.com']);
  });

  it('an unrecognized persona.type value falls back to "existing" rather than throwing', async () => {
    process.env[EXISTING_KEY] = JSON.stringify({ email: 'existing@example.com', password: 'pw1' });
    const executor = buildStepExecutor(step, 'PERSONAVENTURE');
    const page = makeMockPage({ locatorCounts: { 'text=Already have an account? Sign in': 1 } });

    await expect(executor(page, { type: 'bogus' }, { baseUrl: 'http://fixture', authenticated: false }))
      .rejects.toThrow(/authenticated, but no verified UI mapping/i);
    expect(page.calls.fill).toContainEqual(['input[name="identifier"], input[name="emailAddress"], input[type="email"]', 'existing@example.com']);
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
    expect(page.calls.click).toEqual([TOGGLE, 'Continue']);
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

    expect(page.calls.fill).toContainEqual(['input[name="identifier"], input[name="emailAddress"], input[type="email"]', 'tester@example.com']);
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

  it('fresh-E2E finding (2026-09-01, live run against altifyai.rickfelix2000.workers.dev): a post-submit redirect to a THIRD-PARTY origin is never read as "authenticated" -- even when its path does not match the sign-in/login denylist', async () => {
    vi.useFakeTimers();
    try {
      process.env[ENV_KEY] = JSON.stringify({ email: 'tester@example.com', password: 'pw' });
      const executor = buildStepExecutor(step, 'RACEVENTURE');
      const page = makeMockPage({
        locatorCounts: { [TOGGLE]: 1 },
        currentUrl: 'http://fixture/register',
        buttonTexts: ['Continue'],
        clickNavigations: { Continue: 'https://accounts.google.com/v3/signin/identifier?client_id=abc' },
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

  // QF-20260902-206 root cause + fix: Solomon's live headless render (row 5ad1d223) found
  // Clerk's sign-in card renders "Continue with Google" BEFORE "Continue" in DOM order -- a
  // SUBSTRING locator for "Continue" resolves to the Google button first, sending the walk to
  // accounts.google.com instead of submitting the password.
  it('QF-20260902-206: submits the EXACT "Continue" button, never "Continue with Google", even when Google renders first in DOM order', async () => {
    process.env[ENV_KEY] = JSON.stringify({ email: 'tester@example.com', password: 'pw' });
    const executor = buildStepExecutor(step, 'RACEVENTURE');
    // Exact DOM order from Solomon's live render: Continue with Google, an empty submit, Show
    // password, Continue.
    const page = makeMockPage({
      locatorCounts: { [TOGGLE]: 1 },
      buttonTexts: ['Continue with Google', '', 'Show password', 'Continue'],
    });

    await expect(executor(page, {}, { baseUrl: 'http://fixture', authenticated: false }))
      .rejects.toThrow(/authenticated, but no verified UI mapping/i);

    // The submit click resolved to "Continue" specifically, never "Continue with Google" --
    // proves exact-name matching, not merely "a Continue-shaped substring somewhere".
    expect(page.calls.click).toContain('Continue');
    expect(page.calls.click).not.toContain('Continue with Google');
    // No navigation to Google occurred (clickNavigations was never triggered), so the
    // post-submit auth check ran against the venture's own origin as intended.
    expect(page.url()).toBe('http://fixture/current');
  });

  it('QF-20260902-206: clickedButtonText is attached to the thrown error, recording which button was actually pressed (mirrors matchedSelector for preflights)', async () => {
    process.env[ENV_KEY] = JSON.stringify({ email: 'tester@example.com', password: 'pw' });
    const executor = buildStepExecutor(step, 'RACEVENTURE');
    const page = makeMockPage({ locatorCounts: { [TOGGLE]: 1 }, buttonTexts: ['Continue'] });

    let caught;
    try {
      await executor(page, {}, { baseUrl: 'http://fixture', authenticated: false });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught.clickedButtonText).toBe('Continue');
  });

});

describe('buildStepExecutor() fallback — SEC-003 authOrigins allowlist (FR-5, additive only)', () => {
  const step = { step_id: 'stp-abc123-do-a-thing', goal: 'do a thing' };
  const ENV_KEY = 'VENTURE_UAT_TEST_ACCOUNT_ALLOWLISTVENTURE_EXISTING';
  const TOGGLE = 'text=Already have an account? Sign in';
  afterEach(() => { delete process.env[ENV_KEY]; });

  it('accepts a currentOrigin that is NOT the expected baseUrl origin but IS in the venture-specific authOrigins allowlist', async () => {
    vi.useFakeTimers();
    try {
      process.env[ENV_KEY] = JSON.stringify({ email: 'tester@example.com', password: 'pw' });
      registerVenture('ALLOWLISTVENTURE', { authOrigins: ['https://trusted-auth.example'] });
      const executor = buildStepExecutor(step, 'ALLOWLISTVENTURE');
      const page = makeMockPage({ locatorCounts: { [TOGGLE]: 1 }, currentUrl: 'https://trusted-auth.example/sign-in' });

      // The allowlist only governs the SEC-003 credential-fill guard (this test's scope); the
      // mock never simulates Clerk redirecting back to baseUrl afterward, so the bounded
      // post-submit auth-confirmation wait times out -- that outcome, not full authentication,
      // proves the allowlist did its one job: the fill step was reached at all.
      const assertion = expect(executor(page, {}, { baseUrl: 'http://fixture', authenticated: false }))
        .rejects.toThrow(/auth required.*neither a verification-code challenge nor an authenticated-state signal/i);
      await vi.advanceTimersByTimeAsync(16000);
      await assertion;

      // Reached the fill step -- the allowlisted origin did not trip the SEC-003 refusal.
      expect(page.calls.fill).toContainEqual(['input[name="identifier"], input[name="emailAddress"], input[type="email"]', 'tester@example.com']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('still refuses an origin that is neither the expected baseUrl origin NOR in the allowlist -- the allowlist is additive, never a loosened comparison', async () => {
    process.env[ENV_KEY] = JSON.stringify({ email: 'tester@example.com', password: 'pw' });
    registerVenture('ALLOWLISTVENTURE', { authOrigins: ['https://trusted-auth.example'] });
    const executor = buildStepExecutor(step, 'ALLOWLISTVENTURE');
    const page = makeMockPage({ locatorCounts: { [TOGGLE]: 1 }, currentUrl: 'https://attacker.example/phish' });

    await expect(executor(page, {}, { baseUrl: 'http://fixture', authenticated: false }))
      .rejects.toThrow(/refusing to submit credentials.*navigated away from expected origin/i);

    expect(page.calls.fill).toEqual([]);
  });

  it('a prefix-match on an allowlisted origin string is still rejected -- allowlist membership is exact-string, never startsWith/includes', async () => {
    process.env[ENV_KEY] = JSON.stringify({ email: 'tester@example.com', password: 'pw' });
    registerVenture('ALLOWLISTVENTURE', { authOrigins: ['https://trusted-auth.example'] });
    const executor = buildStepExecutor(step, 'ALLOWLISTVENTURE');
    // "https://trusted-auth.example.evil.com" is NOT in the allowlist array by exact string
    // equality, even though it shares the allowlisted origin as a prefix.
    const page = makeMockPage({ locatorCounts: { [TOGGLE]: 1 }, currentUrl: 'https://trusted-auth.example.evil.com/sign-in' });

    await expect(executor(page, {}, { baseUrl: 'http://fixture', authenticated: false }))
      .rejects.toThrow(/refusing to submit credentials.*navigated away from expected origin/i);

    expect(page.calls.fill).toEqual([]);
  });

  it('a venture with no authOrigins configured behaves exactly as before -- every off-origin refused (regression guard)', async () => {
    process.env[ENV_KEY] = JSON.stringify({ email: 'tester@example.com', password: 'pw' });
    registerVenture('ALLOWLISTVENTURE', {}); // no authOrigins key at all
    const executor = buildStepExecutor(step, 'ALLOWLISTVENTURE');
    const page = makeMockPage({ locatorCounts: { [TOGGLE]: 1 }, currentUrl: 'https://trusted-auth.example/sign-in' });

    await expect(executor(page, {}, { baseUrl: 'http://fixture', authenticated: false }))
      .rejects.toThrow(/refusing to submit credentials.*navigated away from expected origin/i);
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
  it('registers 4 preflight checks and the stp-4de9/stp-e3e6/stp-6219 step overrides (QF-20260902-884, QF-20260902-033)', () => {
    const config = getVentureRegistration('ALTIFYAI');
    expect(config.preflightChecks.map((c) => c.name)).toEqual(['land', 'signupFormRenders', 'uploadRouteReachable', 'feedbackWidget']);
    // SD-LEO-INFRA-STAGE23-WALKER-ELEVEN-OVERRIDES-001 FR-12: this assertion used to be
    // exhaustive AND order-sensitive (toEqual on the full key list) -- it broke on the FIRST
    // new override registered, not the eleventh. Narrowed to a non-exhaustive membership check
    // for the 3 ORIGINAL overrides only; completeness against the full 14-journey spec (this
    // SD's 11 new overrides included) is now a HARD, real-DB CI gate at
    // scripts/altifyai-registry-completeness-check.mjs, wired into
    // .github/workflows/altifyai-uat-drift-check-cron.yml -- not this unit test.
    const keys = Object.keys(config.stepOverrides);
    expect(keys).toEqual(expect.arrayContaining([
      'stp-4de9-upload-a-single-imag',
      'stp-e3e6-automatically-genera',
      'stp-6219-see-the-generated-al',
    ]));
  });

  // FR-5: the venture's own sign-in toggle navigates off-origin to this Clerk-hosted domain --
  // reviewed and allowlisted here so SEC-003 can accept it without loosening origin equality.
  it('allowlists exactly the reviewed Clerk-hosted auth origin, nothing broader', () => {
    const config = getVentureRegistration('ALTIFYAI');
    expect(config.authOrigins).toEqual(['https://neat-foxhound-5152.accounts.dev']);
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

  it('signupFormRenders accepts the identifier field alongside the email selectors, and matchedSelector records the SPECIFIC alternative (FR-3) not the whole selector-set string', async () => {
    const { preflightChecks } = getVentureRegistration('ALTIFYAI');
    const check = preflightChecks.find((c) => c.name === 'signupFormRenders');
    const page = makeMockPage({
      locatorCounts: {
        'input[name="identifier"], input[name="emailAddress"], input[type="email"]': 1,
        'input[name="identifier"]': 1,
      },
    });

    const result = await check.run(page, { baseUrl: 'http://altifyai.fixture' });
    expect(result.renderedStateSummary).toMatch(/Clerk/);
    expect(result.matchedSelector).toBe('input[name="identifier"]');
  });

  it('signupFormRenders matchedSelector resolves to whichever alternative actually rendered, not always identifier (FR-3 regression guard)', async () => {
    const { preflightChecks } = getVentureRegistration('ALTIFYAI');
    const check = preflightChecks.find((c) => c.name === 'signupFormRenders');
    const page = makeMockPage({
      locatorCounts: {
        'input[name="identifier"], input[name="emailAddress"], input[type="email"]': 1,
        'input[name="identifier"]': 0,
        'input[name="emailAddress"]': 1,
      },
    });

    const result = await check.run(page, { baseUrl: 'http://altifyai.fixture' });
    expect(result.matchedSelector).toBe('input[name="emailAddress"]');
  });

  it('signupFormRenders fails when none of the selector-set alternatives render', async () => {
    const { preflightChecks } = getVentureRegistration('ALTIFYAI');
    const check = preflightChecks.find((c) => c.name === 'signupFormRenders');
    const page = makeMockPage({ locatorCounts: {} });

    await expect(check.run(page, { baseUrl: 'http://altifyai.fixture' })).rejects.toThrow(/no email\/identifier field rendered/);
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

// QF-20260902-884: the stp-4de9 stepOverride. Grounded in a hydration-aware live re-census
// (Solomon directive f67e4e9d) that corrected this session's own earlier false-premise finding
// -- /generate DOES render a real upload workspace once React mounts.
describe('buildStepExecutor() — ALTIFYAI stp-4de9 override (QF-20260902-884)', () => {
  const step = { step_id: 'stp-4de9-upload-a-single-imag', goal: 'upload a single image from my computer' };
  const TOGGLE = 'text=Already have an account? Sign in';
  const EXISTING_KEY = 'VENTURE_UAT_TEST_ACCOUNT_ALTIFYAI_EXISTING';
  const SECRET_VAR = 'VENTURE_UAT_CLERK_SECRET_KEY_ALTIFYAI';
  const PUBLISHABLE_VAR = 'VENTURE_UAT_CLERK_PUBLISHABLE_KEY_ALTIFYAI';

  beforeEach(() => {
    clerkTesting.clerkSetup.mockReset().mockResolvedValue(undefined);
    clerkTesting.setupClerkTestingToken.mockReset().mockResolvedValue(undefined);
    process.env[EXISTING_KEY] = JSON.stringify({ email: 'tester@example.com', password: 'pw' });
    process.env[SECRET_VAR] = 'sk_test_abc';
    process.env[PUBLISHABLE_VAR] = 'pk_test_xyz';
  });
  afterEach(() => {
    delete process.env[EXISTING_KEY];
    delete process.env[SECRET_VAR];
    delete process.env[PUBLISHABLE_VAR];
  });

  it('fires only for this exact step_id -- a different step_id on ALTIFYAI resolves the generic fallback, never this override', () => {
    const otherStep = { step_id: 'stp-0001-some-other-step', goal: 'do something else' };
    const executor = buildStepExecutor(otherStep, 'ALTIFYAI');
    const overrideExecutor = buildStepExecutor(step, 'ALTIFYAI');
    expect(executor).not.toBe(overrideExecutor);
  });

  it('fires only for ALTIFYAI -- the identical step_id on an unregistered venture resolves the generic fallback', () => {
    const overrideExecutor = buildStepExecutor(step, 'ALTIFYAI');
    const genericExecutor = buildStepExecutor(step, 'SOMEUNREGISTEREDVENTURE');
    expect(genericExecutor).not.toBe(overrideExecutor);
  });

  it('authenticates via the SAME generic auth flow (never re-implemented), then confirms the real /generate upload workspace and stamps stepOverrideUsed', async () => {
    const executor = buildStepExecutor(step, 'ALTIFYAI');
    const page = makeMockPage({
      locatorCounts: { [TOGGLE]: 1, 'input[type="file"]': 1 },
      buttonTexts: ['Continue'],
      clickNavigations: { Continue: 'http://fixture/dashboard' },
    });

    const result = await executor(page, { type: 'existing' }, { baseUrl: 'http://fixture', authenticated: false });

    expect(result.stepOverrideUsed).toBe(true);
    expect(result.matchedSelector).toBe('input[type="file"]');
    expect(result.renderedStateSummary).toMatch(/upload workspace rendered on \/generate/);
    expect(page.calls.goto).toContain('http://fixture/generate');
    // Real auth flow ran (never re-implemented): the toggle was confirmed and credentials filled.
    expect(page.calls.click).toContain(TOGGLE);
    expect(clerkTesting.setupClerkTestingToken).toHaveBeenCalledWith({ page });
  });

  it('does not re-run auth when ctx.authenticated is already true (a prior step already signed in)', async () => {
    const executor = buildStepExecutor(step, 'ALTIFYAI');
    const page = makeMockPage({ locatorCounts: { 'input[type="file"]': 1 } });

    const result = await executor(page, { type: 'existing' }, { baseUrl: 'http://fixture', authenticated: true });

    expect(result.stepOverrideUsed).toBe(true);
    // No /register navigation, no credential fill -- auth was never re-attempted.
    expect(page.calls.goto).not.toContain('http://fixture/register');
    expect(page.calls.fill).toEqual([]);
  });

  it('propagates a genuine auth failure unmodified (never masks a real failure as "no UI mapping")', async () => {
    const executor = buildStepExecutor(step, 'ALTIFYAI');
    // Toggle never renders -- SEC-001 refuses before any credential is submitted.
    const page = makeMockPage({ locatorCounts: { [TOGGLE]: 0 } });

    await expect(executor(page, { type: 'existing' }, { baseUrl: 'http://fixture', authenticated: false }))
      .rejects.toThrow(/could not confirm a sign-in affordance/i);
    expect(page.calls.fill).toEqual([]);
  });

  it('throws when no input[type="file"] renders on /generate after the wait (never fabricates a pass)', async () => {
    vi.useFakeTimers();
    try {
      const executor = buildStepExecutor(step, 'ALTIFYAI');
      const page = makeMockPage({
        locatorCounts: { [TOGGLE]: 1, 'input[type="file"]': 0 },
        buttonTexts: ['Continue'],
        clickNavigations: { Continue: 'http://fixture/dashboard' },
      });

      const assertion = expect(executor(page, { type: 'existing' }, { baseUrl: 'http://fixture', authenticated: false }))
        .rejects.toThrow(/no input\[type="file"\] rendered.*after 15s/i);
      await vi.advanceTimersByTimeAsync(15000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});

// QF-20260902-033: stp-e3e6/stp-6219 overrides. Solomon STEP-0 constraint (c7dad710/8c90a171)
// required diagnosing the census's ~120s "Loading alt text..." hang BEFORE writing these --
// scripts/one-off/diagnose-altifyai-generation-hang-033.mjs measured live that the backend's
// POST /api/alt-text genuinely resolves (~126s) to an HTTP 500, rendered as "Alt text
// unavailable: An internal error occurred." These fixtures encode exactly that measured shape:
// a real product error, not an unresolved hang.
describe('buildStepExecutor() — ALTIFYAI stp-e3e6/stp-6219 overrides (QF-20260902-033)', () => {
  const FILE_INPUT = '[data-testid="file-input"]';
  const STATUS_SUCCESS = '[data-testid="status-success"]';
  const ALT_TEXT_DISPLAY = '[data-testid="alt-text-display"]';
  const STATE_LOADING = '[data-testid="state-loading"]';
  const e3e6Step = { step_id: 'stp-e3e6-automatically-genera', goal: 'automatically generate alt text for an uploaded image' };
  const step6219 = { step_id: 'stp-6219-see-the-generated-al', goal: 'see the generated alt text clearly displayed next to its corresponding image' };

  describe('stp-e3e6 (auto-generate)', () => {
    it('uploads, confirms the automatic trigger, and stamps stepOverrideUsed when real text renders', async () => {
      const executor = buildStepExecutor(e3e6Step, 'ALTIFYAI');
      const page = makeMockPage({
        locatorCounts: { [FILE_INPUT]: 1 },
        waitForVisible: { [STATUS_SUCCESS]: true, [ALT_TEXT_DISPLAY]: true, [STATE_LOADING]: false },
        locatorTexts: { [ALT_TEXT_DISPLAY]: 'A golden retriever sitting in a park.' },
      });

      const result = await executor(page, { type: 'existing' }, { baseUrl: 'http://fixture', authenticated: true });

      expect(result.stepOverrideUsed).toBe(true);
      expect(result.matchedSelector).toBe(ALT_TEXT_DISPLAY);
      expect(result.renderedStateSummary).toMatch(/A golden retriever/);
      expect(page.calls.click).toContain(`setInputFiles:${FILE_INPUT}`);
    });

    // QF-20260905-241: the temp upload PNG must not be unlinked until AFTER the status-success
    // poll resolves -- deleting it in a `finally` immediately after setInputFiles() (as this
    // function used to) raced the page's own async upload read, which on the live app sometimes
    // lost the race and failed client-side with net::ERR_FILE_NOT_FOUND before any request ever
    // reached the server. This asserts the ordering invariant directly: at the moment the FIRST
    // status-success check runs, the file must still be on disk (unlink not yet called).
    it('does not unlink the temp upload file before the status-success poll has even started (QF-20260905-241)', async () => {
      const unlinkSpy = vi.spyOn(fs, 'unlinkSync');
      const unlinkCallCountAtFirstPoll = [];
      const executor = buildStepExecutor(e3e6Step, 'ALTIFYAI');
      const page = makeMockPage({
        locatorCounts: { [FILE_INPUT]: 1 },
        waitForVisible: { [STATUS_SUCCESS]: true, [ALT_TEXT_DISPLAY]: true, [STATE_LOADING]: false },
        locatorTexts: { [ALT_TEXT_DISPLAY]: 'A golden retriever sitting in a park.' },
      });
      const originalLocator = page.locator.bind(page);
      page.locator = (selector) => {
        const loc = originalLocator(selector);
        if (selector === STATUS_SUCCESS) {
          const originalIsVisible = loc.isVisible.bind(loc);
          loc.isVisible = async () => {
            unlinkCallCountAtFirstPoll.push(unlinkSpy.mock.calls.length);
            return originalIsVisible();
          };
        }
        return loc;
      };

      await executor(page, { type: 'existing' }, { baseUrl: 'http://fixture', authenticated: true });

      expect(unlinkCallCountAtFirstPoll[0]).toBe(0); // file still on disk when the poll first checks
      expect(unlinkSpy).toHaveBeenCalledTimes(1); // and it IS eventually cleaned up, just afterward
      unlinkSpy.mockRestore();
    });

    it('throws a measured GENERATION_DID_NOT_RESOLVE (never a fabricated pass) when the backend surfaces its own error state', async () => {
      const executor = buildStepExecutor(e3e6Step, 'ALTIFYAI');
      const page = makeMockPage({
        locatorCounts: { [FILE_INPUT]: 1 },
        waitForVisible: { [STATUS_SUCCESS]: true, [ALT_TEXT_DISPLAY]: true, [STATE_LOADING]: false },
        locatorTexts: { [ALT_TEXT_DISPLAY]: 'Alt text unavailable: An internal error occurred. Please try again.' },
      });

      await expect(executor(page, { type: 'existing' }, { baseUrl: 'http://fixture', authenticated: true }))
        .rejects.toThrow(/GENERATION_DID_NOT_RESOLVE.*backend surfaced an error state/i);
    });

    it('throws when status-success never appears within 15s (the automatic trigger itself did not fire)', async () => {
      vi.useFakeTimers();
      try {
        const executor = buildStepExecutor(e3e6Step, 'ALTIFYAI');
        const page = makeMockPage({
          locatorCounts: { [FILE_INPUT]: 1 },
          waitForVisible: { [STATUS_SUCCESS]: false },
        });

        const assertion = expect(executor(page, { type: 'existing' }, { baseUrl: 'http://fixture', authenticated: true }))
          .rejects.toThrow(/no \[data-testid="status-success"\] within 15s/);
        await vi.advanceTimersByTimeAsync(15000);
        await assertion;
      } finally {
        vi.useRealTimers();
      }
    });

    it('throws a measured GENERATION_DID_NOT_RESOLVE when the wait genuinely expires with no resolution at all', async () => {
      vi.useFakeTimers();
      try {
        const executor = buildStepExecutor(e3e6Step, 'ALTIFYAI');
        const page = makeMockPage({
          locatorCounts: { [FILE_INPUT]: 1 },
          waitForVisible: { [STATUS_SUCCESS]: true, [ALT_TEXT_DISPLAY]: true, [STATE_LOADING]: true },
        });

        const assertion = expect(executor(page, { type: 'existing' }, { baseUrl: 'http://fixture', authenticated: true }))
          .rejects.toThrow(/GENERATION_DID_NOT_RESOLVE.*still state-loading after 150s, no error surfaced/i);
        await vi.advanceTimersByTimeAsync(150000);
        await assertion;
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('stp-6219 (see generated alt text)', () => {
    it('confirms real generated text is displayed on the current page, no fresh upload', async () => {
      const executor = buildStepExecutor(step6219, 'ALTIFYAI');
      const page = makeMockPage({
        waitForVisible: { [ALT_TEXT_DISPLAY]: true },
        locatorTexts: { [ALT_TEXT_DISPLAY]: 'A golden retriever sitting in a park.' },
      });

      const result = await executor(page, { type: 'existing' }, { baseUrl: 'http://fixture', authenticated: true });

      expect(result.stepOverrideUsed).toBe(true);
      expect(result.renderedStateSummary).toMatch(/A golden retriever/);
      expect(page.calls.click).not.toContain(`setInputFiles:${FILE_INPUT}`); // never re-uploads
    });

    it('throws a measured GENERATION_DID_NOT_RESOLVE when the display still shows the error state', async () => {
      const executor = buildStepExecutor(step6219, 'ALTIFYAI');
      const page = makeMockPage({
        waitForVisible: { [ALT_TEXT_DISPLAY]: true },
        locatorTexts: { [ALT_TEXT_DISPLAY]: 'Alt text unavailable: An internal error occurred. Please try again.' },
      });

      await expect(executor(page, { type: 'existing' }, { baseUrl: 'http://fixture', authenticated: true }))
        .rejects.toThrow(/GENERATION_DID_NOT_RESOLVE/);
    });
  });
});

describe('buildClerkTestModeIdentity()', () => {
  it('inserts a "+clerk_test" marker into the email local-part, leaving the password untouched', () => {
    expect(buildClerkTestModeIdentity({ email: 'tester@example.com', password: 'pw' }))
      .toEqual({ email: 'tester+clerk_test@example.com', password: 'pw' });
  });

  it('throws on a malformed email rather than silently producing a bogus identity', () => {
    expect(() => buildClerkTestModeIdentity({ email: 'not-an-email', password: 'pw' })).toThrow(/not a valid address/);
  });
});

// QF-20260902-512: auth_provider_test_mode branches the code-challenge leg between Clerk's
// documented test-mode fixed code (no IMAP poll) and the existing mailbox-OTP path, and stamps
// forensics (challenge_kind/retrieval_path/auth_mode/mailbox_census) on the thrown error the
// same never-fabricated way clickedButtonText already is.
describe('buildStepExecutor() fallback — authProviderTestMode (QF-20260902-512)', () => {
  const step = { step_id: 'stp-abc123-do-a-thing', goal: 'do a thing' };
  const CODE_INPUT = 'input[name="code"], input[autocomplete="one-time-code"]';
  const TOGGLE = 'text=Already have an account? Sign in';
  const EXISTING_KEY = 'VENTURE_UAT_TEST_ACCOUNT_AUTHMODEVENTURE_EXISTING';

  beforeEach(() => {
    process.env[EXISTING_KEY] = JSON.stringify({ email: 'tester@example.com', password: 'pw' });
    imapCodeFetcher.fetchVerificationCode.mockReset();
    imapCodeFetcher.fetchVerificationCodeDetailed.mockReset();
  });
  afterEach(() => { delete process.env[EXISTING_KEY]; });

  it('clerk_development: fills the +clerk_test identity and the fixed code, never calling the IMAP fetcher', async () => {
    registerVenture('AUTHMODEVENTURE', { authProviderTestMode: 'clerk_development' });
    const executor = buildStepExecutor(step, 'AUTHMODEVENTURE');
    const page = makeMockPage({
      locatorCounts: { [TOGGLE]: 1 },
      waitForVisible: { [CODE_INPUT]: true },
      currentUrl: 'http://fixture/dashboard',
    });

    let caught;
    try {
      await executor(page, {}, { baseUrl: 'http://fixture', authenticated: false });
    } catch (err) {
      caught = err;
    }

    expect(page.calls.fill).toContainEqual(['input[name="identifier"], input[name="emailAddress"], input[type="email"]', 'tester+clerk_test@example.com']);
    expect(page.calls.fill).toContainEqual([CODE_INPUT, CLERK_TEST_MODE_FIXED_CODE]);
    expect(imapCodeFetcher.fetchVerificationCodeDetailed).not.toHaveBeenCalled();
    expect(imapCodeFetcher.fetchVerificationCode).not.toHaveBeenCalled();

    // Run-row forensics (Solomon ruling 59a5315d item 2): stamped on the thrown error the same
    // never-fabricated way clickedButtonText already is.
    expect(caught).toBeInstanceOf(Error);
    expect(caught.challengeKind).toBe('email-code');
    expect(caught.retrievalPath).toBe('clerk_test_mode');
    expect(caught.authMode).toBe('clerk_test_mode');
    expect(caught.mailboxCensus).toBeNull();
  });

  it('production (default): signs in with the unmodified credential and calls the IMAP fetcher, stamping the mailbox census', async () => {
    imapCodeFetcher.fetchVerificationCodeDetailed.mockResolvedValue({ code: '135790', messagesSeen: 4 });
    registerVenture('AUTHMODEVENTURE', {}); // no authProviderTestMode -- defaults to production
    const executor = buildStepExecutor(step, 'AUTHMODEVENTURE');
    const page = makeMockPage({
      locatorCounts: { [TOGGLE]: 1 },
      waitForVisible: { [CODE_INPUT]: true },
      currentUrl: 'http://fixture/dashboard',
    });

    let caught;
    try {
      await executor(page, {}, { baseUrl: 'http://fixture', authenticated: false });
    } catch (err) {
      caught = err;
    }

    expect(page.calls.fill).toContainEqual(['input[name="identifier"], input[name="emailAddress"], input[type="email"]', 'tester@example.com']);
    expect(page.calls.fill).toContainEqual([CODE_INPUT, '135790']);
    expect(imapCodeFetcher.fetchVerificationCodeDetailed).toHaveBeenCalledWith({ aliasLocalPart: expect.any(String) });

    expect(caught.challengeKind).toBe('email-code');
    expect(caught.retrievalPath).toBe('imap');
    expect(caught.authMode).toBe('mailbox_otp');
    expect(caught.mailboxCensus).toBe(4);
  });

  it('re-keyed STEP 1 (Adam 2026-09-02T09:59:55Z): when neither the code challenge nor an authenticated signal appears, the thrown error carries a generic post-submit page-text snapshot -- never a guessed Clerk-specific selector', async () => {
    vi.useFakeTimers();
    try {
      registerVenture('AUTHMODEVENTURE', { authProviderTestMode: 'clerk_development' });
      const executor = buildStepExecutor(step, 'AUTHMODEVENTURE');
      const page = makeMockPage({
        locatorCounts: { [TOGGLE]: 1 },
        currentUrl: 'http://fixture/sign-in', // matches NOT_YET_AUTHENTICATED_PATH_RE -- authedDirect must read false
        bodyText: 'Too many requests. Please try again later.',
      });

      const assertion = expect(executor(page, {}, { baseUrl: 'http://fixture', authenticated: false }))
        .rejects.toThrow(/neither a verification-code challenge nor an authenticated-state signal.*Too many requests/s);
      await vi.advanceTimersByTimeAsync(16000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});

// QF-20260902-614: MEASURED via #8013's own forensics (uat_test_runs ea2102fa) -- a +clerk_test
// identity signs IN with no account yet, so Clerk answers "Couldn't find your account" instead
// of a code challenge. Recovery via sign-up is gated EXCLUSIVELY on the authProviderTestMode
// marker, never a loosened SEC-001 for a real identity (unchanged on the sign-in leg above).
describe('buildStepExecutor() fallback — no-account sign-up recovery (QF-20260902-614)', () => {
  const step = { step_id: 'stp-abc123-do-a-thing', goal: 'do a thing' };
  const CODE_INPUT = 'input[name="code"], input[autocomplete="one-time-code"]';
  const TOGGLE = 'text=Already have an account? Sign in';
  const EXISTING_KEY = 'VENTURE_UAT_TEST_ACCOUNT_NOACCTVENTURE_EXISTING';
  afterEach(() => { delete process.env[EXISTING_KEY]; });

  // security-agent review (PR #8023, finding SEC-614-3): the sign-up leg's own origin guards
  // (added alongside the recovery branch itself) previously shipped with zero test coverage --
  // a "blind guard" in this repo's own vocabulary. Mirrors the sign-in leg's equivalent SEC-003
  // coverage above.
  it('refuses the sign-up leg if the sign-in submit click itself navigated off-origin, even though the sign-in leg\'s own SEC-003 check (before that click) passed', async () => {
    vi.useFakeTimers();
    try {
      process.env[EXISTING_KEY] = JSON.stringify({ email: 'tester@example.com', password: 'pw' });
      registerVenture('NOACCTVENTURE', { authProviderTestMode: 'clerk_development' });
      const executor = buildStepExecutor(step, 'NOACCTVENTURE');
      const page = makeMockPage({
        locatorCounts: { [TOGGLE]: 1 },
        currentUrl: 'http://fixture/sign-in', // same-origin at the SEC-003 check, before the submit click
        bodyText: "Couldn't find your account.",
        clickNavigationsSequence: { Continue: ['http://attacker.example/redirected'] }, // the sign-in submit click itself redirects off-origin
      });

      const assertion = expect(executor(page, {}, { baseUrl: 'http://fixture', authenticated: false }))
        .rejects.toThrow(/sign-up navigation landed off expected origin http:\/\/fixture/);
      await vi.advanceTimersByTimeAsync(16000);
      await assertion;

      expect(page.calls.fill).toHaveLength(2); // only the (failed) sign-in identity+password -- never reached the sign-up fill
    } finally {
      vi.useRealTimers();
    }
  });

  it('refuses the sign-up leg if the current URL cannot be parsed to verify its origin', async () => {
    vi.useFakeTimers();
    try {
      process.env[EXISTING_KEY] = JSON.stringify({ email: 'tester@example.com', password: 'pw' });
      registerVenture('NOACCTVENTURE', { authProviderTestMode: 'clerk_development' });
      const executor = buildStepExecutor(step, 'NOACCTVENTURE');
      const page = makeMockPage({
        locatorCounts: { [TOGGLE]: 1 },
        currentUrl: 'http://fixture/sign-in',
        bodyText: "Couldn't find your account.",
        clickNavigationsSequence: { Continue: ['not-a-valid-url'] },
      });

      const assertion = expect(executor(page, {}, { baseUrl: 'http://fixture', authenticated: false }))
        .rejects.toThrow(/sign-up navigation URL "not-a-valid-url" could not be parsed/);
      await vi.advanceTimersByTimeAsync(16000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('clerk_development + Clerk\'s "Couldn\'t find your account" text on the +clerk_test identity recovers via sign-up, reaches authenticated, and stamps auth_branch=sign_up', async () => {
    vi.useFakeTimers();
    try {
      process.env[EXISTING_KEY] = JSON.stringify({ email: 'tester@example.com', password: 'pw' });
      registerVenture('NOACCTVENTURE', { authProviderTestMode: 'clerk_development' });
      const executor = buildStepExecutor(step, 'NOACCTVENTURE');
      const page = makeMockPage({
        locatorCounts: { [TOGGLE]: 1 },
        currentUrl: 'http://fixture/sign-in', // stays not-yet-authenticated until the sign-up verify click below
        bodyText: "Couldn't find your account.",
        waitForVisibleSequence: { [CODE_INPUT]: [false, true] }, // no challenge on sign-in, one on sign-up
        clickNavigationsSequence: { Continue: [undefined, undefined, 'http://fixture/dashboard'] }, // 3rd Continue click = the sign-up verify
      });

      let caught;
      const capture = executor(page, {}, { baseUrl: 'http://fixture', authenticated: false }).then(
        (v) => { throw new Error(`expected executor to throw, but it resolved with ${JSON.stringify(v)}`); },
        (err) => { caught = err; },
      );
      // THREE sequential 15s races now, not two: the sign-in leg's race, the sign-up leg's own
      // race (Solomon fix shape 85cd494b), and submitCodeStep's own auth-vs-submit race
      // (QF-20260902-952) -- the code input never auto-submits in this fixture (only the
      // explicit "3rd Continue click" navigates to /dashboard), so submitCodeStep's poll must
      // fully elapse before it falls back to clicking the code-form submit.
      await vi.advanceTimersByTimeAsync(48000);
      await capture;

      expect(caught).toBeInstanceOf(Error);
      expect(caught.message).toMatch(/authenticated, but no verified UI mapping/i);
      expect(caught.authBranch).toBe('sign_up');
      expect(caught.challengeKind).toBe('email-code');
      expect(caught.retrievalPath).toBe('clerk_test_mode');
      expect(caught.authMode).toBe('clerk_test_mode');
      // QF-20260902-093: the sign-up form (unlike sign-in) also requires firstName/lastName --
      // filled from the fenced profile's fixed default, and stamped on the run row.
      expect(caught.signupFieldsFilled).toEqual(['firstName', 'lastName', 'emailAddress', 'password']);
      expect(page.calls.fill).toContainEqual(['input[name="firstName"]', 'UAT']);
      expect(page.calls.fill).toContainEqual(['input[name="lastName"]', 'Walker']);

      const emailFills = page.calls.fill.filter(([sel]) => sel.includes('identifier'));
      expect(emailFills).toEqual([
        ['input[name="identifier"], input[name="emailAddress"], input[type="email"]', 'tester+clerk_test@example.com'],
        ['input[name="identifier"], input[name="emailAddress"], input[type="email"]', 'tester+clerk_test@example.com'],
      ]);
      expect(page.calls.fill).toContainEqual([CODE_INPUT, CLERK_TEST_MODE_FIXED_CODE]);
      expect(page.calls.goto.filter((u) => u === 'http://fixture/register')).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('Solomon fix shape (directive 85cd494b): a dev instance that signs the identity in WITHOUT ever asking for a code is a real success (auth_mode=clerk_signup_noverify), not misread as a rejected form', async () => {
    vi.useFakeTimers();
    try {
      process.env[EXISTING_KEY] = JSON.stringify({ email: 'tester@example.com', password: 'pw' });
      registerVenture('NOACCTVENTURE', { authProviderTestMode: 'clerk_development' });
      const executor = buildStepExecutor(step, 'NOACCTVENTURE');
      const page = makeMockPage({
        locatorCounts: { [TOGGLE]: 1 },
        currentUrl: 'http://fixture/sign-in',
        bodyText: "Couldn't find your account.",
        // No code challenge ever appears, but the sign-up submit click itself lands on an
        // authenticated URL (2nd Continue click = the sign-up submit).
        waitForVisibleSequence: { [CODE_INPUT]: [false, false] },
        clickNavigationsSequence: { Continue: [undefined, 'http://fixture/dashboard'] },
      });

      let caught;
      const capture = executor(page, {}, { baseUrl: 'http://fixture', authenticated: false }).then(
        (v) => { throw new Error(`expected executor to throw, but it resolved with ${JSON.stringify(v)}`); },
        (err) => { caught = err; },
      );
      // Only the sign-in leg's race needs the full 15s -- the sign-up leg's authedDirect signal
      // resolves on its first check since the submit click already landed on /dashboard.
      await vi.advanceTimersByTimeAsync(16000);
      await capture;

      expect(caught.message).toMatch(/authenticated, but no verified UI mapping/i);
      expect(caught.authBranch).toBe('sign_up');
      expect(caught.challengeKind).toBe('authenticated');
      expect(caught.retrievalPath).toBe('clerk_test_mode');
      expect(caught.authMode).toBe('clerk_signup_noverify');
      // No code was ever filled -- this path never reaches the verification step.
      expect(page.calls.fill).not.toContainEqual([CODE_INPUT, CLERK_TEST_MODE_FIXED_CODE]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('follow-up (MEASURED live 2026-09-02T11:43Z, uat_test_runs 8747cf25): if the sign-up leg reaches neither signal, the thrown error carries a post-signup page-text snapshot too', async () => {
    vi.useFakeTimers();
    try {
      process.env[EXISTING_KEY] = JSON.stringify({ email: 'tester@example.com', password: 'pw' });
      registerVenture('NOACCTVENTURE', { authProviderTestMode: 'clerk_development' });
      const executor = buildStepExecutor(step, 'NOACCTVENTURE');
      const page = makeMockPage({
        locatorCounts: { [TOGGLE]: 1 },
        currentUrl: 'http://fixture/sign-in',
        bodyText: "Couldn't find your account.",
        waitForVisibleSequence: { [CODE_INPUT]: [false, false] }, // never appears, even after sign-up
      });

      const assertion = expect(executor(page, {}, { baseUrl: 'http://fixture', authenticated: false }))
        .rejects.toThrow(/signed up the \+clerk_test identity.*neither a verification-code challenge nor an authenticated-state signal appeared.*post-signup page text.*Couldn't find your account/s);
      await vi.advanceTimersByTimeAsync(32000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('the no-account recovery never fires for a production (non-test-mode) venture -- fails closed with the original error, no second /register navigation attempted', async () => {
    vi.useFakeTimers();
    try {
      process.env[EXISTING_KEY] = JSON.stringify({ email: 'tester@example.com', password: 'pw' });
      registerVenture('NOACCTVENTURE', {}); // no authProviderTestMode -- defaults to production
      const executor = buildStepExecutor(step, 'NOACCTVENTURE');
      const page = makeMockPage({
        locatorCounts: { [TOGGLE]: 1 },
        currentUrl: 'http://fixture/sign-in',
        bodyText: "Couldn't find your account.", // same Clerk text, but the mode gate must refuse it
      });

      const assertion = expect(executor(page, {}, { baseUrl: 'http://fixture', authenticated: false }))
        .rejects.toThrow(/neither a verification-code challenge nor an authenticated-state signal.*Couldn't find your account/s);
      await vi.advanceTimersByTimeAsync(16000);
      await assertion;

      // Never attempted the sign-up recovery: only the original goto('/register'), and only
      // the one (failed) sign-in identity fill -- the real credential, never +clerk_test.
      expect(page.calls.goto.filter((u) => u === 'http://fixture/register')).toHaveLength(1);
      expect(page.calls.fill).toContainEqual(['input[name="identifier"], input[name="emailAddress"], input[type="email"]', 'tester@example.com']);
      // QF-20260902-093: firstName/lastName are only ever filled on the sign-up leg, which
      // this venture never reaches.
      expect(page.calls.fill).not.toContainEqual(['input[name="firstName"]', 'UAT']);
      expect(page.calls.fill).not.toContainEqual(['input[name="lastName"]', 'Walker']);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('getClerkTestingKeys() — QF-20260902-935', () => {
  const SECRET_VAR = 'VENTURE_UAT_CLERK_SECRET_KEY_KEYVENTURE';
  const PUBLISHABLE_VAR = 'VENTURE_UAT_CLERK_PUBLISHABLE_KEY_KEYVENTURE';
  afterEach(() => {
    delete process.env[SECRET_VAR];
    delete process.env[PUBLISHABLE_VAR];
  });

  it('returns ok:false, reason missing_keys when neither var is set', () => {
    expect(getClerkTestingKeys('KEYVENTURE')).toEqual({ ok: false, reason: 'missing_keys' });
  });

  it('returns ok:false, reason missing_keys when only one of the pair is set', () => {
    process.env[SECRET_VAR] = 'sk_test_abc';
    expect(getClerkTestingKeys('KEYVENTURE')).toEqual({ ok: false, reason: 'missing_keys' });
  });

  it('returns the keys when both are present and correctly prefixed', () => {
    process.env[SECRET_VAR] = 'sk_test_abc';
    process.env[PUBLISHABLE_VAR] = 'pk_test_xyz';
    expect(getClerkTestingKeys('KEYVENTURE')).toEqual({ ok: true, secretKey: 'sk_test_abc', publishableKey: 'pk_test_xyz' });
  });

  it('Solomon condition 2: fails loud, naming the env var, on a present secret key of the wrong class -- never the value', () => {
    process.env[SECRET_VAR] = 'sk_live_realkey';
    process.env[PUBLISHABLE_VAR] = 'pk_test_xyz';
    expect(() => getClerkTestingKeys('KEYVENTURE')).toThrow(new RegExp(`${SECRET_VAR}.*sk_test_`));
    expect(() => getClerkTestingKeys('KEYVENTURE')).not.toThrow(/sk_live_realkey/);
  });

  it('Solomon condition 2: fails loud, naming the env var, on a present publishable key of the wrong class', () => {
    process.env[SECRET_VAR] = 'sk_test_abc';
    process.env[PUBLISHABLE_VAR] = 'pk_live_realkey';
    expect(() => getClerkTestingKeys('KEYVENTURE')).toThrow(new RegExp(`${PUBLISHABLE_VAR}.*pk_test_`));
    expect(() => getClerkTestingKeys('KEYVENTURE')).not.toThrow(/pk_live_realkey/);
  });
});

// QF-20260902-935 (chairman decision 62beeaaa): Clerk Testing Tokens instead of ever touching
// the Turnstile widget. Ticket item (6): keys present installs the token before navigation;
// keys absent stamps the skip reason; a non-Clerk venture never calls it.
describe('buildStepExecutor() fallback — authProviderTesting: clerk_testing_token (QF-20260902-935)', () => {
  const step = { step_id: 'stp-abc123-do-a-thing', goal: 'do a thing' };
  const TOGGLE = 'text=Already have an account? Sign in';
  const EXISTING_KEY = 'VENTURE_UAT_TEST_ACCOUNT_TOKENVENTURE_EXISTING';
  const SECRET_VAR = 'VENTURE_UAT_CLERK_SECRET_KEY_TOKENVENTURE';
  const PUBLISHABLE_VAR = 'VENTURE_UAT_CLERK_PUBLISHABLE_KEY_TOKENVENTURE';

  beforeEach(() => {
    clerkTesting.clerkSetup.mockReset().mockResolvedValue(undefined);
    clerkTesting.setupClerkTestingToken.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => {
    delete process.env[EXISTING_KEY];
    delete process.env[SECRET_VAR];
    delete process.env[PUBLISHABLE_VAR];
  });

  it('keys present: installs the testing token before the first navigation', async () => {
    process.env[EXISTING_KEY] = JSON.stringify({ email: 'tester@example.com', password: 'pw' });
    process.env[SECRET_VAR] = 'sk_test_abc';
    process.env[PUBLISHABLE_VAR] = 'pk_test_xyz';
    registerVenture('TOKENVENTURE', { authProviderTesting: 'clerk_testing_token' });
    const executor = buildStepExecutor(step, 'TOKENVENTURE');
    // Toggle absent -- SEC-001 refuses right after the goto, but the testing-token setup (which
    // runs BEFORE that goto) must have already fired by then.
    const page = makeMockPage();

    await expect(executor(page, {}, { baseUrl: 'http://fixture', authenticated: false }))
      .rejects.toThrow(/could not confirm a sign-in affordance/i);

    expect(clerkTesting.clerkSetup).toHaveBeenCalledWith({ secretKey: 'sk_test_abc', publishableKey: 'pk_test_xyz', dotenv: false });
    expect(clerkTesting.setupClerkTestingToken).toHaveBeenCalledWith({ page });
    expect(page.calls.goto).toEqual(['http://fixture/register']);
  });

  it('security-agent review REC-2: clears ambient CLERK_TESTING_TOKEN/CLERK_FAPI before clerkSetup, so a stray env var from a prior process/venture can never bypass the sk_test_ gate', async () => {
    process.env[EXISTING_KEY] = JSON.stringify({ email: 'tester@example.com', password: 'pw' });
    process.env[SECRET_VAR] = 'sk_test_abc';
    process.env[PUBLISHABLE_VAR] = 'pk_test_xyz';
    process.env.CLERK_TESTING_TOKEN = 'poison-token-from-another-venture';
    process.env.CLERK_FAPI = 'poison-fapi.example.com';
    try {
      registerVenture('TOKENVENTURE', { authProviderTesting: 'clerk_testing_token' });
      const executor = buildStepExecutor(step, 'TOKENVENTURE');
      const page = makeMockPage();

      await expect(executor(page, {}, { baseUrl: 'http://fixture', authenticated: false }))
        .rejects.toThrow(/could not confirm a sign-in affordance/i);

      expect(process.env.CLERK_TESTING_TOKEN).toBeUndefined();
      expect(process.env.CLERK_FAPI).toBeUndefined();
    } finally {
      delete process.env.CLERK_TESTING_TOKEN;
      delete process.env.CLERK_FAPI;
    }
  });

  it('keys absent: skips the leg with a fail-loud error (never a silent/vacuous pass) and stamps auth_mode=skipped_missing_keys', async () => {
    process.env[EXISTING_KEY] = JSON.stringify({ email: 'tester@example.com', password: 'pw' });
    registerVenture('TOKENVENTURE', { authProviderTesting: 'clerk_testing_token' });
    const executor = buildStepExecutor(step, 'TOKENVENTURE');
    const page = makeMockPage({ locatorCounts: { [TOGGLE]: 1 } });

    let caught;
    try {
      await executor(page, {}, { baseUrl: 'http://fixture', authenticated: false });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught.message).toMatch(/VENTURE_UAT_CLERK_SECRET_KEY_TOKENVENTURE\/VENTURE_UAT_CLERK_PUBLISHABLE_KEY_TOKENVENTURE are not both set/);
    expect(caught.authMode).toBe('skipped_missing_keys');
    expect(clerkTesting.clerkSetup).not.toHaveBeenCalled();
    expect(clerkTesting.setupClerkTestingToken).not.toHaveBeenCalled();
    // Fails BEFORE ever reaching the form -- never a vacuous pass dressed up as a skip.
    expect(page.calls.goto).toEqual([]);
    expect(page.calls.fill).toEqual([]);
  });

  it('a venture without authProviderTesting set never calls the Clerk testing-token setup', async () => {
    process.env[EXISTING_KEY] = JSON.stringify({ email: 'tester@example.com', password: 'pw' });
    registerVenture('TOKENVENTURE', {}); // no authProviderTesting -- defaults to null
    const executor = buildStepExecutor(step, 'TOKENVENTURE');
    const page = makeMockPage({ locatorCounts: { [TOGGLE]: 1 } });

    await expect(executor(page, {}, { baseUrl: 'http://fixture', authenticated: false }))
      .rejects.toThrow(/authenticated, but no verified UI mapping/i);

    expect(clerkTesting.clerkSetup).not.toHaveBeenCalled();
    expect(clerkTesting.setupClerkTestingToken).not.toHaveBeenCalled();
  });
});
