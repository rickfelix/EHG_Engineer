// SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-C — RETRO sub-agent evidence writer (PLAN_VERIFICATION phase,
// the required-set entry for PLAN-TO-LEAD per scripts/modules/handoff/required-subagents.js).
// Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
//
// The retrospective content itself lives in the `retrospectives` table row written by
// scripts/one-off/insert-retro-sd-leo-infra-one-synthetic-row-001-c.mjs (id af30eb46-f340-49da-803d-
// 86de3d365679, trigger-computed quality_score=90, status=DRAFT). This row is the GATE_SUBAGENT_
// EVIDENCE-readable record that the retrospective was produced and what it found.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = '3d0100d7-1cc3-427a-b5a2-bfeff80d3f57';
const SD_KEY = 'SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-C';
const PHASE = 'PLAN_VERIFICATION';
const CODE = 'RETRO';

const RETRO_ROW_ID = 'af30eb46-f340-49da-803d-86de3d365679';

const results = {
  verdict: 'PASS',
  confidence: 88,
  validation_mode: 'retrospective',
  execution_time_ms: 0,
  summary:
    'Retrospective produced and stored (retrospectives.id ' + RETRO_ROW_ID + ', trigger-computed ' +
    'quality_score=90, status=DRAFT). Extracts transferable patterns rather than a timeline: the ' +
    'planned 5-site tranche was actually 2 (3 sites fabricated by name-not-behavior grep scoping, one ' +
    'of which would have been an active regression against a 13-pattern parity-pinned file if ' +
    'converted as planned); a fix in this SD (claim-path fixture rejection) created a phantom-supply ' +
    'defect elsewhere in the SAME SD, which the guarding test suite went green through because its ' +
    'fixture population had no case shaped to trigger the regression; a pinned unit test file sits ' +
    'excluded from the vitest unit project and can never fail; and the author\'s own verification ' +
    'checks were the leading defect source in the session (6 distinct false-negative shapes). ' +
    'Findings are recorded honestly rather than softened into a success narrative with caveats, per ' +
    'the review brief for this evidence run.',
  findings: [
    {
      id: 'F1-planned-tranche-of-5-was-actually-2-name-not-behavior-scoping',
      severity: 'high',
      note: 'critical-qf-jump.cjs does not decide eligibility (delegates to isAutoStartableQF at ' +
        'worker-checkin.cjs:203, already the target of conversion 1). ' +
        'chairman-decision-sla-sweep.mjs and adam-decision-email.mjs already filtered fixtures via ' +
        'lib/chairman/chairman-actionable.mjs. Converting chairman-actionable.mjs as originally planned ' +
        'would have been an ACTIVE DEFECT: it is a deliberate mirror of the get_pending_chairman_items ' +
        'SQL RPC with 13 patterns pinned by tests/unit/chairman/fixture-pattern-parity.test.js, and ' +
        'collapsing it onto the canonical predicate would desynchronize the chairman console from the ' +
        'escalation path. This is the 3rd and 4th instance of the name-not-behavior scoping error in ' +
        'this SD family.',
      recommendation: 'Add a behavior-read step (does the site decide, or delegate?) to tranche-scoping ' +
        'triage before any site is counted as in-scope, ahead of writing code for it.'
    },
    {
      id: 'F2-fix-created-a-defect-elsewhere-in-the-same-sd',
      severity: 'high',
      note: 'Commit 1 (claim path rejects fixture QFs) made every free fixture QF PHANTOM SUPPLY -- ' +
        'counted by the gauge, unclaimable by a worker -- exactly the inconsistency ' +
        'lib/coordinator/qf-supply-predicate.cjs exists to prevent. Commit 3 (this same SD) fixed it. ' +
        'The two conversions needed to land as one unit or with an explicit interim invariant check.',
      recommendation: 'Sequence multi-consumer predicate conversions (claim eligibility + supply count) ' +
        'as one atomic change, or add an interim assertion the invariant holds between them.'
    },
    {
      id: 'F3-guarding-suite-went-green-through-the-regression',
      severity: 'high',
      note: 'tests/unit/coordinator/qf-supply-gauge-agreement.test.js asserts the correct property (for ' +
        'a free row, claim-eligible === counted-as-supply) but every row in its fixture table was ' +
        'real-shaped, so it could not catch the phantom-supply regression in F2. A correct assertion ' +
        'over an unrepresentative population is indistinguishable from a passing one.',
      recommendation: 'When a new consumer turns a classification into ACTION (not just a display ' +
        'count), add a fixture row shaped for that exact classification before trusting an existing ' +
        'suite to catch a desync.'
    },
    {
      id: 'F4-unit-test-file-excluded-from-runner-cannot-fail',
      severity: 'high',
      note: 'tests/unit/worker-checkin-critical-qf-priority-jump.test.js is in the vitest unit ' +
        'project\'s EXCLUDE list -- vitest answers "No test files found". Pins written there could ' +
        'never fail while reading as coverage. Caught only because the empty result looked wrong. Not ' +
        'independently verified in THIS evidence run whether other tracked tests/unit/ files share ' +
        'this exclusion -- flagged as a repo-wide question worth quantifying, not asserted as measured ' +
        'here.',
      recommendation: 'Enumerate every tracked file under tests/unit/ against the vitest unit project ' +
        'exclude list and report how many carry pins that can never execute.'
    },
    {
      id: 'F5-authors-own-checks-were-the-leading-defect-source',
      severity: 'medium',
      note: 'Six false negatives in one session, by the same author who wrote the production code: a ' +
        'substring check colliding with the success message it verified; a bash glob that could not ' +
        'match brackets; a control that could not separate two implementations; a line-scoped grep that ' +
        'corrupted a coordinator ruling; a mock built from a partial file read omitting a required ' +
        'field (2 false FAILs on correct code); and a grep filter printing nothing that was nearly read ' +
        'as a pass.',
      recommendation: 'Treat self-authored verification checks with the same scrutiny as the code they ' +
        'verify -- run them against a known-bad case before trusting a green result.'
    },
    {
      id: 'F6-carried-not-closed-findings-from-exec-phase-sub-agents',
      severity: 'medium',
      note: 'SECURITY (evidence 22b03547) found this SD removes the last AUTOMATIC recovery path for a ' +
        'real QF carrying a fixture-shaped title (bounded, non-blocking). TESTING (evidence 8d7b266c) ' +
        'found lib/coordinator/coordination-events.cjs gatherCompletionBoundaryExitInputs has ZERO ' +
        'coverage before and after being modified at line 505. Neither is closed by this SD; both are ' +
        'recorded in the retrospective action_items so they do not vanish with the SD\'s context.',
      recommendation: 'File both as their own tracked follow-up items rather than letting them close ' +
        'silently with this SD.'
    },
    {
      id: 'F7-what-worked-specifically',
      severity: 'info',
      note: 'Reading the target file before editing it killed 2 of 5 planned conversions, found an ' +
        'unimported symbol that would have been a runtime ReferenceError, stopped the parity-pin break ' +
        'in F1, and caught the excluded test file in F4. Twice the refutation of the author\'s own plan ' +
        'was a docblock the author had written earlier in the same SD family. Two-directional mutation ' +
        'testing on both new call sites had its application and full revert independently verified via ' +
        'git diff/git status rather than assumed.',
      recommendation: 'None -- preserve this as the transferable pattern: read-before-edit and ' +
        'verify-the-mutation-applied are the two habits that produced every genuine catch this session.'
    }
  ],
  recommendations: [
    'Quantify the vitest unit-project EXCLUDE-list blind spot repo-wide (F4) as a dedicated follow-up, ' +
      'not folded into this SD.',
    'File the SECURITY and TESTING carried-forward findings (F6) as their own tracked items so they do ' +
      'not close silently with this SD.',
    'Add a claim-path/supply-gauge consistency check so the F2/F3 phantom-supply defect class cannot ' +
      'recur silently across a future SD\'s sequential commits.'
  ],
  warnings: [
    'This SD both introduced (commit 1) and fixed (commit 3) a real supply/claim-eligibility ' +
      'inconsistency within its own scope -- reviewed here as a pattern to prevent recurrence, not as a ' +
      'residual defect in the merged state (the fix is present in the final diff).',
    'retrospectives.quality_score is trigger-computed from content shape on INSERT, not authored by ' +
      'this evidence run; the stored value (90) should be read as the DB\'s own measurement, not this ' +
      'sub-agent\'s claim.'
  ],
  critical_issues: [],
  detailed_analysis:
    'SCOPE: RETRO sub-agent evidence for the PLAN-TO-LEAD handoff of SD-LEO-INFRA-ONE-SYNTHETIC-ROW-' +
    '001-C. Reviewed four commits on feat/SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-C (569d361f543, ' +
    '2afe4b038c6, 29900c23edc, e2474815594), the three prior handoffs (LEAD-TO-PLAN 92, PLAN-TO-EXEC ' +
    '96, EXEC-TO-PLAN 87), and the EXEC-phase TESTING (8d7b266c, PASS) and SECURITY (22b03547, PASS) ' +
    'evidence rows.\n\n' +
    'METHOD: extracted transferable patterns rather than a chronological timeline, per the review ' +
    'brief. Verified against this worktree (feat/SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-C) rather than the ' +
    'shared root, which is ~12 commits behind origin/main. Cross-checked the retrospective content ' +
    'against the live TESTING/SECURITY evidence rows and the live sd_phase_handoffs rows for this SD ' +
    '(sd_id 3d0100d7-1cc3-427a-b5a2-bfeff80d3f57) rather than re-deriving scores from memory.\n\n' +
    'FULL RETROSPECTIVE: stored as retrospectives.id ' + RETRO_ROW_ID + ' (status=DRAFT, ' +
    'trigger-computed quality_score=90 on INSERT from what_went_well/key_learnings/action_items/' +
    'what_needs_improvement shape -- 5 what_went_well items, 6 key_learnings each >20 chars, 4 ' +
    'action_items, 4 what_needs_improvement items, none matching the trigger\'s generic/dismissive-' +
    'phrase deny-list). Left DRAFT rather than PUBLISHED so the trigger\'s PUBLISHED->=70 gate is not ' +
    'exercised speculatively by this evidence run; promotion to PUBLISHED is a downstream decision, not ' +
    'part of this evidence.\n\n' +
    'BOTTOM LINE: PASS. The retrospective was produced, is stored, extracts genuinely transferable ' +
    'patterns (scoping-by-behavior-not-name; multi-consumer-predicate sequencing; fixture-population ' +
    'representativeness; test-runner-exclusion blind spots; self-authored-check scrutiny), and does not ' +
    'soften the SD\'s own self-inflicted regression or its verification-check failure rate into a ' +
    'success narrative with caveats.',
  metadata: {
    version: '1.0.0',
    review_type: 'retrospective_pattern_extraction',
    worktree_path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-C',
    branch: 'feat/SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-C',
    commits_reviewed: ['569d361f543', '2afe4b038c6', '29900c23edc', 'e2474815594'],
    retrospective_row_id: RETRO_ROW_ID,
    retrospective_quality_score_computed: 90,
    retrospective_status: 'DRAFT',
    handoff_scores: { LEAD_TO_PLAN: 92, PLAN_TO_EXEC: 96, EXEC_TO_PLAN: 87 },
    prior_evidence_reviewed: {
      testing_exec: '8d7b266c-c6d5-425b-8cab-63d7d3e02c41',
      security_exec: '22b03547-6afe-403a-bf78-a6ca51d12402'
    },
    files_reviewed: [
      'scripts/worker-checkin.cjs',
      'lib/coordinator/qf-supply-predicate.cjs',
      'lib/coordinator/coordination-events.cjs',
      'lib/governance/fixture-exclusion.mjs',
      'lib/chairman/chairman-actionable.mjs (read-only, confirmed pre-existing fixture filtering + 13-pattern parity pin)',
      'scripts/critical-qf-jump.cjs (read-only, confirmed delegates to isAutoStartableQF, not an eligibility decision site)',
      'tests/unit/coordinator/qf-supply-gauge-agreement.test.js',
      'tests/unit/worker-checkin-critical-qf-priority-jump.test.js (confirmed excluded from vitest unit project)'
    ]
  }
};

// results.summary and results.findings are not mapped columns on sub_agent_execution_results
// (established pattern from prior evidence writers for this SD) -- fold into detailed_analysis.
const NL = String.fromCharCode(10);
const HR = '-'.repeat(72);
results.detailed_analysis = [
  'SUMMARY',
  '=======',
  results.summary,
  '',
  results.detailed_analysis,
  '',
  'PER-SECTION FINDINGS',
  '='.repeat(72),
  '',
  results.findings.map((f) => (
    '[' + String(f.severity).toUpperCase() + '] ' + f.id + NL +
    'FINDING: ' + f.note + NL +
    'RECOMMENDATION: ' + (f.recommendation || '(none - informational)')
  )).join(NL + NL + HR + NL + NL)
].join(NL);

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: CODE,
  targetApplication: 'EHG_Engineer',
  fallback: 'EHG_Engineer'
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults(
  CODE,
  SD_ID,
  { name: 'Continuous Improvement Coach' },
  results,
  { sdKey: SD_KEY, phase: PHASE }
);

console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_CONFIDENCE=' + results.confidence);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('REPO_RESOLVED=' + results.metadata.repo_resolved);
console.log('EXECUTED_FROM_CWD=' + results.metadata.executed_from_cwd);
