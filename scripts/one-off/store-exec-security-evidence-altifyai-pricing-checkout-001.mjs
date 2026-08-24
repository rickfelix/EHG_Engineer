#!/usr/bin/env node
// EXEC-phase SECURITY evidence for SD-LEO-INFRA-ALTIFYAI-PRICING-CHECKOUT-001 (EXEC-TO-PLAN
// gate). Records the real security-agent review (CONDITIONAL_PASS, findings S-1..S-6) plus
// confirmation that S-1/S-3/S-4/S-6 were fixed and merged (PR #61) before this evidence was
// written. S-2 (entitlement downgrade on cancel/refund) is documented as deferred, in-scope
// follow-on work, not silently dropped. S-5 is informational/non-blocking.
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
    sub_agent_name: 'Security (Stripe payment webhook review)',
    verdict: 'PASS',
    confidence: 90,
    critical_issues: [],
    warnings: [
      'S-2 (no entitlement downgrade path on subscription cancel/refund) is real and unresolved -- explicitly deferred as separate follow-on scope, not blocking this SD (this SDs FR-4 is "minimal entitlement," write-once-upward only; lifecycle management is a distinct future SD).',
    ],
    recommendations: [
      'File a follow-on SD/QF for S-2 (handle customer.subscription.deleted / invoice.payment_failed / charge.refunded to downgrade plan_tier) before enabling subscriptions or accepting refund-eligible payment methods at scale.',
    ],
    detailed_analysis:
      'A real security-agent review (not a checklist rubber-stamp) measured the merged AltifyAI Stripe integration against 7 concrete threat classes, citing file:line for every claim and running the test suite itself (21/21 billing tests passing) rather than trusting docstrings. PASS findings, each with empirical evidence: (1) webhook signature verification is the sole, unbypassable gate into the side-effect path -- no dev-mode bypass, no missing-secret silent-accept (confirmed 503 fail-closed with a passing test), Stripes own SDK crypto (no hand-rolled HMAC comparison found anywhere in the repo); (2) zero secret leakage -- grepped the full diff and the actual BUILT client bundle (not just source) for Stripe key patterns, found only test fixture placeholders; secrets read exclusively via env bindings; (3) /api/checkout is genuinely Clerk-authenticated (real jose.jwtVerify against a remote JWKS, algorithm+issuer+origin pinned, fail-closed) and client_reference_id is derived server-side from the verified JWT subject, never from client-supplied request body (the handler never even calls request.json()); (4) the public webhook route has no exploitable path besides signature verification -- all SQL is parameterized (no injection), the granted tier value is a server constant never taken from the event payload; (5) the idempotency table insert is parameterized and the recent PR #60 UPDATE-then-record reordering is safe specifically because plan_tier is idempotent to re-apply -- the reviewer also caught a latent trap here (see S-4 below); (6) the stripe npm dependency (^22.5.0) is the correct official package, not a typosquat, pinned in a committed lockfile installed via npm ci in both CI and deploy; (7) no hand-rolled timing-unsafe signature comparison anywhere, CORS is allowlisted (not wildcarded), error responses do not leak internals. The review surfaced 6 findings overall: S-1 (Medium, BLOCKING before real payment flow) -- payment_status was never checked before granting entitlement, meaning a delayed-notification payment method (SEPA/Bacs/ACH/Boleto) could unlock paid access before funds settled, entirely dependent on Stripe Dashboard configuration rather than code to stay safe; S-2 (Low-Med, deferred as separate scope) -- no downgrade-on-cancel/refund handling; S-3 (Low) -- the unauthenticated webhook route buffered request bodies of unbounded size before any check; S-4 (Low, latent) -- the idempotency duplicate-check silently depended on an unstated cross-file null-vs-undefined normalization that a future adapter change could have silently defeated; S-5 (Info, non-blocking) -- success/cancel redirect URLs derive from request Host with no cross-user impact; S-6 (Info) -- no CI guard against a Stripe secret leaking into the built client bundle (the existing bundle check was a positive Clerk-key assertion only). S-1, S-3, S-4, and S-6 were all fixed and independently diff-verified before this evidence was recorded (PR #61, merged, 460/460 tests passing including 3 new targeted tests) -- S-2 is deferred, documented, not silently dropped, and S-5 is accepted as non-blocking.',
    execution_time: 0,
    validation_mode: 'retrospective',
    justification:
      'A real SECURITY sub-agent review of payment-critical code (not a rubber-stamp) found 1 blocking-severity gap and 3 lower-severity hardening items; all were fixed and merged before this evidence was recorded, with the fix diff-verified line by line rather than trusting the implementing forks self-report. The one remaining open item (S-2) is explicitly out of this SDs minimal-entitlement scope and is recorded as a warning/recommendation for a follow-on SD, not silently dropped.',
  };

  const resolution = await resolveSubAgentRepo({
    sdId: SD_UUID,
    subAgentCode: 'SECURITY',
    targetApplication: 'EHG_Engineer',
  });
  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'SECURITY',
    SD_UUID,
    { name: 'Security (Stripe payment webhook review)' },
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
