/**
 * Auth setup for EHG App browser tests.
 * Logs in and saves storage state for reuse by other tests.
 *
 * SD-LEO-TESTING-STRATEGY-REDESIGN-ORCH-001-C
 */
import { test as setup, expect } from '@playwright/test';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
dotenv.config({ path: '.env.test' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const authFile = join(__dirname, '.auth', 'user.json');

// SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-7: root-caused the standing waitForURL timeout by
// diffing against tests/uat/setup/global-auth.js, a sibling script proven to authenticate
// against this SAME app. Two independent defects, both fixed by porting that proven pattern:
//
// 1. SELECTOR RIGIDITY: getByRole('textbox', {name:'Email'}) is a single, exact-accessible-
//    name match. If the real login form doesn't expose that literal name (placeholder-only
//    label, a different aria-label, etc.), .fill() finds nothing and the whole chain never
//    reaches waitForURL at all -- the "waitForURL timeout" symptom was a downstream echo of an
//    upstream selector miss, not evidence the timeout itself was wrong. global-auth.js instead
//    tries a small ordered list of selectors and uses whichever one actually matches.
// 2. POSITIVE-ONLY waitForURL: a single "wait for the success pattern" collapses every distinct
//    failure mode (wrong credentials, a validation toast, a slow redirect, a genuine outage)
//    into the identical generic timeout, with no error text captured. global-auth.js races a
//    negative URL predicate (left /login) against an error/alert selector appearing, so a
//    credential rejection surfaces as its own toast text instead of a blind timeout.
//
// NOT YET LIVE-VERIFIED against a running dev server in this pass (see PRD FR-7 for the
// explicit flag) -- this is a mechanical, evidence-based port of a pattern already proven
// against the same app, not a guess, but CLAUDE_EXEC's own rule is to say so plainly rather
// than claim an unverified pass.
const EMAIL_SELECTORS = ['#signin-email', 'input[type="email"]', 'input[name="email"]', '[data-testid="email-input"]'];
const PASSWORD_SELECTORS = ['#signin-password', 'input[type="password"]', 'input[name="password"]', '[data-testid="password-input"]'];
const SIGNIN_SELECTORS = ['button:has-text("Sign In")', 'button:has-text("Log In")', 'button:has-text("Login")', 'button[type="submit"]', '[data-testid="signin-button"]'];
const ERROR_SELECTOR = '[role="alert"], .destructive, [class*="toast"]';

async function firstMatching(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count() > 0) return locator;
  }
  return null;
}

setup('authenticate', async ({ page }) => {
  // Check if app is running
  try {
    const response = await page.goto('/login', { timeout: 10000 });
    if (!response || response.status() >= 500) {
      setup.skip(true, 'EHG app not running at ' + (process.env.BASE_URL || 'http://localhost:8080'));
      return;
    }
  } catch {
    setup.skip(true, 'EHG app not reachable — skipping browser tests');
    return;
  }

  const email = process.env.TEST_USER_EMAIL || 'admin@ehg.com';
  const password = process.env.TEST_USER_PASSWORD || 'test-password';

  const emailField = await firstMatching(page, EMAIL_SELECTORS);
  if (!emailField) throw new Error('[auth.setup] Could not find email input field with any known selector — the login form markup may have changed; update EMAIL_SELECTORS.');
  const passwordField = await firstMatching(page, PASSWORD_SELECTORS);
  if (!passwordField) throw new Error('[auth.setup] Could not find password input field with any known selector — the login form markup may have changed; update PASSWORD_SELECTORS.');
  await emailField.fill(email);
  await passwordField.fill(password);

  const signInButton = await firstMatching(page, SIGNIN_SELECTORS);
  if (!signInButton) throw new Error('[auth.setup] Could not find sign-in button with any known selector — the login form markup may have changed; update SIGNIN_SELECTORS.');

  // Race a NEGATIVE "left /login" predicate against an error/alert appearing, instead of only
  // waiting for the specific success pattern -- a credential rejection surfaces its real error
  // text instead of a blind, undifferentiated timeout.
  await signInButton.click();
  await Promise.race([
    page.waitForURL((url) => !url.toString().includes('/login'), { timeout: 15000 }),
    page.waitForSelector(ERROR_SELECTOR, { timeout: 15000, state: 'visible' }),
  ]);

  // Only inspect ERROR_SELECTOR when the URL-left-/login race branch did NOT win --
  // the broad selector (.destructive, [class*="toast"]) can otherwise false-match an
  // unrelated success toast or a11y live-region on the post-login landing page and
  // report "Authentication failed" on a genuinely successful sign-in (adversarial
  // review finding, /ship Deep-tier gate).
  if (page.url().includes('/login')) {
    const errorElement = page.locator(ERROR_SELECTOR).first();
    if (await errorElement.count() > 0) {
      const errorText = await errorElement.textContent().catch(() => null);
      throw new Error(`[auth.setup] Authentication failed: ${errorText || '(error element present, no text)'}`);
    }
    throw new Error('[auth.setup] Authentication failed — still on /login after sign-in with no error element visible. Verify TEST_USER_EMAIL/TEST_USER_PASSWORD are correct.');
  }

  // Save storage state
  await page.context().storageState({ path: authFile });
});
