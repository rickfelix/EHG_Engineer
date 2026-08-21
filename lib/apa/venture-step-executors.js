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

const registry = new Map();

/**
 * @param {string} ventureKey
 * @param {{preflightChecks?: Array<{name: string, run: (page, ctx) => Promise<{url:string, renderedStateSummary:string}>}>, stepOverrides?: Object<string, Function>}} config
 */
export function registerVenture(ventureKey, config = {}) {
  registry.set(ventureKey.toUpperCase(), {
    preflightChecks: config.preflightChecks || [],
    stepOverrides: config.stepOverrides || {},
  });
}

/**
 * @param {string} ventureKey
 * @returns {{preflightChecks: Array, stepOverrides: Object<string, Function>}}
 */
export function getVentureRegistration(ventureKey) {
  return registry.get((ventureKey || '').toUpperCase()) || { preflightChecks: [], stepOverrides: {} };
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
  const { stepOverrides } = getVentureRegistration(ventureKey);
  // Object.hasOwn guard (SECURITY finding SEC-002): bare bracket access on an inherited
  // step_id (e.g. "constructor", "toString") resolves to an Object.prototype member --
  // browser-executor.js's runJourneyWalk then treats that truthy, wrong-shaped value as a
  // real executor and returns completedAllSteps=true with zero navigation ever having
  // happened, fabricating a PASS that FR-3's PLAN-TO-LEAD gate reads as genuine. Matches the
  // guard already established in the sibling lib/apa/browser-executor.js.
  const override = Object.hasOwn(stepOverrides, step.step_id) ? stepOverrides[step.step_id] : undefined;
  if (override) return override;

  return async function fallbackExecutor(page, persona, ctx) {
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
    if (currentOrigin !== expectedOrigin) {
      throw new Error(`refusing to submit credentials for step "${step.goal || step.step_id}" -- navigated away from expected origin ${expectedOrigin} to ${currentUrl}`);
    }
    await page.fill('input[name="emailAddress"], input[type="email"]', credential.email);
    await page.fill('input[name="password"], input[type="password"]', credential.password);
    await page.click('button:has-text("Continue")');
    // Authenticated, but still no concrete mapping for THIS step's product-feature UI.
    throw new Error(`authenticated, but no verified UI mapping for step "${step.goal || step.step_id}" (step_id=${step.step_id}) -- venture-specific selector work not yet done, out of scope for this SD`);
  };
}

/**
 * AltifyAI preflight checks, grounded directly in this SD's own FR-0 live evidence
 * (strategic_directives_v2.metadata.fr0_falsifier_artifact) -- not invented.
 */
registerVenture('ALTIFYAI', {
  preflightChecks: [
    {
      name: 'land',
      async run(page, ctx) {
        await page.goto(ctx.baseUrl);
        if (await page.locator('text=Start free').count() === 0) {
          throw new Error('land: no "Start free" call-to-action rendered');
        }
        return { url: ctx.baseUrl, renderedStateSummary: 'landing page rendered with Start free CTA' };
      },
    },
    {
      name: 'signupFormRenders',
      async run(page, ctx) {
        const url = `${ctx.baseUrl}/register`;
        await page.goto(url);
        if (await page.locator('input[name="emailAddress"], input[type="email"]').count() === 0) {
          throw new Error('signupFormRenders: no email field rendered on /register');
        }
        return { url, renderedStateSummary: 'Clerk sign-up/sign-in form rendered' };
      },
    },
    {
      // Confirmed via a full route-map read of src/ui/App.jsx: ImageUploadComponent is
      // imported by zero screens. This check EXPECTS absence and fails if that changes,
      // so a real fix silently invalidates this specific check (by design, see header) --
      // treat a failure here as "go re-verify the route map", not "something broke".
      name: 'uploadScreenAbsent',
      async run(page, ctx) {
        const url = `${ctx.baseUrl}/upload`;
        const response = await page.goto(url).catch(() => null);
        const status = response?.status?.() ?? null;
        if (status !== null && status < 400) {
          throw new Error(`uploadScreenAbsent: /upload now responds ${status} -- re-verify against App.jsx, this check's premise (no upload route) may be stale`);
        }
        return { url, renderedStateSummary: `no upload route mounted (status=${status ?? 'no response'}), matches FR-0 finding` };
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
});

export default { registerVenture, getVentureRegistration, getTestCredential, buildStepExecutor };
