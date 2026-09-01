import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const scope = `IN SCOPE:
- New module: an IMAP-based Gmail code fetcher (net-new -- no existing IMAP/email utility in either repo) reading VENTURE_UAT_GMAIL_USER / VENTURE_UAT_GMAIL_APP_PASSWORD, connecting to imap.gmail.com:993, finding the newest Clerk verification email addressed to the +altifyai-uat alias, and extracting the 6-digit code.
- Wiring into lib/apa/venture-step-executors.js's fallbackExecutor (lines ~109-166): after the existing password submit (line 163), detect whether Clerk presents a verification-code challenge; if so, invoke the fetcher, fill the code, submit, and only then set ctx.authenticated = true. If no challenge appears, behavior is unchanged from today.
- Negative-acceptance test: an automated fixture proving the fetcher returns zero results for mail NOT addressed to +altifyai-uat (R2-c).
- Fail-loud timeout/polling logic with mailbox state in the error when no matching email arrives in time.
OUT OF SCOPE:
- Any change to prod Clerk auth configuration or the altifyai app's own auth code (altifyai/src/auth/clerk.js) -- read-only email consumption only.
- The pre-minted-token CI probe (altifyai deploy.yml post-deploy-signed-in-uat step) -- separate mechanism, untouched.
- Venture-specific post-login UI-mapping work (the "no verified UI mapping" throw at line 165 stays, just moved past the auth gate) -- that is explicitly flagged out of scope in the existing code comment and is a different SD's concern.
- Clerk TEST MODE -- stays the documented fallback if IMAP fetch is unavailable; this SD does not remove or replace it.`;

const smoke_test_steps = [
  {
    step_number: 1,
    instruction: "With VENTURE_UAT_GMAIL_USER/VENTURE_UAT_GMAIL_APP_PASSWORD set, run the AltifyAI journey-walk UAT harness (or a targeted script invoking the new fetcher) against a step requiring Clerk sign-in.",
    expected_outcome: "The harness reaches the password-submit step, and if Clerk presents a 6-digit email-code challenge, the fetcher retrieves the newest +altifyai-uat-addressed code and the login proceeds past that challenge (ctx.authenticated only flips true after this)."
  },
  {
    step_number: 2,
    instruction: "Run the negative-acceptance fixture: point the fetcher at a mailbox/fixture containing mail NOT addressed to the +altifyai-uat alias.",
    expected_outcome: "The fetcher returns zero results -- it never returns a code from an unrelated or wrong-alias email (R2-c)."
  },
  {
    step_number: 3,
    instruction: "Grep the fetcher's own source and its call sites for the literal credential value or the fetched 6-digit code being passed to console.log/logger at any level.",
    expected_outcome: "No occurrence -- the credential and the fetched code are never logged, per the FENCES constraint."
  }
];

async function main() {
  const { error } = await supabase.from('strategic_directives_v2')
    .update({ scope, smoke_test_steps })
    .eq('sd_key', 'SD-LEO-FIX-ALTIFYAI-UAT-FETCH-001');
  if (error) throw error;
  console.log('OK updated scope + smoke_test_steps');
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
