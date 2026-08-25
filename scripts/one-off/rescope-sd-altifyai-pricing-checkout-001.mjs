#!/usr/bin/env node
// SD-LEO-INFRA-ALTIFYAI-PRICING-CHECKOUT-001 -- LEAD-phase re-scope. The SD's as-submitted
// premise overstates existing infrastructure on 3 counts (Explore evidence 02666731):
// a fabricated "existing Stripe pattern" citation, a non-existent entitlement/usage-panel
// flip-switch, and unprovisioned Stripe secrets in the actual deploy target (AltifyAI's own
// Cloudflare Worker, not EHG_Engineer). Re-scoping before PLAN. Updates ALL structured fields
// together (title/description/scope/success_criteria/strategic_objectives/target_application) --
// established discipline this session after an earlier SD left a subset stale.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = '8529c112-3280-4d2b-9620-c3b6a848c55f';

const NEW_DESCRIPTION = `AltifyAI pricing + checkout live — first-dollar mechanics (W3 item 2)

## Type
infrastructure

**Provenance**: W3 GO (chairman A + "Go and ratify", decision e1da09a3, approved 16:29:12Z 08-24); wave item 31585063 rank-2, belt-refill per coordinator deficit ping e16379ea (active-rung-first: V1 first-dollar rung). Re-scoped at LEAD 2026-08-24 (Explore evidence 02666731) after the submitted premise was found to overstate existing infrastructure on 3 counts.

## Original premise -- CONFIRMED TRUE (no payment path exists)
AltifyAI is genuinely live (site, Clerk auth -- src/auth/clerk.js, fixed by 2 completed SDs 08-17) with NO payment path: zero matches for "stripe"/"checkout"/"pricing"/"webhook" across the AltifyAI repo's src/, lib/, scripts/, migrations/; no stripe dependency in package.json.

## Original premise -- FABRICATED (measured, not assumed)
- FR-2 cited "the stack's existing Stripe webhook posture in api/webhooks/stripe.js" as a pattern to follow. This file does not exist anywhere in the portfolio -- searched the AltifyAI repo, apexniche-ai (the cited structural model), and the main ehg platform repo (app/api/webhooks/ has only a github webhook route). No evidence this file ever existed. This is greenfield Stripe integration, not "wire up an existing pattern."
- FR-3 assumed "the usage-panel machinery is live" so a payment success could "flip" the user's tier/limits. Zero matches for "usage.panel"/"entitlement"/"tier.limit"/"usageLimit" anywhere in the AltifyAI repo. No entitlement system exists to flip -- it needs to be built (minimal, e.g. a D1 tier field + gate check), not wired to an existing switch.
- No STRIPE_WEBHOOK_SECRET exists anywhere. Only a STRIPE_TEST_* key NAME is visible, and that is in EHG_Engineer's own dotenv context -- NOT the AltifyAI Worker's own wrangler secret store, which is where it actually needs to live for the deployed app to use it. Left unstated, this SD would have silently blocked on secret provisioning mid-EXEC.

## Confirmed real (not stale)
The retrofit SD dependency (FR-4's coordination point) is real and current: SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001 is status=active, phase=EXEC, with an Adam-amended FR-5 to flip AltifyAI's launch_mode/launched_at fields from measured live-state evidence. The sequencing note ("blocks go-live RECORDING, not checkout BUILDING, so this proceeds in parallel by design") is accurate.

## Scope (one SD, cross-repo: AltifyAI app primarily, EHG_Engineer config secondarily)
- FR-1: Pricing surface: one simple paid tier presented on the live AltifyAI site; price point proposed from measured venture evidence (verify PBN scoring data actually exists and is queryable before citing it -- do not assume), chairman-fenced if >LOW consequence per the SD's own success criteria.
- FR-2: Stripe secret provisioning: get real Stripe keys (test first, live only after checkout is verified working end-to-end in test mode) provisioned into the AltifyAI Cloudflare Worker's own secret store (wrangler secret put), not just referenced from EHG_Engineer's dotenv context. This is a genuine prerequisite, not an assumption.
- FR-3: Checkout: Stripe Checkout session creation, success/cancel routes, webhook handler with signature verification -- built new (no existing pattern to follow), no card data touching AltifyAI's own surfaces.
- FR-4: Minimal entitlement: a tier/paid field (D1 schema addition) that a successful webhook flips, and a gate check somewhere in the app that reads it -- built new, not "wired to existing usage-panel machinery" (none exists).
- FR-5: Revenue recording: payment events land in a venture-attributed ledger row, coordinated with SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001's (currently active/EXEC) stage-gate wiring for the go-live stamp.
- FR-6: Fixtures: checkout session created; webhook signature verified (both valid and invalid-signature cases); entitlement flip on paid; declined/canceled paths clean; Stripe test-mode end-to-end proven before any live-key provisioning.

## Out of scope
Customer acquisition (item 3); demand loop (item 4); multi-tier pricing; live Stripe key provisioning until test-mode checkout is fully verified working.

## Success criteria
- Stripe test-mode secrets are provisioned in the AltifyAI Worker's own secret store (not just referenced elsewhere), verified via a real test-mode checkout completing end-to-end.
- A real user can pay (test mode first, live only after chairman is informed of the price point) on the live site and receive entitlement; the payment is venture-attributed in the retrofit SD's ledger.
- Chairman informed of the price point before public/live-key exposure.
`;

const success_criteria = [
  { measure: '[VERIFIED]', criterion: 'Stripe test-mode secrets are provisioned in the AltifyAI Worker\'s own secret store (not just referenced elsewhere), verified via a real test-mode checkout completing end-to-end.' },
  { measure: '[VERIFIED]', criterion: 'A real user can pay (test mode first, live only after chairman is informed of the price point) on the live site and receive entitlement; the payment is venture-attributed in the retrofit SD\'s ledger.' },
  { measure: '[VERIFIED]', criterion: 'Chairman informed of the price point before public/live-key exposure.' },
];

const strategic_objectives = [
  'Build genuinely new Stripe checkout + minimal entitlement infrastructure for AltifyAI (no existing pattern or flip-switch to reuse, contrary to the original submission)',
  'Provision Stripe secrets correctly into the AltifyAI Worker\'s own deploy target, test-mode first, before any live-key exposure',
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
    rescope_note: {
      rescoped_at: new Date().toISOString(),
      reason: 'Submitted premise overstated existing infrastructure on 3 counts: a fabricated "existing Stripe webhook pattern" citation (api/webhooks/stripe.js does not exist anywhere in the portfolio), a non-existent entitlement/usage-panel flip-switch (no tier/limits system exists to flip), and unprovisioned Stripe secrets in the actual deploy target (AltifyAI\'s own Cloudflare Worker, not EHG_Engineer\'s dotenv context). The core payment-path-missing premise and the retrofit-SD sequencing dependency were both confirmed real. See Explore evidence 02666731.',
    },
  };

  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({
      description: NEW_DESCRIPTION,
      scope: NEW_DESCRIPTION.split('\n')[0],
      success_criteria,
      strategic_objectives,
      metadata: newMetadata,
    })
    .eq('id', SD_UUID);
  if (updateErr) throw new Error(`update failed: ${updateErr.message}`);

  console.log('SD re-scoped successfully. target_application left unchanged (EHG_Engineer runs the LEO orchestration; actual FR-1..6 code changes land in the separate altifyai repo/worktree during EXEC).');
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
