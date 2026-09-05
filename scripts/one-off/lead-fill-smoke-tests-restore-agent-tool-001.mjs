import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', 'SD-LEO-INFRA-RESTORE-AGENT-TOOL-001')
  .maybeSingle();
if (readErr) { console.error(readErr); process.exit(1); }

const smoke_test_steps = [
  {
    step_number: 1,
    instruction: 'After merge, spawn any real Agent-tool sub-agent (e.g. an Explore call) from a live session, then query: SELECT id, verdict, source, metadata->>\'recorded_by\', metadata->>\'session_id\' FROM sub_agent_execution_results WHERE source=\'task_hook\' ORDER BY created_at DESC LIMIT 1;',
    expected_outcome: 'A row appears within seconds with metadata.recorded_by=\'task-subagent-recorder.cjs\', a non-unknown verdict, and metadata.session_id populated -- the hook fired and parsed real output for the first time in its history',
  },
  {
    step_number: 2,
    instruction: 'Run the new unit test file added by this SD (e.g. `npx vitest run scripts/hooks/__tests__/task-subagent-recorder.test.js`, exact path per the PRD) feeding a synthetic Agent PostToolUse payload shaped per the verified contract',
    expected_outcome: 'Test passes: one sub_agent_execution_results-shaped record is produced with a non-unknown verdict and the provenance triple (tool_name, invocation_id, content hash of raw_output) populated',
  },
  {
    step_number: 3,
    instruction: 'Run the new liveness gauge (gauge-registry.js pattern) the day after merge, after step 1 has occurred at least once',
    expected_outcome: 'Gauge reads green (not red) -- source=task_hook has at least one row in the trailing 7 days while Agent invocations occurred in the same window',
  },
];

const { error: writeErr } = await supabase
  .from('strategic_directives_v2')
  .update({ smoke_test_steps })
  .eq('id', sd.id);
if (writeErr) { console.error('WRITE ERROR', writeErr); process.exit(1); }
console.log('smoke_test_steps replaced with a real, SD-specific 30-second demo (LEAD Q9).');
