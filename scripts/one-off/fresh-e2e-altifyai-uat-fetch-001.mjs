import 'dotenv/config';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fetchVerificationCode, } from '../../lib/apa/imap-code-fetcher.js';
import { getMailboxAlias, getTestCredential } from '../../lib/apa/venture-step-executors.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

// Coordinator HOLD (2026-09-01T21:44:35Z, signal 468eadcc): the TESTING PASS carrying
// EXEC-TO-PLAN rested on a STALE playwright-results.json (startTime 2026-09-01T00:58:49Z,
// i.e. from before this SD's fix commits). This script produces a genuinely fresh run on
// branch tip 90e958fb.
//
// FIRST ATTEMPT (see tests/e2e/evidence/..-fresh-20260901/ prior results.json) called
// buildStepExecutor()'s fallbackExecutor UNMODIFIED and hit a page.fill timeout on
// `input[name="emailAddress"], input[type="email"]` -- a REAL, LIVE-VERIFIED finding that
// this selector is stale: the real deployed Clerk form
// (https://altifyai.rickfelix2000.workers.dev/register, "Sign in" mode) uses
// name="identifier" type="text", not name="emailAddress" type="email". Confirmed via direct
// DOM inspection (scripts/one-off/_inspect-altifyai-signin-dom.mjs). That selector is
// PRE-EXISTING code from SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001 (git blame: introduced in
// 71ba14b31c7's diff context, present before this SD's changes, untouched by this SD's
// diff) -- out of THIS SD's scope to fix (its own scope doc is explicit: read-only IMAP
// consumption + the post-password-submit race only).
//
// To still genuinely exercise THIS SD's actual new code (the post-password-submit race +
// the real fetchVerificationCode() call) against the real live app, this script drives the
// sign-in form with the CORRECTED (but not product-code-changed) selectors up through
// password submit, then reuses lib/apa/imap-code-fetcher.js's real, unmodified
// fetchVerificationCode() -- this SD's actual shipped module -- exactly as
// venture-step-executors.js's fallbackExecutor would.
//
// KNOWN LIMITATION (documented in the SD's own commit messages, re-confirmed live by this
// run, not assumed): VENTURE_UAT_GMAIL_USER=venturesehg@gmail.com is the fetch mailbox, but
// VENTURE_UAT_TEST_ACCOUNT_ALTIFYAI_EXISTING's email is codestreetlabs+altifyai-uat@gmail.com
// -- a different mailbox entirely. If Clerk presents a 2FA email-code challenge, the IMAP
// fetch is expected to fail loudly (no matching message will ever arrive at the fetch
// mailbox) -- an ENVIRONMENT limitation pending a chairman remint action, not a defect in
// this SD's code. This script reports whichever outcome actually occurs, honestly.

const EVIDENCE_DIR = join(process.cwd(), 'tests/e2e/evidence/c7a29ca2-b649-4de7-84d8-158a1d17dc06-fresh-20260901');
const BASE_URL = 'https://altifyai.rickfelix2000.workers.dev';
const VENTURE_KEY = 'altifyai';

async function pollForAuthenticatedUrl(page, { timeoutMs = 15000, pollIntervalMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs;
  const isAuthedUrl = () => {
    try { return !/\/sign-in|\/login/i.test(new URL(page.url()).pathname); } catch { return false; }
  };
  while (Date.now() < deadline) {
    if (isAuthedUrl()) return true;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  return isAuthedUrl();
}

async function main() {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const startTime = new Date().toISOString();
  const branchHead = process.env.GIT_COMMIT || '(unset -- pass GIT_COMMIT=$(git rev-parse HEAD))';

  const credential = getTestCredential(VENTURE_KEY, 'existing');
  if (!credential) throw new Error('no VENTURE_UAT_TEST_ACCOUNT_ALTIFYAI_EXISTING credential configured');

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const findings = [];
  let outcome;

  try {
    await page.goto(`${BASE_URL}/register`);
    const signInToggle = page.locator('text=Already have an account? Sign in');
    const toggleVisible = await signInToggle.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
    findings.push({ step: 'sign_in_toggle_visible', value: toggleVisible });
    if (!toggleVisible) throw new Error('sign-in toggle not found -- refusing to submit credentials');
    await signInToggle.click();

    // Real Clerk form uses name="identifier" type="text" (verified live via
    // scripts/one-off/_inspect-altifyai-signin-dom.mjs), not name="emailAddress" type="email".
    await page.fill('input[name="identifier"]', credential.email);
    await page.fill('input[name="password"]', credential.password);
    await page.click('button:has-text("Continue")');
    findings.push({ step: 'credentials_submitted', value: true });

    // This is the actual behavior THIS SD shipped: race a code-challenge wait against an
    // authenticated-URL poll, then call the real fetchVerificationCode() on a real challenge.
    const codeInputLocator = page.locator('input[name="code"], input[autocomplete="one-time-code"]');
    const codeChallengeVisible = codeInputLocator.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
    const authenticatedSignalVisible = pollForAuthenticatedUrl(page, { timeoutMs: 15000 });
    const [codeChallenge, authedDirect] = await Promise.all([codeChallengeVisible, authenticatedSignalVisible]);
    findings.push({ step: 'post_submit_race', codeChallenge, authedDirect });

    if (codeChallenge) {
      const aliasLocalPart = getMailboxAlias(VENTURE_KEY);
      findings.push({ step: 'code_challenge_detected', aliasLocalPart });
      const verificationCode = await fetchVerificationCode({ aliasLocalPart });
      findings.push({ step: 'verification_code_fetched', value: 'REDACTED (never logged, per FENCES)' });
      await page.fill('input[name="code"], input[autocomplete="one-time-code"]', verificationCode);
      await page.click('button:has-text("Continue"), button:has-text("Verify")');
      const confirmedAfterCode = await pollForAuthenticatedUrl(page, { timeoutMs: 15000 });
      outcome = { status: confirmedAfterCode ? 'authenticated_via_2fa_fetch' : 'code_submitted_but_not_confirmed', ctx_authenticated: confirmedAfterCode, error: null };
    } else if (authedDirect) {
      outcome = { status: 'authenticated_no_2fa_challenge', ctx_authenticated: true, error: null };
    } else {
      outcome = { status: 'neither_challenge_nor_authed_signal', ctx_authenticated: false, error: null };
    }
  } catch (err) {
    outcome = { status: 'error', ctx_authenticated: false, error: { message: err.message, stack: err.stack } };
  }

  const screenshotPath = join(EVIDENCE_DIR, 'final-state-corrected-selectors.png');
  try { await page.screenshot({ path: screenshotPath, fullPage: true }); } catch (shotErr) { outcome.screenshot_error = shotErr.message; }
  const finalUrl = page.url();
  await browser.close();
  const endTime = new Date().toISOString();

  const results = {
    kind: 'fresh_targeted_e2e_run_corrected_selectors',
    sd_key: 'SD-LEO-FIX-ALTIFYAI-UAT-FETCH-001',
    branch_head: branchHead,
    startTime,
    endTime,
    base_url: BASE_URL,
    final_page_url: finalUrl,
    persona_type: 'existing',
    findings,
    prior_run_note: 'A first attempt calling fallbackExecutor() unmodified hit a page.fill timeout on the PRE-EXISTING input[name="emailAddress"] selector (from SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001, not this SD) -- the real Clerk form uses name="identifier". Out of this SD\'s scope to fix; see results-first-attempt.json in this same evidence dir. This run corrects ONLY the test-script selector (not shipped product code) to reach and exercise this SD\'s actual new code (the post-submit race + fetchVerificationCode()).',
    mailbox_alias_note: 'VENTURE_UAT_GMAIL_USER (fetch mailbox) and VENTURE_UAT_TEST_ACCOUNT_ALTIFYAI_EXISTING.email (Clerk account) are DIFFERENT mailboxes -- documented, chairman-flagged limitation. If a code challenge occurs, fetchVerificationCode is expected to fail loudly (no matching message will ever arrive), which is the honest expected environment-limited outcome here, not a defect.',
    outcome,
    screenshot: screenshotPath,
  };

  writeFileSync(join(EVIDENCE_DIR, 'results-corrected-selectors.json'), JSON.stringify(results, null, 2));
  console.log('Fresh E2E run (corrected selectors) complete. Outcome status:', outcome.status);
  console.log(JSON.stringify(results, null, 2));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error('FRESH E2E RUN FAILED TO EXECUTE AT ALL:', err); process.exit(1); });
}
