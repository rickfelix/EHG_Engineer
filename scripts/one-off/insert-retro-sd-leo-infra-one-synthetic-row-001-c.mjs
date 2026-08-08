#!/usr/bin/env node
// RETRO evidence for SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-C (PLAN_VERIFICATION -> PLAN-TO-LEAD).
//
// retrospectives.quality_score is TRIGGER-COMPUTED on INSERT (public.auto_validate_retrospective_
// quality) from the shape of what_went_well / key_learnings / action_items / what_needs_improvement.
// The value supplied here is a starting point only -- deliberately NOT fought via the UPDATE-bypass
// trick some older one-off scripts use, per this SD's own review instruction. Left as DRAFT so the
// PUBLISHED >=70 gate inside the trigger cannot fire on whatever the computed score turns out to be;
// a human/coordinator can promote to PUBLISHED once the computed score is confirmed live.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_UUID = '3d0100d7-1cc3-427a-b5a2-bfeff80d3f57';
const SD_KEY = 'SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-C';

const retro = {
  sd_id: SD_UUID,
  retro_type: 'SD_COMPLETION',
  retrospective_type: null, // NULL default (20260528 migration) is what the SD-completion gate selects on
  learning_category: 'APPLICATION_ISSUE',
  target_application: 'EHG_Engineer',
  generated_by: 'MANUAL',
  status: 'DRAFT',
  quality_score: 85, // starting value only; trigger recomputes on INSERT from content shape
  title: `Retrospective: ${SD_KEY}`,
  description:
    'Routed the quick_fixes claim path (scripts/worker-checkin.cjs isAutoStartableQF) and the supply ' +
    'gauge (lib/coordinator/qf-supply-predicate.cjs isClaimableQfSupply, consumed by ' +
    'lib/coordinator/coordination-events.cjs) through the canonical fixture predicate ' +
    'lib/governance/fixture-exclusion.mjs, so synthetic rows are neither dispatched to workers nor ' +
    'counted as claimable supply. Four commits (569d361f543, 2afe4b038c6, 29900c23edc, e2474815594), ' +
    '~460 lines net added across 6 files. This retrospective is written for the PATTERNS the SD ' +
    'surfaced, not as a completion narrative -- the planned scope, the SD\'s own regression, and the ' +
    'verification-check failure rate are the load-bearing findings.',

  affected_components: [
    'scripts/worker-checkin.cjs',
    'lib/coordinator/qf-supply-predicate.cjs',
    'lib/coordinator/coordination-events.cjs',
    'lib/governance/fixture-exclusion.mjs',
    'tests/unit/coordinator/qf-supply-gauge-agreement.test.js',
    'tests/unit/governance/fixture-exclusion-per-table.test.js',
    'tests/unit/worker-checkin-critical-qf-priority-jump.test.js',
  ],
  related_commits: ['569d361f543', '2afe4b038c6', '29900c23edc', 'e2474815594'],
  related_files: [
    'scripts/worker-checkin.cjs',
    'lib/coordinator/qf-supply-predicate.cjs',
    'lib/coordinator/coordination-events.cjs',
  ],
  tags: ['fixture-exclusion', 'quick-fixes', 'supply-gauge', 'name-not-behavior', 'blind-guard'],

  what_went_well: [
    'Reading scripts/critical-qf-jump.cjs, lib/chairman/chairman-actionable.mjs, and ' +
      'scripts/adam-decision-email.mjs end-to-end (rather than trusting their names on a grep list) ' +
      'killed 2 of the 5 originally-planned tranche conversions before any code was written for them: ' +
      'critical-qf-jump.cjs does not decide eligibility at all (it delegates to isAutoStartableQF at ' +
      'worker-checkin.cjs:203, already the target of conversion 1), and chairman-actionable.mjs already ' +
      'filtered fixtures via its own mirror of the get_pending_chairman_items SQL RPC.',
    'The same read caught that converting chairman-actionable.mjs onto the canonical predicate as the ' +
      'brief proposed would have been an ACTIVE DEFECT, not a no-op: the file is a deliberate mirror of ' +
      'a SQL RPC with 13 patterns pinned by tests/unit/chairman/fixture-pattern-parity.test.js, and ' +
      'collapsing it onto lib/governance/fixture-exclusion.mjs would desynchronize the chairman console ' +
      'from the escalation path. Caught by reading the file\'s own docblock, not by running a test.',
    'Reading fixture-exclusion.mjs before wiring its two new consumers found an unimported symbol that ' +
      'would have surfaced as a runtime ReferenceError only on the fixture-match branch -- i.e. it would ' +
      'not have failed any existing test and would only have thrown in production on a real fixture row.',
    'The excluded test file (tests/unit/worker-checkin-critical-qf-priority-jump.test.js) was caught ' +
      'only because an empty "No test files found" vitest result looked wrong enough to investigate, ' +
      'rather than being read as "0 relevant tests, expected".',
    'Mutation testing was run in both directions on both new call sites (neutering isClaimableQfSupply\'s ' +
      'and isAutoStartableQF\'s fixture branches) and confirmed to flip exactly the 2 new fixture-row ' +
      'assertions while leaving the over-eating control and 9 other cases green -- the mutation\'s ' +
      'application and full revert were both verified via git diff / git status --porcelain rather than ' +
      'assumed, closing the "a mutation that does not mutate reads identical to a clean pass" failure mode.',
  ],

  what_needs_improvement: [
    'The tranche was scoped by grepping for a keyword pattern across site names, not by reading what ' +
      'each site does: 3 of the 5 originally-planned sites (critical-qf-jump.cjs, ' +
      'chairman-decision-sla-sweep.mjs, adam-decision-email.mjs) turned out not to need the conversion, ' +
      'and one of those three would have been an active regression against a 13-pattern parity-pinned ' +
      'file if converted as written. This is the THIRD and FOURTH instance of a name-matched-not-' +
      'behavior-verified scoping error inside this same SD family -- the scoping method itself, not just ' +
      'this one brief, needs a "read before you count it as in-scope" gate.',
    'Conversion 1 (claim path rejects fixture QFs) silently created phantom supply: every free fixture ' +
      'QF became counted by the gauge but unclaimable by any worker, which is precisely the inconsistency ' +
      'lib/coordinator/qf-supply-predicate.cjs exists to prevent -- created inside this SD, by an earlier ' +
      'commit in the same SD, and only closed by conversion 3. The two conversions needed to land as one ' +
      'unit (or with an explicit interim-state check), not as sequential independent commits.',
    'The regression above went undetected by the existing guarding suite: ' +
      'tests/unit/coordinator/qf-supply-gauge-agreement.test.js asserts the correct property (for a free ' +
      'row, claim-eligible === counted-as-supply) but every row in its fixture table was real-shaped, so ' +
      'the assertion had no case that could exercise the fixture-row mismatch this SD\'s own first commit ' +
      'introduced. A correct assertion over an unrepresentative population is indistinguishable from a ' +
      'passing one, and this SD shipped exactly that combination for one commit.',
    'Six author-written verification checks produced false readings in a single session: a substring ' +
      'check collided with the success message it was verifying; a bash glob could not match brackets; ' +
      'a control could not separate two implementations from each other; a line-scoped grep corrupted a ' +
      'coordinator ruling; a mock built from a partial file read omitted a required field and reported ' +
      'two false FAILs against correct code; and a grep filter printed nothing that was nearly read as a ' +
      'pass. The author\'s own checks were the leading defect source in this session, ahead of the ' +
      'production code they were checking.',
  ],

  key_learnings: [
    'A site named on a keyword grep list is not evidence it performs the described role -- confirm by ' +
      'reading the file\'s actual decision logic (does it decide, or does it delegate?) before counting it ' +
      'as in-scope. This SD fabricated 3 of 5 planned tranche sites this way, for the third and fourth ' +
      'time in the same SD family.',
    'When two consumers of one predicate govern opposite sides of a single invariant (who may claim a row ' +
      'vs. how many rows are counted as claimable), converting one without the other in the same change ' +
      'creates a NEW defect matching the exact class the second consumer exists to prevent -- order the ' +
      'conversions as one unit, or add an interim assertion that the invariant holds between them.',
    'A regression test asserting the right property over an unrepresentative fixture population is ' +
      'indistinguishable from a passing test -- when adding a consumer that changes ACTION (not just a ' +
      'display count) based on a classification, add a fixture row shaped for that exact classification ' +
      'before trusting the existing suite to catch a desync.',
    'A test file can sit inside a project\'s unit-test directory while being permanently excluded from ' +
      'the runner config; "No test files found" and "all assertions passed" render identically to a ' +
      'human skimming a green run. Worth quantifying repo-wide: how many other tracked test files fall ' +
      'inside vitest\'s unit-project exclude list while still living under tests/unit/.',
    'Author-authored verification checks are not free of the failure modes they exist to catch -- this ' +
      'session alone produced 6 distinct false-negative shapes (substring collision, unescaped glob, ' +
      'non-discriminating control, line-scoped grep, incomplete mock, silent empty filter) in checks the ' +
      'same author wrote to validate their own changes. Treat a self-authored check as needing the same ' +
      'scrutiny as the code it verifies, not less.',
    'SECURITY/TESTING findings marked non-blocking at handoff time (a removed last-automatic-recovery ' +
      'path for a title-spoofed real QF; a modified function with zero coverage before and after) do not ' +
      'stay visible once the SD closes unless they are explicitly carried forward as their own tracked ' +
      'item -- "non-blocking" at handoff is not the same as "resolved", and the SD\'s own context is the ' +
      'only place that link currently lives.',
  ],

  action_items: [
    {
      title: 'Quantify vitest unit-project EXCLUDE-list blind spot repo-wide',
      description:
        'tests/unit/worker-checkin-critical-qf-priority-jump.test.js sits in the vitest unit project\'s ' +
        'exclude list and returns "No test files found" while reading as coverage. Enumerate every ' +
        'tracked file under tests/unit/ that is excluded from the unit vitest project config and assess ' +
        'how many carry pins that can never fail as a result.',
      priority: 'high',
      owner_role: 'PLAN',
      category: 'testing',
    },
    {
      title: 'File the SECURITY-carried residual-risk finding as its own tracked item',
      description:
        'This SD removes the last AUTOMATIC recovery path for a real QF carrying a fixture-shaped title ' +
        '(pre-SD it was hidden from sd:next but still self-claimable; post-SD it is stranded from every ' +
        'automatic path). Bounded and non-blocking per SECURITY evidence 22b03547, but should not close ' +
        'with this SD -- file separately so the finding stays visible after this SD\'s context is gone.',
      priority: 'medium',
      owner_role: 'LEAD',
      category: 'security',
    },
    {
      title: 'File the TESTING-carried zero-coverage finding as its own tracked item',
      description:
        'lib/coordinator/coordination-events.cjs gatherCompletionBoundaryExitInputs has zero test ' +
        'coverage both before and after being modified at line 505 by this SD (TESTING evidence ' +
        '8d7b266c). Track as a follow-up rather than letting it ride inside this SD\'s closure.',
      priority: 'medium',
      owner_role: 'PLAN',
      category: 'testing',
    },
    {
      title: 'Add a claim-path/supply-gauge consistency check for future fixture-predicate consumers',
      description:
        'Add a lint/test-level guard that fails when a claim-eligibility filter is added for a predicate ' +
        'without a corresponding supply-count filter for the same predicate (or vice versa), so the ' +
        'phantom-supply defect class this SD both introduced and fixed cannot recur silently across a ' +
        'future SD\'s sequential commits.',
      priority: 'medium',
      owner_role: 'EXEC',
      category: 'process',
    },
  ],

  success_patterns: [
    'Reading the target file end-to-end before converting it eliminated 2 of 5 planned conversions and ' +
      'prevented a 3rd from becoming an active regression against a 13-pattern parity-pinned file',
    'Reading fixture-exclusion.mjs before wiring new consumers caught an unimported symbol that would ' +
      'have thrown ReferenceError only on the live fixture-match branch',
    'Two-directional mutation testing on both new call sites, with the mutation\'s application and full ' +
      'revert independently verified via git diff/git status rather than assumed',
    'An unexpectedly empty vitest result was investigated rather than accepted, surfacing a permanently ' +
      'excluded test file',
  ],
  failure_patterns: [
    'Grep-by-name scoping fabricated 3 of 5 tranche sites (3rd/4th instance of this exact error in the ' +
      'SD family); one would have been an active regression if converted as planned',
    'Conversion 1 (claim-path fixture rejection) created phantom supply -- counted but unclaimable -- ' +
      'the exact defect class conversion 3 in this same SD exists to close',
    'The guarding regression suite went green through that self-created regression because its fixture ' +
      'population contained no fixture-shaped row to exercise the mismatch',
    '6 author-written verification checks produced false negatives in one session across 6 distinct ' +
      'failure shapes (substring collision, unescaped glob, non-discriminating control, line-scoped ' +
      'grep, incomplete mock, silent empty filter)',
  ],
  improvement_areas: [
    'Scope tranche sites by reading behavior, not by keyword-matching names',
    'Sequence multi-consumer predicate conversions so an interim commit cannot leave the invariant broken',
    'Add fixture-shaped rows to regression fixtures whenever a new consumer turns classification into action',
    'Quantify the vitest exclude-list blind spot repo-wide, not just for the one file caught here',
  ],

  metadata: {
    sd_key: SD_KEY,
    branch: 'feat/SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-C',
    commits: ['569d361f543', '2afe4b038c6', '29900c23edc', 'e2474815594'],
    loc_net: 460,
    handoffs_completed: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN'],
    handoff_scores: { LEAD_TO_PLAN: 92, PLAN_TO_EXEC: 96, EXEC_TO_PLAN: 87 },
    sub_agent_evidence: {
      testing_exec: '8d7b266c-c6d5-425b-8cab-63d7d3e02c41',
      security_exec: '22b03547-6afe-403a-bf78-a6ca51d12402',
    },
    carried_forward_findings: [
      'SECURITY F1: last automatic recovery path removed for a title-spoofed real QF (non-blocking, bounded)',
      'TESTING: lib/coordinator/coordination-events.cjs gatherCompletionBoundaryExitInputs has zero coverage before/after L505 change',
      'tests/unit/worker-checkin-critical-qf-priority-jump.test.js excluded from vitest unit project — repo-wide prevalence unquantified',
    ],
  },
};

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  const s = createClient(url, key);

  const { data: ins, error: insErr } = await s.from('retrospectives').insert(retro).select('id, quality_score, status, retro_type, retrospective_type').single();
  if (insErr) {
    console.error('Insert failed:', insErr.message);
    process.exit(1);
  }
  console.log('RETROSPECTIVE_ROW_ID=' + ins.id);
  console.log('COMPUTED_QUALITY_SCORE=' + ins.quality_score);
  console.log('STATUS=' + ins.status);
  console.log('RETRO_TYPE=' + ins.retro_type + ' / RETROSPECTIVE_TYPE=' + ins.retrospective_type);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
