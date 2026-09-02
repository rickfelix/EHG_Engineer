import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-FDBK-INFRA-TESTING-VERDICT-ROWS-001';

const smoke_test_steps = [
  {
    step_number: 1,
    instruction: 'Run `node scripts/one-off/store-testing-evidence-fdbk-security.mjs` (the existing, already-committed script that reproduces the defect: a TESTING row with prose but no test_execution field) AFTER the fix lands.',
    expected_outcome: 'The write is REFUSED with an error naming the missing/malformed field (e.g. "metadata.test_execution is required"), not silently accepted.',
  },
  {
    step_number: 2,
    instruction: 'Call storeSubAgentResults(\'TESTING\', sdId, subAgent, {..., metadata: {test_execution: buildTestExecution({executed: 10, passed: 10, failed: 0})}}, {...}) with a well-formed test_execution block.',
    expected_outcome: 'The write SUCCEEDS and the stored row\'s metadata.test_execution matches the canonical buildTestExecution() shape exactly.',
  },
  {
    step_number: 3,
    instruction: 'Run the census script (committed by this SD) against the last 14 days of TESTING rows in sub_agent_execution_results.',
    expected_outcome: 'Output enumerates the distinct execution-related metadata keys found; before the fix this reads ~300 distinct keys, after the fix (on new rows) it reads down toward 1 (test_execution).',
  },
  {
    step_number: 4,
    instruction: 'Query sub_agent_execution_results for the 5 most recent TESTING PASS rows written after this SD merges.',
    expected_outcome: 'All 5 carry a non-empty metadata.test_execution with tests_executed > 0 (per isMeasuredExecution); none rely solely on prose in summary/detailed_analysis.',
  },
];

const mechanism_verifications = [
  { claim: 'buildTestExecution/isMeasuredExecution canonical shape', verified_by: 'Explore sub-agent (Task tool), LEAD phase', verified_at: 'lib/sub-agents/testing/test-execution-record.js:20' },
  { claim: 'mandatory-testing-validation.js reads metadata.test_execution as primary path', verified_by: 'Explore sub-agent (Task tool), LEAD phase', verified_at: 'scripts/modules/handoff/executors/exec-to-plan/gates/mandatory-testing-validation.js:304' },
  { claim: 'scripts/lib/test-evidence-ingest.js does NOT write to sub_agent_execution_results (fix site is elsewhere)', verified_by: 'Explore sub-agent (Task tool), LEAD phase', verified_at: 'scripts/lib/test-evidence-ingest.js:189' },
  { claim: 'storeSubAgentResults is the real writer choke point for the manual/worker-authored TESTING pattern', verified_by: 'Explore sub-agent (Task tool), LEAD phase', verified_at: 'lib/sub-agent-executor/results-storage.js:414' },
  { claim: 'no validation of missing/malformed test_execution exists today; live defect proof exists', verified_by: 'Explore sub-agent (Task tool), LEAD phase', verified_at: 'scripts/one-off/store-testing-evidence-fdbk-security.mjs:1' },
];

const { data: sd, error: fetchErr } = await sb
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (fetchErr) throw fetchErr;

const newMetadata = { ...sd.metadata, mechanism_verifications };

const { error } = await sb
  .from('strategic_directives_v2')
  .update({ smoke_test_steps, metadata: newMetadata })
  .eq('sd_key', SD_KEY);
if (error) throw error;

console.log('UPDATED smoke_test_steps (4) + metadata.mechanism_verifications (5) for', SD_KEY);
