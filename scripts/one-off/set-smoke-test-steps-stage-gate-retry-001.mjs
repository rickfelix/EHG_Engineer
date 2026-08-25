#!/usr/bin/env node
// SD-LEO-INFRA-STAGE-GATE-RETRY-001 -- smoke_test_steps must be a real 30-second demo
// (LEAD Q9), not the generic auto-generated placeholder.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = '8077da1b-7888-4a91-aba8-bfe459e61334';

const smoke_test_steps = [
  {
    instruction: 'Run the FR-3 census check against the live database.',
    expected_outcome: 'Reports 0 ventures in unbounded-retry posture (repeated identical attempts, N>threshold) -- the specimen count this SD exists to drive to zero.',
  },
  {
    instruction: 'Simulate a venture stuck at a gate that repeatedly fails re-evaluation past the new attempt ceiling.',
    expected_outcome: 'The venture transitions to a terminal MANUAL_REQUIRED-style state carrying a reason -- no further eva_stage_gate_attempts rows are inserted for that venture/stage/gate combination.',
  },
  {
    instruction: 'Simulate a chairman override (resolved_outcome=override) resolving a stuck gate, then trigger a second poll cycle for the same venture.',
    expected_outcome: 'The second cycle does NOT re-evaluate or re-record the gate -- zero new eva_stage_gate_attempts rows, confirming override terminalization holds.',
  },
  {
    instruction: 'Run a normally-advancing venture (not stuck at any gate) through the fixed discipline end to end.',
    expected_outcome: 'The venture advances through stages exactly as before this SD -- no behavior change, no regression, for the non-stuck path.',
  },
  {
    instruction: 'Unpark ApexNiche (venture 809ec7e7, stage 21) and let one poll cycle run under the fixed discipline.',
    expected_outcome: 'The stage-21 gate is re-evaluated exactly ONCE (not replayed every ~30s), matching the unpark_trigger condition recorded in ventures.metadata.gating_decision_history.',
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
