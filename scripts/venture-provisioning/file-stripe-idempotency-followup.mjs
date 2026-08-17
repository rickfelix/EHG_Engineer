#!/usr/bin/env node
/**
 * Durably captures the TESTING sub-agent's F1-R finding (fresh evidence row
 * 1f53468c, EXEC-TO-PLAN, SD-FDBK-ENH-EHG-OPERATING-COMPANY-001-A) as a
 * tech_debt feedback row, per the coordinator's "both-closures rule" ([ACK]
 * directive 549c3747): a scoped follow-up must land as a captured item, not
 * only prose in the handoff.
 *
 * Finding: provisionPaymentAccountSetup()'s Stripe Idempotency-Key fix
 * (commit eb0ec525b86) prevents duplicate Connect Express account creation
 * for same-day retries, but Stripe expires idempotency keys after 24h -- a
 * re-run more than a day after the first successful provision will still
 * create a second account. Inert today (no sk_test key configured, so FR-3
 * returns no_stripe_key_configured); the durable fix needs a persisted
 * ventures.stripe_account_id column to look up before creating, correctly
 * out of this SD's scope.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { emitFeedback } from '../../lib/governance/emit-feedback.js';

dotenv.config();

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const result = await emitFeedback({
    supabase,
    title: 'provisionPaymentAccountSetup(): Stripe idempotency key expires after 24h, duplicate account creation not fully closed',
    description: "lib/venture-provisioning/exec-boundary-readiness.js's provisionPaymentAccountSetup() passes a deterministic idempotencyKey (`venture-payment-account-setup-${ventureId}`) to stripe.accounts.create(), fixing duplicate-account creation for same-day re-runs (testing-agent finding F1, SD-FDBK-ENH-EHG-OPERATING-COMPANY-001-A). Stripe idempotency keys expire after 24 hours -- a re-run more than a day after the first successful provision will create a SECOND Connect Express account for the same venture. Narrowed, not closed. Inert today: no sk_test key is configured in the fleet environment, so FR-3 currently always returns {ok:false, reason:'no_stripe_key_configured'} and this code path has never actually executed against a real key. Durable fix: persist the created account's id (e.g. a ventures.stripe_account_id column) and look it up before calling accounts.create() again -- correctly scoped OUT of the originating SD (would need a migration). Re-verified live via mutation testing (testing-agent evidence row 1f53468c-ffd8-405e-afb6-f4dc17c57996) that the current fix genuinely narrows the defect class rather than being cosmetic.",
    category: 'tech_debt',
    severity: 'low',
    source_type: 'manual_feedback',
    sd_id: '74346a80-c7cb-474e-b068-152415a840f7', // feedback.sd_id is UUID, NOT the SD-KEY string (C-DB-2)
    dedup_key: 'lib/venture-provisioning/exec-boundary-readiness.js:stripe-idempotency-24h',
    metadata: {
      logged_via: 'file-stripe-idempotency-followup.mjs',
      source_location: 'lib/venture-provisioning/exec-boundary-readiness.js',
      originating_sd_key: 'SD-FDBK-ENH-EHG-OPERATING-COMPANY-001-A',
      originating_evidence_row: '1f53468c-ffd8-405e-afb6-f4dc17c57996',
      fix_commit: 'eb0ec525b86',
      defer_only: true,
    },
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => { console.error('Fatal error:', err.message); process.exit(1); });
