import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-FOLLOW-WIRE-REGISTERED-001';

// LEAD Q9 ("Describe the 30-second demo that proves this SD delivered value"): run the
// choke's own preflight query with the guard still held, confirm the WARNING count drops from
// 18 to 0 as writers are wired, then run one operator tool (sd:cancel) under a txn-scoped
// guard-apply simulation and confirm it succeeds with a stamped row instead of raising SDCW1.
const SMOKE_TEST_STEPS = [
  {
    step_number: 1,
    instruction: "Query the choke's own registry before wiring: SELECT count(*) FROM sd_canonical_writer_policy(NULL) WHERE (capability_flags->>'stamp_wired')::boolean IS NOT TRUE.",
    expected_outcome: '18 (the corrected, full unwired count -- 13 script/lib + 5 db_function).',
  },
  {
    step_number: 2,
    instruction: 'After FR-1 lands, re-run the same query.',
    expected_outcome: '0 -- every registered writer now sends the lifecycle_write_token stamp.',
  },
  {
    step_number: 3,
    instruction: 'Run the FR-3a preflight check with the guard still HELD (not yet applied).',
    expected_outcome: 'Preflight reports all 18 writers wired IN CODE and clears the guard-apply ceremony to proceed -- if any writer were still missing the stamp, the preflight blocks the ceremony here, before the guard applies.',
  },
  {
    step_number: 4,
    instruction: 'In a pglite/txn fixture harness with the guard function applied (simulating post-apply), invoke `npm run sd:cancel <fixture-sd>` (scripts/cancel-sd.js) against a fixture SD.',
    expected_outcome: 'The cancel succeeds and writes a lifecycle_write_token-stamped row -- no SDCW1 exception, proving a previously-unwired operator tool now works under the guard.',
  },
  {
    step_number: 5,
    instruction: 'In the same fixture harness, attempt an UPDATE to strategic_directives_v2.status from a writer identity NOT in the registry (an unstamped, unregistered caller).',
    expected_outcome: 'The guard raises SDCW1 and rejects the write -- proving the guard is actually enforcing, not just present.',
  },
];

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({ smoke_test_steps: SMOKE_TEST_STEPS })
    .eq('sd_key', SD_KEY);

  if (error) throw error;

  console.log(`smoke_test_steps written to top-level column for ${SD_KEY}`);
}

if (isMainModule(import.meta.url)) {
  main();
}
