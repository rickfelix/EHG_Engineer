#!/usr/bin/env node
// SD-LEO-INFRA-ALTIFYAI-PRICING-CHECKOUT-001 -- round-2 sync after the prospective TESTING
// review (before EXEC) found 5 blocking premise errors in the round-1 PRD/SD scope. Updates
// description/scope/success_criteria/strategic_objectives/smoke_test_steps/metadata together
// (established discipline this session -- a partial rescope leaves stale fields /heal has to
// catch later).
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = '8529c112-3280-4d2b-9620-c3b6a848c55f';

const NEW_DESCRIPTION = `AltifyAI pricing + checkout live — first-dollar mechanics (W3 item 2)

## Type
infrastructure

**Provenance**: W3 GO (chairman A + "Go and ratify", decision e1da09a3, approved 16:29:12Z 08-24); wave item 31585063 rank-2, belt-refill per coordinator deficit ping e16379ea (active-rung-first: V1 first-dollar rung). Re-scoped at LEAD 2026-08-24 (Explore evidence 02666731) after the submitted premise overstated existing infrastructure. Re-scoped AGAIN at PLAN 2026-08-24 after a prospective TESTING review (before any code written) measured 5 further blocking premise errors in the round-1 PRD.

## Round-1 LEAD findings (confirmed real)
No payment path exists in AltifyAI. Auth is genuinely live (Clerk). The "existing Stripe webhook pattern" citation was fabricated (file never existed anywhere in the portfolio).

## Round-2 PLAN findings (prospective TESTING review, before EXEC)
- FR-4 (round 1) claimed "no entitlement system exists" -- FALSE. \`users.plan_tier\` already exists (migrations/0002), already written at registration, already read elsewhere, pinned by 8 tests. A new column would create dual representation of one fact. Corrected: reuse plan_tier, add a value CHECK constraint (none exists today -- any string is currently accepted), add the missing gate reader.
- FR-1 (round 1) cited "PBN scoring data" for price-point evidence -- measured PBN_NOT_SCORED for AltifyAI's venture row, and PBN is a pass/park merit verdict, not a numeric price signal. No automated pricing-evidence source exists. Corrected: price point is set by explicit chairman decision, confirmed before public exposure.
- FR-5 (round 1) claimed coordination with SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001's "stage-gate/go-live-stamp wiring" -- FALSE; that SD's actual PRD has zero revenue/ledger scope (it's entirely about recordGateAttempt()/eva_stage_gate_attempts). No ledger table exists anywhere either. Dropped from this SD's scope entirely rather than fabricating a cross-repo ledger spec.
- FR-2 (round 1) self-contradicted on reading EHG_Engineer's Stripe test key. Corrected: reading it solely as a provisioning INPUT (piped into \`wrangler secret put\`) is fine; reading it at Worker runtime is what's forbidden.
- TR-3 (round 1) specified \`stripe.webhooks.constructEvent()\` -- measured this throws under this Worker's wrangler.toml (no nodejs_compat flag, so node:crypto is unavailable). Corrected to \`constructEventAsync()\` + \`Stripe.createSubtleCryptoProvider()\` + \`Stripe.createFetchHttpClient()\`.
- NEW: Cloudflare secret provisioning is not automatable in this environment -- wrangler is unauthenticated (measured: \`wrangler whoami\` fails), and AltifyAI's only CI workflow has no deploy step. Carved out as a human-action prerequisite (matching the existing live-key-provisioning precedent), not a completion blocker.
- NEW: webhook route must be \`/api/webhooks/stripe\` exactly, matching wrangler.toml's \`run_worker_first = ["/api/*"]\` -- any other path silently 200s via the SPA fallback instead of reaching the handler.
- NEW: checkout-session creation must carry the user's identifier via client_reference_id/metadata (webhook has no Clerk principal); webhook processing must be idempotent against Stripe's event id (Stripe retries non-2xx responses).

## Scope (corrected, cross-repo: AltifyAI app primarily, EHG_Engineer config secondarily)
- FR-1: Pricing surface, chairman-set price point (not PBN-derived), confirmed before public exposure.
- FR-2: Stripe secret provisioning -- EXEC delivers code + documented provisioning commands; actual \`wrangler secret put\`/deploy execution is a human-action follow-up (Workers-scoped CLOUDFLARE_API_TOKEN required, not present in this environment).
- FR-3: Checkout + webhook, built for the Workers runtime specifically (constructEventAsync, fetch http client, correct route path).
- FR-4: Reuse existing users.plan_tier (no new migration for the field itself); add a value CHECK constraint; add the missing gate reader; idempotent against Stripe event id.
- FR-5: Fixtures -- Web-Crypto-signed payloads as the primary signature-verification test mechanism (no live Stripe CLI/public URL available in this environment); live-delivery verification and live-key provisioning both deferred as documented follow-ups.

## Out of scope
Customer acquisition (item 3); demand loop (item 4); multi-tier pricing; live Stripe key provisioning; actual Cloudflare deployment/secret execution (human-action follow-up); a cross-repo revenue ledger (no target table exists, dropped rather than fabricated).

## Success criteria
- Checkout, webhook verification (Workers-compatible SDK path), and entitlement flip work end-to-end in local/CI tests using Stripe test-mode credentials and Web-Crypto-signed fixtures.
- users.plan_tier is reused correctly (no duplicate field), gated by a real value constraint and a real behavior-changing reader.
- Chairman confirms the price point before public/live-key exposure.
- Cloudflare secret provisioning/deployment commands are documented as an explicit human-action follow-up, not silently attempted or silently dropped.
`;

const success_criteria = [
  { measure: '[VERIFIED]', criterion: 'Checkout, webhook verification (Workers-compatible SDK path), and entitlement flip work end-to-end in local/CI tests using Stripe test-mode credentials and Web-Crypto-signed fixtures.' },
  { measure: '[VERIFIED]', criterion: 'users.plan_tier is reused correctly (no duplicate field), gated by a real value constraint and a real behavior-changing reader.' },
  { measure: '[VERIFIED]', criterion: 'Chairman confirms the price point before public/live-key exposure.' },
  { measure: '[VERIFIED]', criterion: 'Cloudflare secret provisioning/deployment commands are documented as an explicit human-action follow-up, not silently attempted or silently dropped.' },
];

const strategic_objectives = [
  'Build genuinely new Stripe checkout + minimal entitlement infrastructure for AltifyAI, correctly targeting the Cloudflare Workers runtime (not the default Node-oriented Stripe SDK path)',
  'Reuse existing plan_tier infrastructure instead of creating a duplicate entitlement representation',
  'Carve out Cloudflare deployment/secret provisioning as an explicit human-action follow-up rather than a silent EXEC failure or a silently dropped requirement',
];

const smoke_test_steps = [
  {
    instruction: 'Run the webhook signature verification unit test using a Web-Crypto-signed fixture payload (valid signature) and a deliberately tampered one (invalid signature).',
    expected_outcome: 'The valid-signature fixture is accepted and processed; the invalid-signature fixture is rejected (4xx) -- proving verification is real, not a no-op, without requiring a live Stripe-delivered event.',
  },
  {
    instruction: 'Create a Stripe Checkout session in test mode for the single paid tier, carrying a test user id via client_reference_id, and complete it with a Stripe test card.',
    expected_outcome: 'The checkout session completes successfully, redirecting to the configured success route.',
  },
  {
    instruction: 'Deliver the resulting webhook event fixture to the handler, then query users.plan_tier directly for the correlated user.',
    expected_outcome: 'plan_tier reflects the paid value for the correct user -- proving the reused field, not a new one, is what actually flips.',
  },
  {
    instruction: 'Redeliver the identical webhook event id a second time.',
    expected_outcome: 'No double-processing occurs -- the idempotency guard rejects/no-ops the duplicate.',
  },
  {
    instruction: 'Attempt to write an unrecognized plan_tier value directly (bypassing the webhook) and separately complete a decline/cancel checkout flow.',
    expected_outcome: 'The unrecognized value is rejected by the new CHECK constraint/allowlist; the decline/cancel paths leave plan_tier unchanged.',
  },
];

async function run() {
  const supabase = createSupabaseServiceClient();

  const { data: current, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('id', SD_UUID)
    .single();
  if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

  const newMetadata = {
    ...current.metadata,
    rescope_note_round2: {
      rescoped_at: new Date().toISOString(),
      reason:
        'Prospective TESTING review (before EXEC) measured 5 blocking premise errors in the round-1 PRD: a fabricated "no entitlement field exists" claim (users.plan_tier already exists), an unusable PBN pricing-evidence source (measured PBN_NOT_SCORED, non-numeric verdict), a false retrofit-SD coordination claim (that SD has zero revenue/ledger scope) with no ledger table anywhere, a self-contradictory secret-reading rule, and a Workers-runtime-incompatible webhook signature verification method (constructEvent throws without nodejs_compat). Also newly found: Cloudflare secret provisioning/deployment is not automatable in this environment (wrangler unauthenticated, no CI deploy step) -- carved out as a human-action follow-up.',
    },
  };

  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({
      description: NEW_DESCRIPTION,
      scope: NEW_DESCRIPTION.split('\n')[0],
      success_criteria,
      strategic_objectives,
      smoke_test_steps,
      metadata: newMetadata,
    })
    .eq('id', SD_UUID);
  if (updateErr) throw new Error(`update failed: ${updateErr.message}`);

  console.log('SD round-2 sync complete (description/scope/success_criteria/strategic_objectives/smoke_test_steps/metadata).');
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
