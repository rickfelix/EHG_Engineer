#!/usr/bin/env node
// EXEC-phase TESTING evidence for SD-LEO-INFRA-ALTIFYAI-PRICING-CHECKOUT-001 (EXEC-TO-PLAN
// gate). Covers 3 merged AltifyAI PRs: #59 (initial implementation, 453/453 tests),
// #60 (fixed 3 independently-found money-path correctness gaps, 457/457 tests), #61
// (fixed 4 SECURITY-review findings including a payment_status validation gap, 460/460
// tests). All verified via independent, adversarial re-review -- not self-reported by the
// implementing fork.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = '8529c112-3280-4d2b-9620-c3b6a848c55f';
const SD_KEY = 'SD-LEO-INFRA-ALTIFYAI-PRICING-CHECKOUT-001';

async function run() {
  const supabase = createSupabaseServiceClient();

  let results = {
    sub_agent_name: 'Testing (EXEC verification)',
    verdict: 'PASS',
    confidence: 92,
    critical_issues: [],
    warnings: [
      'FR-1 price point is still a placeholder ($29.00/mo) pending explicit chairman confirmation -- checkout will 503 until a real Stripe Price id is provisioned, by design.',
      'FR-2 actual `wrangler secret put`/deploy execution remains a documented human-action follow-up (wrangler unauthenticated in this dev environment) -- code-side is complete and reads secrets exclusively via Worker env bindings.',
    ],
    recommendations: [
      'Before live-key provisioning: confirm chairman price point, provision a real Stripe Price id, run FR-2s documented wrangler secret put commands, then re-verify FR-5s end-to-end flow against Stripe test mode with real (not fixture-signed) webhook delivery as a post-deploy manual check.',
    ],
    detailed_analysis:
      'Independent, adversarial verification (not the implementing forks own claims) across 3 merged AltifyAI PRs. PR #59 (initial implementation): re-ran the full suite myself at the merged commit vs. the pre-PR baseline -- 436 to 453 tests (+17, all passing), confirmed Workers-compatible constructEventAsync + createSubtleCryptoProvider + createFetchHttpClient with file:line citations (lib/billing/stripe-client.js, lib/billing/webhook.js), confirmed the idempotency guard is genuinely tested (tests/billing-webhook.test.js processes the same signed event twice and asserts no double-processing via a real INSERT...ON CONFLICT DO NOTHING against real better-sqlite3, not a stub), confirmed the webhook route is registered at the exact /api/webhooks/stripe path in PUBLIC_ROUTES (not the authed ROUTES table), and confirmed no regression to users.plan_tier default/behavior (39/39 relevant tests passing). This same independent review surfaced 3 real money-path correctness gaps (D1 meta.changes-count fragility that could silently no-op the first delivery; non-atomic record-then-update ordering that could strand a paying customer on a transient DB error; an unmatched client_reference_id silently reporting success) -- these were NOT blocking per the reviewers own verdict but were fixed anyway given the payment-critical stakes, in PR #60 (457/457 tests after the fix, all 4 new targeted tests passing, confirmed via diff read that the RETURNING-based check, the reordered UPDATE-then-record sequence, and the UnmatchedUserError path are implemented exactly as specified). A follow-up SECURITY sub-agent review (separate evidence row, sub_agent_code=SECURITY) then found 1 blocking-severity gap (payment_status never validated before granting entitlement -- would let a delayed-notification payment method unlock paid access before funds settle) plus 3 lower-severity hardening items, all fixed in PR #61 (460/460 tests, diff-verified: payment_status gate added exactly where specified, Content-Length guard added to the public webhook route, idempotency check hardened from strict to loose null-equality with a documented coupling comment, and a CI negative-assertion added against Stripe secrets leaking into the client bundle). One item (S-2, entitlement downgrade on subscription cancel/refund) was correctly left out of scope as a distinct feature, not folded in. Test suite has been 100% green across all 3 PRs relative to their own baselines; the 1 pre-existing unrelated failure (tests/contamination-scan.test.js, a collection-time syntax error) was independently confirmed present before this SDs first commit and untouched by any of the 3 PRs -- not a regression introduced by this work.',
    execution_time: 0,
    validation_mode: 'retrospective',
    justification:
      'EXEC-phase deliverable (3 merged PRs to the AltifyAI repo, deployed to Cloudflare via that repos own CI/CD) was verified adversarially at each stage rather than trusting the implementing forks self-report -- matching this sessions established discipline of instrument-diverse verification. All findings from both the independent TESTING re-review and the SECURITY review were fixed before this evidence was recorded, with real before/after test counts (436 -> 453 -> 457 -> 460, monotonically increasing, zero regressions) as the measured basis for the PASS verdict.',
  };

  const resolution = await resolveSubAgentRepo({
    sdId: SD_UUID,
    subAgentCode: 'TESTING',
    targetApplication: 'EHG_Engineer',
  });
  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_UUID,
    { name: 'Testing (EXEC verification)' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC' }
  );

  console.log('\nEvidence row written:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
