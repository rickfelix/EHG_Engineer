import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const smokeTestSteps = [
  {
    step_number: 1,
    instruction: "Set STAGE_GATE_PREDICATE_ARMED=on in leo_feature_flags, then call lib/marketing/publisher/index.js's publish() for a real (non-fixture) channel against a venture row with launch_mode != 'live' (e.g. current_lifecycle_stage=25, launch_mode='simulated' -- the real MarketLens shape) while real-shaped credentials are present for that channel.",
    expected_outcome: "publish() returns mode='mock' (never falls through to adapter.publish); zero rows appear in venture_channel_publish_ledger without the mock discriminator set.",
  },
  {
    step_number: 2,
    instruction: "Call email-campaigns.js's sendEmail() directly (not processStep()) for the same below-go-live venture.",
    expected_outcome: "sendEmail() refuses with a SEND_REFUSAL token; no real email is sent (verify via the mock/recording transport, zero calls to the real Resend client).",
  },
  {
    step_number: 3,
    instruction: "Repeat step 1 for a venture with launch_mode='live' AND current_lifecycle_stage>=24 (a go-live venture) with real credentials present.",
    expected_outcome: "publish() falls through to adapter.publish (mode='real'), proving the gate is a true allow/deny predicate, not a permanent block.",
  },
];

const { error } = await supabase
  .from('strategic_directives_v2')
  .update({ smoke_test_steps: smokeTestSteps })
  .eq('sd_key', 'SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001');

if (error) { console.error('UPDATE ERROR:', error.message); process.exit(1); }
console.log('Smoke test steps updated with a concrete 30-second demo.');
