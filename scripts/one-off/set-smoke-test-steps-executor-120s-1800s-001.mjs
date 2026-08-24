#!/usr/bin/env node
// LEAD Q9 answer + smoke_test_steps for SD-LEO-INFRA-EXECUTOR-120S-1800S-001.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = 'b1387e83-cc56-45ce-8ea5-6cf29042a607';

const SMOKE_TEST_STEPS = [
  {
    instruction: 'Trigger a genuine timeout in a sub-agent execute() call (mock a never-resolving promise).',
    expected_outcome: 'The resulting sub_agent_execution_results row is labeled as a timeout with a populated metadata.error, NOT the old hardcoded "No module found" recommendations text.',
  },
  {
    instruction: 'Trigger a genuine thrown error inside a sub-agent execute() call.',
    expected_outcome: 'The row captures the real error message and stack in metadata.error/metadata.stack (non-null), distinguishable from the timeout case.',
  },
  {
    instruction: 'Point the executor at a sub-agent code with no corresponding module file on disk.',
    expected_outcome: 'The row is labeled via an explicit fs-existence check, not assumption-from-catch, and the "module not found" text appears only in this genuinely-true case.',
  },
  {
    instruction: 'Query sub_agent_execution_results for the 82 pre-fix MANUAL_REQUIRED rows.',
    expected_outcome: 'Each carries the new corruption marker distinguishing them from post-fix rows, so a gate reading history can tell old evidence from new.',
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
