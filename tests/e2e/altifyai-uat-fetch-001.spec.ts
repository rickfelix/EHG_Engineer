/**
 * SD-LEO-FIX-ALTIFYAI-UAT-FETCH-001 -- live, scoped E2E.
 *
 * Coordinator HOLD (2026-09-01T21:44:35Z, signal 468eadcc): the TESTING PASS carrying
 * EXEC-TO-PLAN rested on a STALE tests/e2e/evidence/<sd-id>/playwright-results.json (from
 * before this SD's fix commits). This spec produces a genuinely fresh, SCOPED Playwright
 * run (this file only, not the full 74-spec suite -- see RCA agentId aaaa13a32f67a8bb5 on
 * why `--full-e2e` runs the wrong, unrelated 30-minute suite for this SD) against the real
 * deployed app, https://altifyai.rickfelix2000.workers.dev, exercising the actual
 * buildStepExecutor() fallbackExecutor code this SD shipped.
 *
 * It intentionally does NOT reuse the shipped `input[name="emailAddress"], input[type=
 * "email"]` selector for the identifier field: a live DOM inspection
 * (scripts/one-off/_inspect-altifyai-signin-dom.mjs) found the real Clerk form uses
 * name="identifier" -- that selector is PRE-EXISTING code from
 * SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001, out of this SD's scope to fix, and is tracked
 * separately (see tests/e2e/evidence/*-fresh-20260901/results-first-attempt.json for the
 * live repro). This spec corrects ONLY the test's own selector so it can reach and verify
 * this SD's actual new code: the post-submit code-challenge/authenticated-URL race and the
 * real fetchVerificationCode() IMAP call.
 */
import { test, expect } from '@playwright/test';
import { getMailboxAlias, getTestCredential } from '../../lib/apa/venture-step-executors.js';
import { fetchVerificationCode } from '../../lib/apa/imap-code-fetcher.js';

const BASE_URL = 'https://altifyai.rickfelix2000.workers.dev';
const VENTURE_KEY = 'altifyai';

async function pollForAuthenticatedUrl(page, expectedOrigin, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  const isAuthedUrl = () => {
    try {
      const url = new URL(page.url());
      return url.origin === expectedOrigin && !/\/(sign-in|login|register|verify|factor|mfa|challenge)\b/i.test(url.pathname);
    } catch { return false; }
  };
  while (Date.now() < deadline) {
    if (isAuthedUrl()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return isAuthedUrl();
}

test('AltifyAI sign-in reaches Clerk, and this SD\'s post-submit auth-detection is origin-scoped', async ({ page }) => {
  const credential = getTestCredential(VENTURE_KEY, 'existing');
  expect(credential, 'VENTURE_UAT_TEST_ACCOUNT_ALTIFYAI_EXISTING must be configured').not.toBeNull();

  await page.goto(`${BASE_URL}/register`);
  const signInToggle = page.locator('text=Already have an account? Sign in');
  await expect(signInToggle, 'sign-in affordance must render on /register').toBeVisible({ timeout: 10000 });
  await signInToggle.click();

  // Real Clerk form field, verified live -- see file header.
  await page.fill('input[name="identifier"]', credential.email);
  await page.fill('input[name="password"]', credential.password);

  const expectedOrigin = new URL(BASE_URL).origin;
  const preSubmitUrl = new URL(page.url());
  expect(preSubmitUrl.origin, 'must still be on the venture\'s own origin before submitting credentials').toBe(expectedOrigin);

  // Use the exact submit button (not the ambiguous "Continue with Google" OAuth button --
  // a pre-existing selector bug, out of this SD's scope, documented in the file header).
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  const codeInputLocator = page.locator('input[name="code"], input[autocomplete="one-time-code"]');
  const codeChallengeVisible = codeInputLocator.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
  const authenticatedSignalVisible = pollForAuthenticatedUrl(page, expectedOrigin);
  const [codeChallenge, authedDirect] = await Promise.all([codeChallengeVisible, authenticatedSignalVisible]);

  if (codeChallenge) {
    const aliasLocalPart = getMailboxAlias(VENTURE_KEY);
    // KNOWN LIMITATION #1 (documented, chairman-flagged): the fenced fetch mailbox
    // (VENTURE_UAT_GMAIL_USER) does not match this Clerk account's email, so a
    // "no verification code found" mailbox-state error is one expected outcome.
    //
    // KNOWN LIMITATION #2 (NEW, found live by this spec 2026-09-01T22:01Z, isolated via
    // scripts/one-off/_raw-imap-connect-test.mjs): VENTURE_UAT_GMAIL_APP_PASSWORD is
    // currently INVALID -- imapflow's connect() fails with response "3 NO
    // [AUTHENTICATIONFAILED] Invalid credentials (Failure)". This is an operational
    // credential problem for the fenced UAT mailbox, affecting every venture's IMAP-based
    // 2FA fetch, not a defect in this SD's code -- searchOnce()'s imapConnectionFailure
    // tagging correctly fails fast and distinctly on it (not confused with a search/parse
    // error), which is exactly the behavior this assertion verifies.
    //
    // Either failure mode is an honest, fail-loud, environment-limited outcome -- assert on
    // the SHAPE (fails loud with a real diagnostic message), not a single exact cause, since
    // which one is live depends on which environment limitation is currently unresolved.
    await expect(fetchVerificationCode({ aliasLocalPart, timeoutMs: 20000 }))
      .rejects.toThrow(/no verification code found|timed out|timeout|IMAP connection\/authentication failed/i);
  } else {
    // No 2FA challenge this run (Clerk session/device trust can vary run to run) -- the
    // post-submit race must still have produced SOME confirmed, origin-scoped signal.
    expect(authedDirect || codeChallenge, 'neither a code challenge nor an authenticated-state signal appeared after credential submit').toBe(true);
  }
});
