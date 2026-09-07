#!/usr/bin/env node
// LEAD Q9 answer + smoke_test_steps for SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-E.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = '8667b9ad-02b4-4bfa-b908-6d3882697e0b';

const SMOKE_TEST_STEPS = [
  {
    step_number: 1,
    instruction: 'Open the write-caller census artifact produced by this SD for the target audit table (e.g. feedback) and count the direct .insert/.update/.upsert call sites it names.',
    expected_outcome: 'Every call site found by an independent grep for that table name is either listed in the census as allowed, or has been migrated to the canonical writer -- none are silently missing from the census.',
  },
  {
    step_number: 2,
    instruction: "As the service role, run UPDATE on an existing row of the newly-protected audit table (mirroring the parent orchestrator's own exit test: an update to a chairman-originated feedback row).",
    expected_outcome: 'The UPDATE is rejected by the new append-only immutability trigger (a Postgres error naming the trigger), not silently accepted.',
  },
  {
    step_number: 3,
    instruction: 'Exercise a legitimate application code path that inserts a new row into the same protected table (e.g. the normal feedback-submission flow).',
    expected_outcome: 'The INSERT still succeeds unaffected -- the immutability trigger blocks UPDATE/DELETE only, and no write-caller identified in the census regressed.',
  },
  {
    step_number: 4,
    instruction: 'Query pg_trigger for the protected table.',
    expected_outcome: 'The new no_update/no_delete/no_truncate trigger is present and ENABLE ALWAYS, matching the proven pattern already live on chairman_ratifications/venture_stages_audit.',
  },
];

async function run() {
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({ smoke_test_steps: SMOKE_TEST_STEPS })
    .eq('id', SD_UUID);
  if (error) throw new Error(`update failed: ${error.message}`);
  console.log('smoke_test_steps written:', SMOKE_TEST_STEPS.length, 'steps');
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
