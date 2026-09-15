// PLAN-TO-LEAD VERIFY-phase retrospective for SD-LEARN-FIX-ADDRESS-PAT-LES-018.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const sb = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PAT-LES-018';

const row = {
  sd_id: SD_KEY,
  retro_type: 'SD_COMPLETION',
  title: 'Documenting the undocumented: a source-row data-quality mismatch nearly misdirected the fix',
  description:
    'A /learn-generated SD from a single retrospective occurrence: 2 real, live, previously-undocumented CHECK constraints on user_stories (story_key format, priority enum) discoverable only via trial-and-error INSERT failure. The fix is documentation + inline-hint completeness only -- the constraints themselves are correct and stay enforced unchanged.',
  what_went_well: [
    'The issue_patterns.proven_solutions field for this exact pattern_id described an entirely UNRELATED fix (a retrospective-quality-trigger bug) -- a data-quality mismatch in the source row, not a real solution. Caught this immediately by cross-referencing the pattern\'s own issue_summary text against its proven_solutions text before trusting either, and went to the primary source (the origin SD\'s own retrospective row) instead of applying the mismatched "proven" solution.',
    'Confirmed the undocumented claim was still true (not stale) before building anything: grep for "user_stories"/"story_key" in docs/reference/database-agent-patterns.md returned zero matches despite the doc being 76KB with extensive existing constraint-adjacent sections (Anti-Patterns, PRD Workflow Integration) -- the gap was real, not already closed by a prior session.',
    'Found the EXACT discoverability gap, not just "a" gap: scripts/modules/handoff/cli/cli-main.js already prints a PLAN-TO-EXEC checklist hint at precisely the moment this information is needed (a gate-failure moment), but the printed field list omitted \'priority\' entirely -- extending that existing, well-placed hint (rather than only adding a doc page nobody reads at the right moment) closes the gap at both the reference-doc layer and the point-of-failure layer.',
    'Every new test reads the LIVE database/schema-reference-snapshot.json rather than hardcoding the constraint regex/enum text, so a future constraint change that the doc or hint forgets to follow fails CI loudly instead of the doc silently drifting stale -- the same failure class (undocumented, discoverable only by trial-and-error) cannot recur invisibly.',
    'All 3 new test assertions were mutation-tested for non-vacuousness before considering them done: a bogus example value, a systematic removal of a specific enum value from the doc, and removal of the \'priority\' mention from the CLI hint each failed exactly the intended test and no other, confirmed via a byte-identical restore each time.',
  ],
  what_needs_improvement: [
    'The corrective-generation pipeline that surfaces these single-occurrence /learn patterns as full SDs auto-populates a proven_solutions field from... some source that can be mismatched to the wrong pattern_id -- worth a follow-up check on the /learn pattern-storage code path itself (out of this SD\'s own scope, since it addresses documentation of user_stories constraints, not the /learn pipeline).',
    'This SD\'s own auto-generated success_metrics ("Achieve RETROSPECTIVE_QUALITY_GATE score >= 55%... without manual metadata patching") describe the GATE mechanics of /learn-generated SDs generically, not anything specific to this SD\'s actual fix -- boilerplate that adds no real signal, though harmless.',
  ],
  key_learnings: [
    {
      category: 'A_PATTERN_ROWS_OWN_PROVEN_SOLUTIONS_FIELD_CAN_BE_WRONG',
      evidence: 'issue_patterns.proven_solutions for PAT-LES-455c48ba7d65 described fixing an auto_populate_retrospective_fields trigger bug -- an entirely different incident from the same retrospective\'s what_needs_improvement array, evidently mismatched during /learn\'s pattern-extraction step.',
      learning: 'A "proven solution" attached to an issue_patterns row is not itself ground truth -- cross-check it against the pattern\'s own issue_summary text, and when they disagree, trust the primary-source retrospective/incident text over the (possibly mismatched) proven_solutions field.',
      applicability: 'Any future /learn-generated SD should independently re-derive its root cause from the origin retrospective\'s primary text before applying a listed proven_solution verbatim.',
    },
    {
      category: 'EXTEND_THE_EXISTING_HINT_AT_THE_FAILURE_MOMENT_RATHER_THAN_ONLY_ADDING_A_REFERENCE_DOC',
      evidence: 'scripts/modules/handoff/cli/cli-main.js already prints a targeted checklist hint exactly when a PLAN-TO-EXEC gate needs user_stories rows to exist -- but the hint text itself was the actual point of failure (incomplete field list), not merely the absence of a reference doc elsewhere.',
      learning: 'For an "undocumented, discoverable only via trial-and-error" class of gap, check whether an inline hint ALREADY fires at the failure moment before assuming a standalone reference doc is the only or primary fix -- completing an existing, well-placed hint closes the gap where it actually bites.',
      applicability: 'Any future PAT-LES-class SD about undocumented constraints/formats should first search for an existing CLI/gate hint near the failure point, not only the general reference docs.',
    },
    {
      category: 'SCHEMA_SNAPSHOT_DERIVED_TESTS_PREVENT_DOC_DRIFT_STRUCTURALLY',
      evidence: 'Both new test files (tests/unit/docs/user-stories-constraint-doc.test.js, tests/unit/handoff/plan-to-exec-user-story-checklist-hint.test.js) parse database/schema-reference-snapshot.json at test-run time rather than hardcoding the regex/enum text into the assertions.',
      learning: 'A documentation-sync test is only as durable as its source of truth: hardcoding the constraint text into the TEST just moves the staleness risk from the doc to the test. Reading the live schema snapshot at test-run time makes a future constraint widening/narrowing fail the test automatically, closing the same discoverability gap this SD exists to fix, permanently rather than once.',
      applicability: 'Any future doc-vs-schema sync test in this repo should read database/schema-reference-snapshot.json directly rather than hardcoding constraint definitions.',
    },
  ],
  action_items: [
    {
      owner: 'Session Agent',
      action: 'File a harness_backlog finding (not a new SD, per the harness-baseline discipline) noting that issue_patterns.proven_solutions can be mismatched to the wrong pattern_id -- worth investigating the /learn pattern-extraction code path when the current baseline is cleared.',
      source: 'process_pattern',
      priority: 'low',
      smart_format: true,
      success_criteria: 'A harness_backlog feedback row exists describing the proven_solutions/issue_summary mismatch observed on PAT-LES-455c48ba7d65, for later triage.',
    },
    {
      owner: 'Session Agent',
      action: 'When a future SD documents an undocumented constraint/format gap, check for an existing CLI/gate hint at the failure moment before assuming a standalone reference doc is the primary fix.',
      source: 'process_pattern',
      priority: 'medium',
      smart_format: true,
      success_criteria: 'Future PAT-LES-class documentation SDs search for and extend an existing inline hint where one already exists, rather than only adding reference-doc content.',
    },
    {
      owner: 'Session Agent',
      action: 'When writing a doc-vs-schema sync test, read database/schema-reference-snapshot.json directly at test-run time rather than hardcoding the constraint text into the test.',
      source: 'process_pattern',
      priority: 'low',
      smart_format: true,
      success_criteria: 'Future doc-vs-schema sync tests in this repo follow the live-snapshot-read pattern established by this SD\'s 2 new test files.',
    },
  ],
  objectives_met: true,
  on_schedule: true,
  within_scope: true,
  bugs_found: 1,
  bugs_resolved: 1,
  tests_added: 7,
  generated_by: 'MANUAL',
  trigger_event: 'PLAN_VERIFICATION',
  status: 'PUBLISHED',
  conducted_date: new Date().toISOString(),
  target_application: 'EHG_Engineer',
  applies_to_all_apps: false,
  learning_category: 'PROCESS_IMPROVEMENT',
  metadata: {
    sd_key: SD_KEY,
    authored_by: 'PLAN-TO-LEAD VERIFY session agent',
    origin_pattern: 'PAT-LES-455c48ba7d65',
    origin_sd: 'SD-LEO-INFRA-CLAIM-SYSTEM-IMPROVEMENTS-001',
    origin_retro_id: '86a8de12-0dc8-4cd8-8e45-74bdfaf2a882',
    proven_solutions_mismatch_found: true,
  },
};

async function main() {
  const { data, error } = await sb.from('retrospectives').insert(row).select('id, status, quality_score').single();
  if (error) throw error;
  console.log('INSERTED genuine retrospective:', JSON.stringify(data, null, 2));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('FAILED to insert retrospective:', err);
    process.exit(1);
  });
}
