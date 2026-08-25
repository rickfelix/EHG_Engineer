#!/usr/bin/env node
// SD-LEO-INFRA-ALTIFYAI-PRICING-CHECKOUT-001 -- smoke_test_steps must be {instruction,
// expected_outcome} objects (SMOKE_TEST_SPECIFICATION gate requirement), matching the
// corrected LEAD scope (greenfield Stripe integration, no existing pattern to follow).
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = '8529c112-3280-4d2b-9620-c3b6a848c55f';

const smoke_test_steps = [
  {
    instruction: 'Provision STRIPE_SECRET_KEY (test mode) and STRIPE_WEBHOOK_SECRET into the AltifyAI Cloudflare Worker\'s own secret store via `wrangler secret put`, then confirm the deployed Worker can read them.',
    expected_outcome: 'The Worker\'s Stripe client initializes successfully in test mode; no secret is committed to the repo or logged.',
  },
  {
    instruction: 'Create a Stripe Checkout session in test mode for the single paid tier and complete it with a Stripe test card.',
    expected_outcome: 'The checkout session completes successfully, redirecting to the configured success route.',
  },
  {
    instruction: 'Send a real Stripe test-mode webhook event (via the Stripe CLI or dashboard test-event tool) to the webhook endpoint, both with a valid signature and with a deliberately invalid signature.',
    expected_outcome: 'The valid-signature event is accepted and processed; the invalid-signature event is rejected (4xx), proving signature verification is real, not a no-op.',
  },
  {
    instruction: 'After a successful test-mode payment webhook is processed, query the user\'s entitlement/tier field directly.',
    expected_outcome: 'The field reflects the paid tier -- proving the new entitlement flip (built fresh, since no existing usage-panel machinery was found) actually works end-to-end.',
  },
  {
    instruction: 'Complete a Stripe test-mode checkout using a card that triggers a decline, and separately cancel a checkout session before completion.',
    expected_outcome: 'Both paths leave the user\'s entitlement unchanged (still unpaid tier) and produce no ledger row, confirming the decline/cancel paths are clean.',
  },
];

async function run() {
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({ smoke_test_steps })
    .eq('id', SD_UUID);
  if (error) throw new Error(`update failed: ${error.message}`);
  console.log('smoke_test_steps set:', smoke_test_steps.length, 'steps');
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
