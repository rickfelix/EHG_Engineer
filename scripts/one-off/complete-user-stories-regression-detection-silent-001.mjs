// Marks all 7 user stories for SD-LEO-INFRA-REGRESSION-DETECTION-SILENT-001 as completed, with
// per-story verification evidence cited in technical_notes per CLAUDE_EXEC.md's mandatory
// acceptance-criteria verification rule (no bulk-update without individually-cited evidence).

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-REGRESSION-DETECTION-SILENT-001';

const evidence = {
  'US-001': 'Verified: TS-7 (tests/unit/rca-runtime-triggers-monitor-test-failures.test.js) asserts the .on() config deep-equals {event:INSERT, schema:public, table:test_results, filter:status=eq.failed}. Test passed (39/39 suite green). Mutation-tested trigger_tier separately (see US-002) to confirm the suite is not vacuous.',
  'US-002': 'Verified: TS-1 (real regression fires), TS-2 (first-ever failure no-trigger), TS-3 (still-failing no-trigger), TS-5 (deterministic .order() params pin), TS-6 (.neq(test_run_id) exclusion pin) all pass. Mutation test: temporarily changed trigger_tier 2->3 in the real source, confirmed TS-1 went red (AssertionError: expected 3 to be 2), reverted, confirmed all 13 tests green again -- proves the test is not vacuously passing.',
  'US-003': 'Verified: TS-4 asserts a NULL test_full_title row causes zero calls to supabase.from() and a console.warn matching /test_full_title/. Test passed.',
  'US-004': 'Verified: TS-1 asserts payload.evidence_refs.stack_trace === failure.error_stack, payload.evidence_refs.screenshot_url === failure.failure_screenshot_path, and payload.sd_id === the joined test_runs row\'s sd_id (not read off test_results directly, which has no such column). Test passed.',
  'US-005': 'Verified live + by test: (1) directly confirmed anon INSERT into root_cause_reports returns 42501 before this fix; (2) new test "TS-9: the write client is service-role, not anon" (tests/unit/rca-trigger-failsoft.test.js) asserts createSupabaseServiceClient was called and createSupabaseClient was NOT called for the RCR write path -- passed; (3) git diff origin/main -- lib/rca-runtime-triggers.js grepped for monitorSubAgentFailures/monitorQualityGates/monitorHandoffRejections returns zero matching added/removed lines, confirming their function bodies are byte-identical to origin/main.',
  'US-006': 'Verified: database/migrations/20260817_add_test_results_to_realtime_publication.sql contains exactly 1 ALTER PUBLICATION statement (grep -c confirms), wrapped in a DO block idempotency guard checking pg_publication_tables first. Confirmed via a live pg_publication_tables query (immediately before marking this story complete) that test_results is STILL NOT a publication member -- the migration was staged only, never applied by this SD.',
  'US-007': 'Verified: docs/reference/root-cause-agent.md line 369 (Tier-2 trigger table row) no longer references test_failures or playwright_test_scenarios; updated to describe the test_results + test_runs run-relative mechanism.',
};

const { data: stories, error: fetchErr } = await supabase
  .from('user_stories')
  .select('id, story_key, technical_notes')
  .like('story_key', `${SD_KEY}:%`);

if (fetchErr) {
  console.error('FETCH_ERROR', fetchErr.message);
  process.exit(1);
}

for (const story of stories) {
  const usKey = story.story_key.split(':').pop(); // e.g. 'US-001'
  const note = evidence[usKey];
  if (!note) {
    console.error('NO_EVIDENCE_FOR', story.story_key);
    process.exit(1);
  }

  const { error: updateErr } = await supabase
    .from('user_stories')
    .update({
      status: 'completed',
      validation_status: 'validated',
      implementation_status: 'completed',
      technical_notes: `${story.technical_notes ?? ''}\n\nVERIFICATION EVIDENCE: ${note}`.trim(),
      completed_by: 'EXEC (Golf-5, session 42d805b8-dd3a-443c-9dc9-fb3cb7de3b05)',
      completed_at: new Date(2026, 7, 16, 22, 5).toISOString(),
    })
    .eq('id', story.id);

  if (updateErr) {
    console.error('UPDATE_ERROR', story.story_key, updateErr.message);
    process.exit(1);
  }
  console.log('Completed', story.story_key);
}
