// Grounds success_metrics.actual for SD-LEO-FEAT-PROVEN-BETTER-NEW-001 in real measurements
// (SUCCESS_METRICS gate at PLAN-TO-LEAD): 3 of 4 metrics were left as literal "N/A" even though
// real data was already available. Values below are independently checked, not guessed:
//   - Implementation completeness: 8/8 user_stories rows are status=completed, validation_status=validated
//     (queried directly), matching EXEC-TO-PLAN's DELIVERABLES_COMPLETENESS/SCOPE_COMPLETION_VERIFICATION
//     gates (both 100/100).
//   - Test coverage: coverage/coverage-summary.json (generated this SD's own test run, 2026-08-15 11:52)
//     reports lines 310/327 = 94.8%, statements 94.9%, functions 100%, branches 85.94% -- all clear the
//     ">=80% code coverage for new code" target.
//   - User story completion: same 8/8 completed/validated query as above.
// "Zero regressions" already carried a real value ("0 regressions") and is left unchanged.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-FEAT-PROVEN-BETTER-NEW-001';

const { data: sd, error: sdErr } = await supabase.from('strategic_directives_v2')
  .select('id, success_metrics').eq('sd_key', SD_KEY).maybeSingle();
if (sdErr) throw sdErr;
if (!sd) throw new Error(`No SD found for sd_key=${SD_KEY}`);

const { data: stories, error: storyErr } = await supabase.from('user_stories')
  .select('status, validation_status').eq('sd_id', sd.id);
if (storyErr) throw storyErr;
const total = stories.length;
const done = stories.filter((s) => s.status === 'completed' && s.validation_status === 'validated').length;
if (done !== total) {
  throw new Error(`Expected all ${total} stories completed/validated, found ${done}/${total} -- re-check before grounding metrics`);
}

const REPLACEMENTS = {
  'implementation completeness': `${Math.round((done / total) * 100)}% — ${done} of ${total} user stories completed/validated (DELIVERABLES_COMPLETENESS 100/100, SCOPE_COMPLETION_VERIFICATION 100/100 at EXEC-TO-PLAN)`,
  'test coverage': '94.8% — coverage/coverage-summary.json: lines 310/327 (94.8%), statements 94.9%, functions 100%, branches 85.94%',
  'user story completion': `${Math.round((done / total) * 100)}% — ${done} of ${total} user stories status=completed, validation_status=validated`,
};

const success_metrics = sd.success_metrics.map((m) => {
  const key = (m.metric || '').trim().toLowerCase();
  if (String(m.actual).trim().toUpperCase() !== 'N/A') return m; // only touch the ones still marked N/A
  const replacement = REPLACEMENTS[key];
  if (!replacement) throw new Error(`No grounded replacement authored for metric "${m.metric}" — extend REPLACEMENTS or leave it N/A deliberately`);
  return { ...m, actual: replacement };
});

const { data: updated, error: updateErr } = await supabase.from('strategic_directives_v2')
  .update({ success_metrics })
  .eq('sd_key', SD_KEY)
  .select('sd_key, success_metrics').maybeSingle();
if (updateErr) throw updateErr;
console.log(JSON.stringify(updated.success_metrics, null, 2));
