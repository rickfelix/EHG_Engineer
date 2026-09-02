/**
 * Venture step-executor registry — SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001 FR-2.
 *
 * SCOPE CORRECTION (made live, during EXEC, before any code was written): the PLAN-phase
 * assumption was that a venture's real Stage-15 journey steps would be concrete enough to
 * hand-map onto DOM interactions the way FR-0's own smoke checks are (land / sign up /
 * upload / dashboard / feedback). A live query of a real blueprint_user_journey artifact
 * (AltifyAI, venture_id 809ec7e7-f688-4a0c-b9f8-c8a8291cf94d) disproved this on two counts:
 *   1. step_id is a hash-derived slug ("stp-f5cc-define-my-primary-ni"), not a stable,
 *      semantic key -- it changes if Stage 15 regenerates the journey.
 *   2. The steps themselves are fine-grained PRODUCT FEATURE actions ("generate a blog
 *      post outline", "check content for plagiarism", "export generated content"), not
 *      coarse navigation milestones -- selectors for these do not exist anywhere in this
 *      codebase and inventing plausible-looking ones without verifying them against the
 *      live app would be a blind guard (looks like coverage, tests nothing real).
 *
 * This registry therefore does NOT attempt to auto-map goal-prose to DOM actions (that
 * needs a live-DOM-interpreting capability, explicitly out of scope). Instead it composes
 * two honest mechanisms:
 *   - stepOverrides: an explicit, hand-verified escape hatch keyed by the exact step_id of
 *     a specific artifact snapshot. Empty until someone does that verification work; when a
 *     journey regenerates, a stale override just stops matching (an explicit, visible gap
 *     -- never a silent wrong-behavior).
 *   - a generic fallback executor (buildStepExecutor) that attempts auth (via a
 *     pre-provisioned test credential -- NEVER registration) and then truthfully reports
 *     "no verified UI mapping for this step" rather than fabricating a pass. Making that
 *     gap visible and queryable is this SD's own stated purpose.
 *   - preflightChecks: separate from the step walk. These ARE concrete, FR-0-verified
 *     checks (land page renders, /register renders a real auth form, the upload screen is
 *     confirmed absent, the feedback widget is mounted) -- run once per walk as a basic
 *     "is the app itself alive" sanity gate, not tied to any specific journey step_id.
 */
import { fetchVerificationCodeDetailed } from './imap-code-fetcher.js';

const registry = new Map();

// QF-20260902-512: Clerk's documented development-instance test-mode convention -- an
// identifier carrying a "+clerk_test" local-part marker receives this fixed code with no
// email ever sent. Sign-in only (never mutates or creates the underlying credential); STEP 1
// of this QF is the live, measured verification of this documented-but-unconfirmed behavior
// on AltifyAI's own instance.
export const CLERK_TEST_MODE_FIXED_CODE = '424242';

/**
 * @param {{email: string, password: string}} credential
 * @returns {{email: string, password: string}} the same credential with a "+clerk_test"
 *   marker inserted into the local-part of the email
 */
export function buildClerkTestModeIdentity(credential) {
  const at = credential.email.indexOf('@');
  if (at === -1) throw new Error('buildClerkTestModeIdentity: credential.email is not a valid address');
  return { ...credential, email: `${credential.email.slice(0, at)}+clerk_test${credential.email.slice(at)}` };
}

/**
 * Resolve the venture's fenced-mailbox plus-alias local-part (SD-LEO-FIX-ALTIFYAI-UAT-FETCH-001),
 * e.g. 'altifyai-uat' for ventureKey='altifyai'. Overridable via
 * VENTURE_UAT_MAILBOX_ALIAS_<KEY>; defaults to `${ventureKey}-uat`, matching the
 * chairman-ratified venture-wide fenced-mailbox pattern (one mailbox, per-venture alias).
 * @param {string} ventureKey
 * @returns {string}
 */
export function getMailboxAlias(ventureKey) {
  const key = (ventureKey || '').toUpperCase();
  const override = process.env[`VENTURE_UAT_MAILBOX_ALIAS_${key}`];
  return override || `${(ventureKey || '').toLowerCase()}-uat`;
}

/**
 * Bounded poll for an authenticated-state URL signal: the page is still on the venture's own
 * origin AND its URL path no longer looks like a sign-in/login screen. Polls page.url()
 * directly (matching this file's existing synchronous page.url() usage) rather than
 * page.waitForURL(), since not every navigation driver in this codebase's test/execution
 * paths implements that Playwright-specific API.
 *
 * SD-LEO-FIX-ALTIFYAI-UAT-FETCH-001 fresh-E2E finding (2026-09-01, live run against
 * https://altifyai.rickfelix2000.workers.dev): a pre-existing `button:has-text("Continue")`
 * selector (SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001, out of this SD's scope to fix) matches
 * more than one on-page button and can click "Continue with Google" instead of the
 * credentials-form submit button,
 * redirecting the page to accounts.google.com's OAuth consent screen. That URL's path
 * ("/v3/signin/identifier") does NOT match NOT_YET_AUTHENTICATED_PATH_RE, so the
 * path-only check read it as "authenticated" -- a false positive with real consequences
 * (ctx.authenticated=true while the user is on a third-party domain, not signed into the
 * venture at all). Requiring same-origin (mirroring the SEC-003 true-origin-equality check
 * already used before the password fill, a few lines above this function's call sites)
 * closes it: an off-origin redirect can never satisfy "authenticated".
 * @param {{url: () => string}} page
 * @param {string} expectedOrigin - the venture's own origin (new URL(ctx.baseUrl).origin)
 * @param {{timeoutMs?: number, pollIntervalMs?: number}} [options]
 * @returns {Promise<boolean>}
 */
// Deliberately broad denylist, not just /sign-in|login/: adversarial review (deep-tier)
// flagged that Clerk's own 2FA-adjacent intermediate paths (a /verify or /factor-two screen,
// say) would NOT match a narrower pattern and could read as "authenticated" prematurely,
// racing ahead of the code-challenge locator wait. fallbackExecutor already gives the
// code-challenge branch priority when BOTH resolve (see the `if (codeChallenge) ... else if
// (authedDirect)` below), so this denylist is the second layer, not the only one.
const NOT_YET_AUTHENTICATED_PATH_RE = /\/(sign-in|login|register|verify|factor|mfa|challenge)\b/i;

async function pollForAuthenticatedUrl(page, expectedOrigin, { timeoutMs = 15000, pollIntervalMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs;
  const isAuthedUrl = () => {
    try {
      const url = new URL(page.url());
      return url.origin === expectedOrigin && !NOT_YET_AUTHENTICATED_PATH_RE.test(url.pathname);
    } catch {
      return false;
    }
  };
  while (Date.now() < deadline) {
    if (isAuthedUrl()) return true;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  return isAuthedUrl();
}

/**
 * @param {string} ventureKey
 * @param {{preflightChecks?: Array<{name: string, run: (page, ctx) => Promise<{url:string, renderedStateSummary:string}>}>, stepOverrides?: Object<string, Function>, authOrigins?: string[], authProviderTestMode?: 'clerk_development'|'production'}} config
 */
export function registerVenture(ventureKey, config = {}) {
  registry.set(ventureKey.toUpperCase(), {
    preflightChecks: config.preflightChecks || [],
    stepOverrides: config.stepOverrides || {},
    // SD-LEO-FIX-STAGE-WALK-PASSES-001 FR-5: origins this venture's own sign-in flow is
    // known to legitimately redirect to (e.g. a Clerk-hosted accounts.dev domain), reviewed
    // and allowlisted per-venture. Read only by the SEC-003 origin guard below as an
    // ADDITIVE allow-check -- the true-origin-equality comparison it augments is never
    // loosened.
    authOrigins: config.authOrigins || [],
    // QF-20260902-512: 'clerk_development' opts into the Clerk documented +clerk_test
    // fixed-code convention below instead of polling the fenced mailbox over IMAP.
    // Defaults to 'production' so no existing venture's behavior changes silently.
    authProviderTestMode: config.authProviderTestMode === 'clerk_development' ? 'clerk_development' : 'production',
  });
}

/**
 * @param {string} ventureKey
 * @returns {{preflightChecks: Array, stepOverrides: Object<string, Function>, authOrigins: string[], authProviderTestMode: string}}
 */
export function getVentureRegistration(ventureKey) {
  return registry.get((ventureKey || '').toUpperCase()) || { preflightChecks: [], stepOverrides: {}, authOrigins: [], authProviderTestMode: 'production' };
}

// SD-LEO-FIX-STAGE-WALK-PASSES-001 FR-1: single source of truth for the sign-up/sign-in
// email field selector, identifier-first (Clerk's actual live field name on /register --
// measured 2026-09-02, walk run 4017dd8f), then the legacy emailAddress/email selectors for
// defense-in-depth against a view-mode change. Both the credential fill (buildStepExecutor
// below) and the signupFormRenders preflight resolve against this SAME array -- keeping two
// independently-hardcoded copies is exactly what let the preflight accept a field the fill
// never tried.
const EMAIL_FIELD_SELECTORS = ['input[name="identifier"]', 'input[name="emailAddress"]', 'input[type="email"]'];

// QF-20260902-206: Clerk's sign-in card renders "Continue with Google", an empty submit,
// "Show password", "Continue" in DOM order -- a SUBSTRING locator for "Continue" resolves
// FIRST to "Continue with Google" and sends the walk to accounts.google.com. Exact-name
// matching (never a negative substring alongside it) excludes it at both submit sites.
// Solomon STEP-0 read d5e6ff04: :288 keeps BOTH names (Continue OR Verify -- either is a
// legitimate post-code-challenge submit), :270 (password submit) is Continue only.
const SUBMIT_BUTTON_NAME_RE = /^Continue$/;
const VERIFY_BUTTON_NAME_RE = /^(Continue|Verify)$/;

/**
 * Wait once for any of `selectors` to render (same total latency as a single combined-selector
 * wait), then determine which SPECIFIC alternative matched via near-instant isVisible() checks.
 * FR-3: matchedSelector must record the resolved element, not the whole selector-set string.
 * @param {*} page
 * @param {string[]} selectors
 * @param {{timeoutMs?: number}} [options]
 * @returns {Promise<string|null>} the one selector that matched, or null if none rendered
 */
async function resolveVisibleSelector(page, selectors, { timeoutMs = 10000 } = {}) {
  const appeared = await page.locator(selectors.join(', ')).first()
    .waitFor({ state: 'visible', timeout: timeoutMs })
    .then(() => true)
    .catch(() => false);
  if (!appeared) return null;
  for (const selector of selectors) {
    if (await page.locator(selector).first().isVisible().catch(() => false)) return selector;
  }
  return null;
}

/**
 * Read a pre-provisioned test credential for a venture. Never throws — returns null when
 * unset or malformed, so callers can produce a clear "no credential configured" outcome
 * instead of an opaque crash. Creating a NEW account is prohibited; this is sign-IN only.
 *
 * Two distinct identities matter, not one (Solomon/Oracle PLAN-completeness finding M2,
 * confirmed by QF-20260819-687's investigation): an "existing" account carries real
 * accumulated history and was created before some prior deploy, so it exercises
 * old-account-vs-new-code paths a brand-new account never touches (this is exactly what
 * surfaced AltifyAI's post-deploy dashboard regression); a "fresh" account has minimal/no
 * history. Both are pre-provisioned out-of-band (this function only ever reads existing
 * env vars — it cannot create either), keyed VENTURE_UAT_TEST_ACCOUNT_<KEY>_<TYPE>. Falls
 * back to the original un-suffixed VENTURE_UAT_TEST_ACCOUNT_<KEY> when the typed var is
 * unset, so any venture already using the single-credential form keeps working.
 * @param {string} ventureKey
 * @param {'existing'|'fresh'} [personaType='existing']
 * @returns {{email: string, password: string}|null}
 */
export function getTestCredential(ventureKey, personaType = 'existing') {
  const key = (ventureKey || '').toUpperCase();
  const type = (personaType || 'existing').toUpperCase();
  const raw = process.env[`VENTURE_UAT_TEST_ACCOUNT_${key}_${type}`] || process.env[`VENTURE_UAT_TEST_ACCOUNT_${key}`];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.email === 'string' && typeof parsed.password === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve the executor for one journey step: an explicit, hand-verified override if one is
 * registered for this exact step_id, else a generic fallback that attempts auth (once per
 * walk, tracked via ctx.authenticated) and truthfully reports the coverage gap rather than
 * fabricating a pass.
 * @param {{step_id: string, goal: string|null}} step
 * @param {string} ventureKey
 * @returns {(page, persona, ctx) => Promise<{url: string, renderedStateSummary: string}>}
 */
export function buildStepExecutor(step, ventureKey) {
  const { stepOverrides, authOrigins, authProviderTestMode } = getVentureRegistration(ventureKey);
  // Object.hasOwn guard (SECURITY finding SEC-002): bare bracket access on an inherited
  // step_id (e.g. "constructor", "toString") resolves to an Object.prototype member --
  // browser-executor.js's runJourneyWalk then treats that truthy, wrong-shaped value as a
  // real executor and returns completedAllSteps=true with zero navigation ever having
  // happened, fabricating a PASS that FR-3's PLAN-TO-LEAD gate reads as genuine. Matches the
  // guard already established in the sibling lib/apa/browser-executor.js.
  const override = Object.hasOwn(stepOverrides, step.step_id) ? stepOverrides[step.step_id] : undefined;
  if (override) return override;

  return async function fallbackExecutor(page, persona, ctx) {
    // QF-20260902-206: whichever submit button was actually clicked, attached to any thrown
    // error below (never lost) -- the run row records it the way matchedSelector records the
    // resolved element for preflights (FR-3 of SD-LEO-FIX-STAGE-WALK-PASSES-001).
    let clickedButtonText = null;
    // QF-20260902-512: same never-lost attachment pattern as clickedButtonText, for the
    // challenge/retrieval/auth-mode/mailbox-census fields Solomon ruling 59a5315d requires on
    // the run row (metadata.auth_mode etc), so a silent provider reads as a measured fact
    // even on the always-throwing "no verified UI mapping" outcome below.
    let challengeKind = 'none';
    let retrievalPath = null;
    let authMode = null;
    let mailboxCensus = null;
    // QF-20260902-614: which leg actually authenticated -- a sign-up (the +clerk_test identity
    // had no account yet) reads as PRODUCT-FLOW evidence only, never a sign-in proof; defaults
    // to 'sign_in' since that is every path except the newly-added no-account recovery below.
    let authBranch = 'sign_in';
    try {
      return await fallbackExecutorBody(page, persona, ctx);
    } catch (err) {
      if (clickedButtonText && err instanceof Error) err.clickedButtonText = clickedButtonText;
      if (err instanceof Error) {
        err.challengeKind = challengeKind;
        err.retrievalPath = retrievalPath;
        err.authMode = authMode;
        err.mailboxCensus = mailboxCensus;
        err.authBranch = authBranch;
      }
      throw err;
    }

    async function fallbackExecutorBody(page, persona, ctx) {
    if (ctx.authenticated) {
      throw new Error(`no verified UI mapping for step "${step.goal || step.step_id}" (step_id=${step.step_id}) -- venture-specific selector work not yet done, out of scope for this SD`);
    }
    const personaType = persona?.type === 'fresh' ? 'fresh' : 'existing';
    const credential = getTestCredential(ventureKey, personaType);
    if (!credential) {
      throw new Error(`auth required for step "${step.goal || step.step_id}" -- no ${personaType} test credential configured (VENTURE_UAT_TEST_ACCOUNT_${ventureKey.toUpperCase()}_${personaType.toUpperCase()} unset, and no un-suffixed VENTURE_UAT_TEST_ACCOUNT_${ventureKey.toUpperCase()} fallback either)`);
    }
    await page.goto(`${ctx.baseUrl}/register`);
    // SECURITY finding SEC-001 (HIGH), two parts -- security-agent's re-verification caught
    // that the first fix only closed half of this:
    // (1) RACE (closed): page.locator(...).count() does NOT auto-wait -- an instant snapshot,
    //     unlike page.fill()'s auto-waiting. On a client-side-mounted auth widget (measured:
    //     ~900ms to mount), count() read 0 before the toggle existed. waitFor() genuinely
    //     waits, so a slow-to-mount toggle is now correctly detected.
    // (2) FAIL-OPEN (closed here): the first fix still fell through to fill+submit when the
    //     toggle was never found at all (timeout), not just slow. fallbackExecutor is the
    //     GENERIC path for every venture -- for any venture with different copy, i18n, a
    //     non-Clerk provider, or a genuinely registration-only page, "toggle not found" is
    //     the DEFAULT outcome, and it is exactly the case where submitting is most likely to
    //     create a real account. Confirming a sign-in affordance is a precondition for
    //     submitting credentials at all, not an optional courtesy click -- refuse instead of
    //     proceeding blind.
    const signInToggle = page.locator('text=Already have an account? Sign in');
    const toggleVisible = await signInToggle
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => true)
      .catch(() => false);
    if (!toggleVisible) {
      throw new Error(`auth required for step "${step.goal || step.step_id}" -- could not confirm a sign-in affordance on ${ctx.baseUrl}/register after waiting; refusing to submit credentials to avoid risking a registration/account-creation attempt`);
    }
    await signInToggle.click();
    // SEC-003 (bundled -- same fix shape: confirm which page a password is about to be typed
    // into, per security-agent's re-verification). The toggle click can itself navigate/redirect;
    // re-check the origin immediately before filling the password, not just before goto().
    // security-agent re-verification: startsWith() is a PREFIX match, not an origin
    // comparison -- an origin has no terminating delimiter, so
    // "http://venture.test.evil.com".startsWith("http://venture.test") is true. True origin
    // equality via new URL(...).origin closes that; an unparseable currentUrl must also
    // refuse (fail-closed), not silently pass.
    const expectedOrigin = new URL(ctx.baseUrl).origin;
    const currentUrl = page.url();
    let currentOrigin;
    try {
      currentOrigin = new URL(currentUrl).origin;
    } catch {
      throw new Error(`refusing to submit credentials for step "${step.goal || step.step_id}" -- current URL "${currentUrl}" could not be parsed to verify its origin`);
    }
    // SD-LEO-FIX-STAGE-WALK-PASSES-001 FR-5: an ADDITIVE allowlist check, never a loosened
    // comparison -- currentOrigin must equal expectedOrigin OR appear verbatim in this
    // venture's reviewed authOrigins list (exact string membership, never startsWith/includes
    // on the raw origin string, which is exactly the prefix-match bypass SEC-003 closed).
    if (currentOrigin !== expectedOrigin && !authOrigins.includes(currentOrigin)) {
      throw new Error(`refusing to submit credentials for step "${step.goal || step.step_id}" -- navigated away from expected origin ${expectedOrigin} to ${currentUrl}`);
    }
    // FR-1/FR-2: identifier-first shared selector -- targets the SAME visible field the
    // land/signupFormRenders preflights already matched, instead of the retired
    // emailAddress/email-only pair this fill previously used exclusively.
    // QF-20260902-512: for a clerk_development venture, sign in with the +clerk_test-marked
    // identity so Clerk's documented test-mode convention (fixed code, no email sent) applies;
    // production ventures sign in with the credential unmodified.
    const signInIdentity = authProviderTestMode === 'clerk_development'
      ? buildClerkTestModeIdentity(credential)
      : credential;
    await page.fill(EMAIL_FIELD_SELECTORS.join(', '), signInIdentity.email);
    await page.fill('input[name="password"], input[type="password"]', signInIdentity.password);
    const submitButton = page.getByRole('button', { name: SUBMIT_BUTTON_NAME_RE });
    await submitButton.click();
    clickedButtonText = (await submitButton.textContent().catch(() => null))?.trim() || 'Continue';

    // SD-LEO-FIX-ALTIFYAI-UAT-FETCH-001: the password-submit click alone does NOT mean
    // authenticated -- Clerk may present a 2FA email-code challenge next. Race two bounded
    // waits rather than assuming either outcome; only a real confirmed signal sets
    // ctx.authenticated.
    const codeInputLocator = page.locator('input[name="code"], input[autocomplete="one-time-code"]');
    const codeChallengeVisible = codeInputLocator
      .waitFor({ state: 'visible', timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    const authenticatedSignalVisible = pollForAuthenticatedUrl(page, expectedOrigin, { timeoutMs: 15000 });
    const [codeChallenge, authedDirect] = await Promise.all([codeChallengeVisible, authenticatedSignalVisible]);

    if (codeChallenge) {
      challengeKind = 'email-code';
      let verificationCode;
      if (authProviderTestMode === 'clerk_development') {
        // QF-20260902-512 PREMISE CORRECTION (Adam 2026-09-02T09:59:55Z): a Clerk development
        // instance DOES deliver OTP email (capped at 100/month, then rejected) -- the original
        // "dev instances never email" cause was withdrawn. Only a "+clerk_test"-marked identity
        // is documented to skip email and receive this fixed code; WHY the fenced identity's
        // real address never got mail (cap spent / wrong registered address / deliverability)
        // is still unmeasured and does not change this branch -- it stays the harness-side fix
        // regardless (Solomon ruling: "the test-mode identity path proceeds ... regardless").
        retrievalPath = 'clerk_test_mode';
        authMode = 'clerk_test_mode';
        verificationCode = CLERK_TEST_MODE_FIXED_CODE;
      } else {
        retrievalPath = 'imap';
        authMode = 'mailbox_otp';
        const aliasLocalPart = getMailboxAlias(ventureKey);
        const fetched = await fetchVerificationCodeDetailed({ aliasLocalPart });
        verificationCode = fetched.code;
        mailboxCensus = fetched.messagesSeen;
      }
      await page.fill('input[name="code"], input[autocomplete="one-time-code"]', verificationCode);
      const verifyButton = page.getByRole('button', { name: VERIFY_BUTTON_NAME_RE });
      await verifyButton.click();
      clickedButtonText = (await verifyButton.textContent().catch(() => null))?.trim() || clickedButtonText;
      const confirmedAfterCode = await pollForAuthenticatedUrl(page, expectedOrigin, { timeoutMs: 15000 });
      if (!confirmedAfterCode) {
        throw new Error(`auth required for step "${step.goal || step.step_id}" -- submitted the verification code (retrieval_path=${retrievalPath}) but no authenticated-state signal appeared afterward`);
      }
      ctx.authenticated = true;
    } else if (authedDirect) {
      challengeKind = 'authenticated';
      ctx.authenticated = true;
    } else {
      // QF-20260902-512 re-keyed STEP 1 (Adam 2026-09-02T09:59:55Z): record the exact
      // post-submit page state so a silent-provider run (rate-limit rejection, an unexpected
      // Clerk error, etc.) is diagnosable from the row instead of reading as an identical
      // generic timeout. A raw, un-opinionated text snapshot -- never a guessed Clerk-specific
      // selector/copy this codebase has not verified live (the exact blind-guard mistake its
      // own header already refuses to make).
      const pageSnapshot = (await page.locator('body').innerText().catch(() => null))?.slice(0, 500) || null;
      // QF-20260902-614: MEASURED via #8013's own forensics (uat_test_runs ea2102fa) -- a
      // +clerk_test identity is a test user "by Clerk construction" on a development instance,
      // but no account existed yet, so the sign-IN attempt above got Clerk's literal "Couldn't
      // find your account" rather than a code challenge. Gated EXCLUSIVELY on the
      // authProviderTestMode marker (never a loosened SEC-001 for a real identity, which stays
      // exactly as it is on the sign-in leg above) -- recover via the sign-UP path, where the
      // same fixed-code convention applies on email verification.
      const noAccountDetected = authProviderTestMode === 'clerk_development'
        && pageSnapshot != null && pageSnapshot.includes("Couldn't find your account");
      if (!noAccountDetected) {
        throw new Error(`auth required for step "${step.goal || step.step_id}" -- neither a verification-code challenge nor an authenticated-state signal appeared after password submit (post-submit page text: ${pageSnapshot ?? 'unavailable'})`);
      }
      authBranch = 'sign_up';
      await page.goto(`${ctx.baseUrl}/register`);
      let signUpOrigin;
      try {
        signUpOrigin = new URL(page.url()).origin;
      } catch {
        throw new Error(`refusing to submit credentials for step "${step.goal || step.step_id}" -- sign-up navigation URL "${page.url()}" could not be parsed to verify its origin`);
      }
      if (signUpOrigin !== expectedOrigin) {
        throw new Error(`refusing to submit credentials for step "${step.goal || step.step_id}" -- sign-up navigation landed off expected origin ${expectedOrigin} at ${page.url()}`);
      }
      await page.fill(EMAIL_FIELD_SELECTORS.join(', '), signInIdentity.email);
      await page.fill('input[name="password"], input[type="password"]', signInIdentity.password);
      const signUpSubmitButton = page.getByRole('button', { name: SUBMIT_BUTTON_NAME_RE });
      await signUpSubmitButton.click();
      clickedButtonText = (await signUpSubmitButton.textContent().catch(() => null))?.trim() || clickedButtonText;

      const signUpCodeVisible = await codeInputLocator
        .waitFor({ state: 'visible', timeout: 15000 })
        .then(() => true)
        .catch(() => false);
      if (!signUpCodeVisible) {
        // QF-20260902-614 follow-up (MEASURED live 2026-09-02T11:43Z, uat_test_runs 8747cf25:
        // auth_branch=sign_up but no code step appeared) -- same un-opinionated, never-guessed
        // snapshot as the sign-in "neither" branch, so what actually rendered post-sign-up is
        // diagnosable from the row instead of an identical "no code step" message every time.
        const signUpSnapshot = (await page.locator('body').innerText().catch(() => null))?.slice(0, 500) || null;
        throw new Error(`auth required for step "${step.goal || step.step_id}" -- signed up the +clerk_test identity after a no-account sign-in, but no verification-code step appeared (post-signup page text: ${signUpSnapshot ?? 'unavailable'})`);
      }
      challengeKind = 'email-code';
      retrievalPath = 'clerk_test_mode';
      authMode = 'clerk_test_mode';
      await page.fill('input[name="code"], input[autocomplete="one-time-code"]', CLERK_TEST_MODE_FIXED_CODE);
      const signUpVerifyButton = page.getByRole('button', { name: VERIFY_BUTTON_NAME_RE });
      await signUpVerifyButton.click();
      clickedButtonText = (await signUpVerifyButton.textContent().catch(() => null))?.trim() || clickedButtonText;
      const confirmedAfterSignUp = await pollForAuthenticatedUrl(page, expectedOrigin, { timeoutMs: 15000 });
      if (!confirmedAfterSignUp) {
        throw new Error(`auth required for step "${step.goal || step.step_id}" -- signed up the +clerk_test identity and submitted the fixed code (auth_branch=sign_up) but no authenticated-state signal appeared afterward`);
      }
      ctx.authenticated = true;
    }

    // Authenticated, but still no concrete mapping for THIS step's product-feature UI.
    throw new Error(`authenticated, but no verified UI mapping for step "${step.goal || step.step_id}" (step_id=${step.step_id}) -- venture-specific selector work not yet done, out of scope for this SD`);
    }
  };
}

/**
 * AltifyAI preflight checks, grounded directly in this SD's own FR-0 live evidence
 * (strategic_directives_v2.metadata.fr0_falsifier_artifact) -- not invented.
 */
/**
 * Signed-out journey coverage — SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C (FR-3).
 *
 * TESTING/LEAD-validation finding: signed-out coverage was genuinely absent, and inventing new
 * unverified signed-out DOM selectors would repeat the exact blind-guard mistake this file's
 * header already refuses to make for signed-in steps. Rather than fabricate new selectors,
 * this reuses the venture's ALREADY hand-verified, unauthenticated preflightChecks as the
 * signed-out journey's step content — each preflightCheck's `run(page, ctx)` already executes
 * without any credential or sign-in attempt.
 *
 * @param {string} ventureKey
 * @returns {Array<{step_id: string, goal: string}>} a minimal journey derived only from
 *   already-verified, unauthenticated checks — never a fabricated mapping.
 */
export function getSignedOutJourneySteps(ventureKey) {
  const { preflightChecks } = getVentureRegistration(ventureKey);
  return preflightChecks.map((check) => ({ step_id: `signed-out:${check.name}`, goal: check.name }));
}

/**
 * Resolve the executor for a signed-out journey step produced by getSignedOutJourneySteps().
 * Never attempts auth, never falls through to buildStepExecutor's credential path — a
 * signed-out step whose preflightCheck cannot be found fails honestly rather than silently
 * substituting the generic (auth-attempting) fallback.
 *
 * @param {{step_id: string}} step - a step from getSignedOutJourneySteps()
 * @param {string} ventureKey
 * @returns {(page, persona, ctx) => Promise<{url: string, renderedStateSummary: string}>}
 */
export function buildSignedOutStepExecutor(step, ventureKey) {
  const { preflightChecks } = getVentureRegistration(ventureKey);
  const checkName = (step.step_id || '').replace(/^signed-out:/, '');
  const check = preflightChecks.find((c) => c.name === checkName);
  if (!check) {
    return async function unmappedSignedOutStep() {
      throw new Error(`no verified signed-out mapping for step_id "${step.step_id}" -- no matching preflightCheck registered for venture "${ventureKey}"`);
    };
  }
  return async function signedOutStepExecutor(page, persona, ctx) {
    return check.run(page, ctx);
  };
}

// QF-20260901-385 verification instrument + date: freshly re-measured live against
// https://altifyai.rickfelix2000.workers.dev via scripts/one-off/inspect-altifyai-landing-dom.mjs
// and scripts/one-off/repro-altifyai-preflight-race.mjs. Attach to each check's outcome so the
// next drift reads as an aged stamp against a named instrument, not a mystery RED.
const PREFLIGHT_VERIFICATION = { verifiedAt: '2026-09-02', instrument: 'scripts/one-off/inspect-altifyai-landing-dom.mjs + repro-altifyai-preflight-race.mjs' };

registerVenture('ALTIFYAI', {
  preflightChecks: [
    {
      // QF-20260901-385 root cause (measured, not assumed): the "Start free" CTA is NOT
      // retired -- a fresh Playwright probe with a networkidle wait found it present twice on
      // the live landing page. The RED walk was a hydration RACE: page.goto() resolves before
      // this Vite SPA's JS bundle renders content, so an immediate .count() reads 0 every time
      // (reproduced 5/5 runs against production). Same defect CLASS as SEC-001 just above in
      // this file (buildStepExecutor's sign-in toggle) -- count() does not auto-wait, waitFor()
      // does. Fixed the same way: wait, don't snapshot.
      //
      // QF-20260901-455, AMENDED per coordinator/Solomon measured ruling (curl + headless
      // Chromium, 02:53Z): a plain 'text=Start free' locator resolves TWO nodes on the live
      // page, so an action-class call like waitFor() throws a Playwright STRICT-MODE violation
      // -- an immediate, deterministic exception, not a timing race -- which my first attempt at
      // this fix silently absorbed into a generic catch. Fixed with .first() (strict-safe).
      // Solomon separately confirmed <title> is present in the raw 392-byte SPA shell before any
      // render (title proves CDN reachability only, never a render marker -- ruling out the
      // #root/.first() alternative this fix originally shipped) and that the CTA rendered at
      // 3,716ms after a 2,869ms domcontentloaded on the measured run, i.e. safely inside a 30s
      // cap but past what a 10s cap would ever catch. Combined shape per the ruling: the CTA
      // text (strict-safe) OR /register's Clerk identifier field counts as land-passing; wait via
      // networkidle capped at 30s; every run records matchedSelector + msToMarker; a failure
      // never swallows the underlying error text.
      name: 'land',
      async run(page, ctx) {
        const HYDRATION_TIMEOUT_MS = 30000;
        const ctaSelector = 'text=Start free';
        const identifierSelector = EMAIL_FIELD_SELECTORS[0]; // FR-1: shared constant, not a second hardcoded copy
        const t0 = Date.now();
        await page.goto(ctx.baseUrl, { waitUntil: 'networkidle', timeout: HYDRATION_TIMEOUT_MS }).catch(() => {});
        let matchedSelector = null;
        let lastError = null;
        try {
          await page.locator(ctaSelector).first().waitFor({ state: 'visible', timeout: HYDRATION_TIMEOUT_MS });
          matchedSelector = ctaSelector;
        } catch (e) {
          lastError = e;
        }
        if (!matchedSelector) {
          try {
            await page.goto(`${ctx.baseUrl}/register`, { waitUntil: 'networkidle', timeout: HYDRATION_TIMEOUT_MS }).catch(() => {});
            await page.locator(identifierSelector).waitFor({ state: 'visible', timeout: HYDRATION_TIMEOUT_MS });
            matchedSelector = identifierSelector;
          } catch (e) {
            lastError = e;
          }
        }
        const msToMarker = Date.now() - t0;
        if (!matchedSelector) {
          throw new Error(`land: neither "${ctaSelector}" nor "${identifierSelector}" rendered (waited ${HYDRATION_TIMEOUT_MS / 1000}s, ms_to_marker=${msToMarker}${lastError ? `, last error: ${lastError.message}` : ''})`);
        }
        return { url: ctx.baseUrl, renderedStateSummary: `landing reachable (matched ${matchedSelector})`, matchedSelector, msToMarker, ...PREFLIGHT_VERIFICATION };
      },
    },
    {
      // Same hydration-race root cause as `land` above -- fixed the same way (wait, don't
      // snapshot). Selector also widened to accept input[name="identifier"] as an alternative
      // (coordinator ruling, RULING TESTING... no: QF-20260901-385 coordinator ask 5439df75):
      // Alpha's live DOM read found the Clerk SIGN-IN sub-view (reached via the "Already have
      // an account? Sign in" toggle) uses name="identifier", distinct from the default sign-UP
      // view's email field this check targets. Measured today: the default /register view still
      // renders the email field (count=1) once waited for, so this widening is defense-in-depth
      // for a view-mode change, not the fix for today's RED.
      name: 'signupFormRenders',
      async run(page, ctx) {
        const url = `${ctx.baseUrl}/register`;
        await page.goto(url);
        // FR-1/FR-3: shared selector constant; matchedSelector records the SPECIFIC
        // alternative that rendered (not the whole comma-joined selector-set string).
        const matched = await resolveVisibleSelector(page, EMAIL_FIELD_SELECTORS, { timeoutMs: 10000 });
        if (!matched) {
          throw new Error(`signupFormRenders: no email/identifier field rendered on /register (waited 10s, selectors: ${EMAIL_FIELD_SELECTORS.join(', ')})`);
        }
        return { url, renderedStateSummary: 'Clerk sign-up/sign-in form rendered', matchedSelector: matched, ...PREFLIGHT_VERIFICATION };
      },
    },
    {
      // RETIRED premise, INVERTED check (QF-20260901-385): the prior 'uploadScreenAbsent'
      // check's own failure message already admitted its no-upload-route premise "may be
      // stale" -- freshly measured 2026-09-02, /upload now responds 200 (confirmed live, not
      // inferred). Rather than leave a check permanently asserting a fact its own author
      // doubted, this now asserts the CURRENT reality (route reachable) so a future genuine
      // regression -- the route disappearing again -- is what turns this RED, not a stale
      // absence claim.
      name: 'uploadRouteReachable',
      async run(page, ctx) {
        const url = `${ctx.baseUrl}/upload`;
        const response = await page.goto(url).catch(() => null);
        const status = response?.status?.() ?? null;
        if (status === null || status >= 400) {
          throw new Error(`uploadRouteReachable: /upload responded ${status ?? 'no response'} -- expected a reachable route (measured 200 on 2026-09-02; re-verify against App.jsx if this persists)`);
        }
        return { url, renderedStateSummary: `upload route reachable (status=${status})`, matchedSelector: url, ...PREFLIGHT_VERIFICATION };
      },
    },
    {
      name: 'feedbackWidget',
      async run(page, ctx) {
        if (await page.locator('text=Feedback').count() === 0) {
          throw new Error('feedbackWidget: no Feedback widget rendered');
        }
        return { url: page.url?.() || ctx.baseUrl, renderedStateSummary: 'Feedback widget present' };
      },
    },
  ],
  stepOverrides: {},
  // SD-LEO-FIX-STAGE-WALK-PASSES-001 FR-5, SCOPE WIDENED per Solomon AMEND row 1b99bc14
  // (headless-render-confirmed 05:21:53Z): ALTIFYAI's own "Already have an account? Sign in"
  // toggle on /register navigates OFF-ORIGIN to this Clerk-hosted sign-in page -- reviewed
  // and allowlisted here (security-agent, EXEC-TO-PLAN evidence) so SEC-003 can accept it
  // without loosening the origin-equality check itself.
  authOrigins: ['https://neat-foxhound-5152.accounts.dev'],
  // QF-20260902-512: AltifyAI serves its production URL from a Clerk DEVELOPMENT instance
  // (feedback 9a76ac10, launch-readiness fact) -- confirmed corroborating measurement: the
  // fenced mailbox has never received a Clerk email across any walk (Adam IMAP census
  // 2026-09-02T08:2xZ). STEP 1 of this QF is the live, measured verification of the
  // +clerk_test convention on THIS instance before this flag is relied on for S23/S24 gating.
  authProviderTestMode: 'clerk_development',
});

export default {
  registerVenture,
  getVentureRegistration,
  getTestCredential,
  buildStepExecutor,
  getSignedOutJourneySteps,
  buildSignedOutStepExecutor,
  buildClerkTestModeIdentity,
  CLERK_TEST_MODE_FIXED_CODE,
};
