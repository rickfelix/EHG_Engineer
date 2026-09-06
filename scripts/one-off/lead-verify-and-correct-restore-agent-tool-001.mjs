import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, description, metadata')
  .eq('sd_key', 'SD-LEO-INFRA-RESTORE-AGENT-TOOL-001')
  .maybeSingle();
if (readErr) { console.error(readErr); process.exit(1); }

const mechanismVerifications = [
  {
    verified_by: 'LEAD, direct code read + DB query',
    verified_at: '.claude/settings.json:183',
    claim: 'PostToolUse matcher "Task" -> task-subagent-recorder.cjs. CONFIRMED correct as cited.',
  },
  {
    verified_by: 'LEAD, direct code read',
    verified_at: '.claude/settings.json:336',
    claim: 'PreToolUse matcher "Task" -> task-recorder.js. CONFIRMED correct as cited, BUT the SD mislabels this the ":336 entry" without noting it is a DIFFERENT script (task-recorder.js) from the SD\'s headline subject (task-subagent-recorder.cjs), writing to a DIFFERENT table (subagent_activations, not sub_agent_execution_results).',
  },
  {
    verified_by: 'LEAD, direct code read',
    verified_at: '.claude/settings.json:316',
    claim: 'CORRECTION: the SD calls this "the stop-hook list at :316" -- it is actually in the PreToolUse section (matcher "Task|Bash|Write|Edit|MultiEdit|AskUserQuestion" -> pre-tool-enforce.cjs), NOT the Stop lifecycle. The genuine Stop section (lines 223-258) has no matcher at all and no Task reference. Line number and matcher content are correct; only the lifecycle-section label in the SD text is wrong.',
  },
  {
    verified_by: 'LEAD, direct code read',
    verified_at: 'scripts/hooks/task-subagent-recorder.cjs:399',
    claim: 'if (toolName !== \'Task\') return -- CONFIRMED, blocks every Agent-tool invocation.',
  },
  {
    verified_by: 'LEAD + prospective TESTING sub-agent investigation, DB query + cross-file verification',
    verified_at: 'scripts/hooks/task-subagent-recorder.cjs:395-396',
    claim: 'SEVERITY CORRECTION: the SD frames the payload-shape question as open ("verify the Agent PostToolUse payload shape against what the recorder parses"). VERIFIED: the recorder has NEVER written a single row in its history (0 rows all-time with metadata.recorded_by=\'task-subagent-recorder.cjs\', confirmed by direct query). The 6 historical source=task_hook rows the SD cites (newest 2026-07-19) are hand-written manual inserts by other agents, not hook output (uppercase verdicts parseVerdict() cannot produce; missing metadata.tool_call_id; prose summaries inconsistent with parseSummary() output). Root cause is NOT only the Task->Agent rename: line 395 reads tool_result||result and line 396 reads tool_call_id||call_id -- NEITHER field exists in the verified PostToolUse contract (scripts/hooks/__tests__/session-id-propagation-canary.test.js:13-16, RCA 2026-05-04 live SSE capture: real fields are tool_response and tool_use_id). This bug predates and is independent of the rename.',
  },
  {
    verified_by: 'LEAD + prospective TESTING sub-agent investigation',
    verified_at: 'scripts/hooks/task-recorder.js:33-34,43',
    claim: 'OUT OF SCOPE finding, flagged not silently fixed: this sibling recorder (the :336 entry) reads process.env.CLAUDE_TOOL_INPUT, which the same verified contract confirms is NOT propagated to hooks. This is a THIRD, independently-broken sub-agent evidence recorder (writes to subagent_activations). Not part of this SD\'s scope (which names only "the Agent-tool sub-agent evidence recorder", singular, i.e. task-subagent-recorder.cjs) -- signaled to the coordinator (signal ed112fd5) as a separate follow-up candidate.',
  },
];

const descriptionCorrection = '\n\nLEAD CORRECTION (verified against reality before PRD authoring): the hook has NEVER written a row in its history (0 rows all-time, metadata.recorded_by=task-subagent-recorder.cjs) -- the 6 cited historical task_hook rows are hand-written manual inserts, not hook output. Root cause includes two ADDITIONAL, independent, pre-existing field-name bugs beyond the Task->Agent rename: task-subagent-recorder.cjs reads tool_result||result and tool_call_id||call_id, but the verified harness contract uses tool_response and tool_use_id (scripts/hooks/__tests__/session-id-propagation-canary.test.js:13-16). The gap window is therefore "since the hook\'s creation", not "2026-07-19 to merge date" as originally stated.';

const metadata = {
  ...sd.metadata,
  mechanism_verifications: mechanismVerifications,
};

const { error: writeErr } = await supabase
  .from('strategic_directives_v2')
  .update({
    description: sd.description + descriptionCorrection,
    metadata,
  })
  .eq('id', sd.id);
if (writeErr) { console.error('WRITE ERROR', writeErr); process.exit(1); }
console.log('SD corrected: description gap-window correction applied, 6 mechanism_verifications recorded.');
