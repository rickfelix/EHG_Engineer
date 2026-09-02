// SD-FDBK-INFRA-TESTING-SUB-AGENT-001 -- RETROSPECTIVE_EXISTS gate scored the auto-generated
// retro at 59% (below the 60% LEAD-FINAL-APPROVAL threshold): boilerplate entries, N/A metric
// actuals, generic non-SD-specific action items. Replacing with concrete, measured content.
import { createSupabaseServiceClient } from '../../lib/supabase-client.cjs';

const RETRO_ID = '09fc7103-4eec-459c-b23d-a66d806984bd';

const sb = createSupabaseServiceClient();

const what_went_well = [
  { achievement: 'LEAD-TO-PLAN handoff for SD-FDBK-INFRA-TESTING-SUB-AGENT-001 landed at quality score 100%', is_boilerplate: false },
  { achievement: 'PR #7955 dogfood-verified: running the TESTING sub-agent against this SD (itself sd_type=infrastructure, code-producing) went from a fabricated PASS/95 with 0 tests executed (pre-fix baseline) to a genuine measured PASS/92 with executed=25/passed=25/failed=0 (post-fix, before SC#6) and PASS/92 executed=40/passed=40 (post-SC#6) — a live before/after proof, not just unit-test coverage', is_boilerplate: false },
  { achievement: 'Two factual errors in the SD\'s own success criteria (SC#3 wording implying new blocking enforcement; mechanism claiming mandatory-testing-validation.js consumes detectCodeProduction) were caught by the LEAD-phase VALIDATION sub-agent before scope locked, corrected via coordinator ruling, and recorded on the SD row itself for the audit trail', is_boilerplate: false },
  { achievement: '106+ unit tests added/updated across 4 tightly-coupled files (the two deleted applicability lists plus their two direct consumers), all passing alongside 157 combined pre-existing + new tests with zero regressions', is_boilerplate: false },
];

const what_needs_improvement = [
  'SC#6 (single structured test-execution representation) was appended to the SD\'s success_criteria mid-EXEC by a concurrent Adam/Solomon amendment (00:06:48Z), after LEAD-TO-PLAN had already locked scope on the original 5 criteria — this required a second signal-and-implement pass (test-execution-record.js) after PR #7955 was already open, rather than being scoped at LEAD.',
  'The CI lint no-process-cwd-in-sub-agents-lint caught a process.cwd() fallback that local testing did not exercise (branchContext.repoPath was always populated in local runs) — a CI-only failure mode for a fallback branch, fixed by routing through resolveSubAgentRepo() instead.',
  'The auto-generated retrospective itself needed manual correction (this update) — success_metrics.actual fields defaulted to "N/A" and several action items were generic template boilerplate rather than SD-specific, which the RETROSPECTIVE_EXISTS gate correctly flagged at 59%/below threshold.',
];

const action_items = [
  {
    owner: 'LEO-Session', priority: 'high',
    action: 'If SC#6 recurs as a pattern (scope amendments arriving after LEAD-TO-PLAN lock), consider a checkin/handoff hook that re-surfaces the SD row\'s success_criteria diff to the claiming worker rather than relying on the worker noticing on a manual re-read.',
    deadline: 'Next similar SD', success_criteria: 'A worker mid-EXEC is notified (not just left to notice) when success_criteria changes on their claimed SD.',
    smart_format: true,
  },
  {
    owner: 'Golf-4 (worker)', priority: 'medium',
    action: 'Confirmed via dogfood run: SD-FDBK-INFRA-TESTING-SUB-AGENT-001 produces no regressions — 157 combined unit tests pass after EXEC changes (tests/unit/testing-subagent/, mandatory-testing-validation.test.js, sd-type-applicability-policy.test.js, plus 6 other consumer suites).',
    deadline: 'PLAN-TO-LEAD', success_criteria: 'All existing + new unit tests pass after changes merge.', verification_query: 'npx vitest run tests/unit/testing-subagent/ scripts/modules/handoff/executors/exec-to-plan/gates/mandatory-testing-validation.test.js tests/unit/sd-type-applicability-policy.test.js',
    completed: true, smart_format: true,
  },
  {
    owner: 'Golf-4 (worker)', priority: 'low',
    action: 'Document the isE2EApplicabilityExempt / buildTestExecution pattern (single-representation predicate + shared shape-builder) in issue_patterns as a reusable template for the next "two private lists disagree" class of defect.',
    deadline: 'Before next similar SD', success_criteria: 'Pattern with prevention_checklist exists in database referencing sd-type-applicability-policy.js and test-execution-record.js as the canonical examples.',
    smart_format: true,
  },
];

const key_learnings_append = [
  {
    category: 'MID_EXEC_SCOPE_CHANGE',
    evidence: 'metadata.adam_amendments[1] (00:06:48Z) and coordinator directive 38d9fba7 (00:54:30Z, ruling option b)',
    learning: 'A concurrent, actively-iterating fleet (Adam sourcing + Solomon plan input + coordinator ruling) can amend a claimed SD\'s success_criteria mid-EXEC. The worker caught it only by re-reading the live SD row before LEAD-FINAL, not via any push notification.',
    applicability: 'When re-reading an SD row after a long EXEC session, diff success_criteria against what was read at claim time rather than assuming it is static once claimed.',
  },
];

const { data: existing, error: readErr } = await sb.from('retrospectives').select('key_learnings').eq('id', RETRO_ID).maybeSingle();
if (readErr) { console.error('READ_ERROR', readErr); process.exit(1); }

const { error } = await sb
  .from('retrospectives')
  .update({
    what_went_well,
    what_needs_improvement,
    action_items,
    key_learnings: [...(existing.key_learnings || []), ...key_learnings_append],
  })
  .eq('id', RETRO_ID);
if (error) { console.error('WRITE_ERROR', error); process.exit(1); }
console.log('RETRO_UPDATED=true');
