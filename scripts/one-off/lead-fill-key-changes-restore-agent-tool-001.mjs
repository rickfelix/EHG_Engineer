import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, success_criteria')
  .eq('sd_key', 'SD-LEO-INFRA-RESTORE-AGENT-TOOL-001')
  .maybeSingle();
if (readErr) { console.error(readErr); process.exit(1); }

const key_changes = [
  {
    change: '.claude/settings.json: widen 3 hook matchers naming "Task" to "Task|Agent" (PostToolUse :183, PreToolUse :316, PreToolUse :336), keeping "Task" for older harness builds',
    impact: 'Every PostToolUse/PreToolUse hook currently dead for Agent-tool invocations starts firing again',
  },
  {
    change: 'scripts/hooks/task-subagent-recorder.cjs: accept tool_name in [Task, Agent] (line 399 guard), and read the VERIFIED field names tool_response (not tool_result/result) and tool_use_id (not tool_call_id/call_id) per the RCA-2026-05-04 harness contract -- two independent, pre-existing bugs that made the hook a permanent no-op even before the rename (0 rows written, all time)',
    impact: 'sub_agent_execution_results actually gains real hook-produced rows with source=task_hook, closing the "evidence without provenance" gap the coordinator ruled Tier 3 under ratification 6c263823',
  },
  {
    change: 'Add the ratification-6c263823 provenance triple to the recorded row: explicit tool_name (producer) field, invocation_id (run identifier, already present), and a content hash of raw_output (new)',
    impact: 'Evidence rows carry full provenance rather than partial (invocation_id alone)',
  },
  {
    change: 'CI-asserted exit predicate: a unit test feeding a synthetic Agent PostToolUse payload through the recorder asserting a real (non-unknown) verdict + the provenance triple, plus a liveness gauge (lib/governance/gauge-registry.js pattern) reading red when source=task_hook has zero rows in a trailing 7 days while Agent invocations occurred',
    impact: 'A future regression (matcher drift, field-name drift) is caught in CI and by a live gauge, not silently, again',
  },
];

const success_criteria = sd.success_criteria.map((c) => {
  if (c.criterion.includes('Within 24h of merge')) {
    return {
      ...c,
      measure: 'Query sub_agent_execution_results WHERE source=\'task_hook\' AND created_at > merge_time + 24h; expect >=1 row per distinct session_id across >=2 sessions, each with metadata.recorded_by=task-subagent-recorder.cjs, a non-unknown verdict, and the provenance triple populated',
    };
  }
  if (c.criterion.includes('unit test and the liveness probe')) {
    return {
      ...c,
      measure: 'grep the merge PR diff for the new unit test file + gauge registration; run the liveness gauge script the day after merge and confirm it reads green (non-red)',
    };
  }
  if (c.criterion.includes('SUBAGENT_EVIDENCE')) {
    return {
      ...c,
      measure: 'Run a PLAN-TO-EXEC or EXEC-TO-PLAN handoff precheck on a live SD after merge; confirm GATE_SUBAGENT_EVIDENCE evidence count reflects both CLI-writer and hook-writer rows for the same phase without double-counting (dedup on invocation_id, per insertRecord()\'s existing idempotency check)',
    };
  }
  return c;
});

const { error: writeErr } = await supabase
  .from('strategic_directives_v2')
  .update({ key_changes, success_criteria })
  .eq('id', sd.id);
if (writeErr) { console.error('WRITE ERROR', writeErr); process.exit(1); }
console.log('key_changes replaced with real specifics; success_criteria measure fields populated.');
