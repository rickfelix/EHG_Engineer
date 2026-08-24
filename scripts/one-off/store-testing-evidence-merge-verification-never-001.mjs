// SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 — TESTING sub-agent evidence writer (PLAN phase).
// Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001';
const PHASE = 'PLAN';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 90,
  summary:
    'PLAN-phase test-strategy review of the PRD test plan (TS-1..TS-8) against the ACTUAL structure of ' +
    'createPRMergeVerificationGate (scripts/modules/handoff/executors/lead-final-approval/gates.js:628-947). Findings are MEASURED, not ' +
    'read: two throwaway vitest probes were written, executed, and deleted (see metadata.probe_method). Direction is right and the ' +
    'mocking pattern IS reusable, but five defects must be fixed before EXEC or the SD ships a gate that fails every correctly-shipped SD. ' +
    'HEADLINE (measured, probe assertion passed): a merged-and-branch-deleted SD -- the NORMAL end state after /ship with --delete-branch -- ' +
    'produces a BYTE-IDENTICAL gate result to a never-pushed SD (JSON.stringify(merged) === JSON.stringify(neverPushed)). Both remote-only ' +
    'scans return zero in both worlds, so "both scans zero" is NOT a discriminator for never-pushed and a naive FR-1 would fail 100% of ' +
    'cleanly shipped SDs. FR-1 needs a POSITIVE-evidence source (a repo-level `gh pr list --state merged` filtered through branchBelongsToSd, ' +
    'and/or LOCAL branch enumeration) -- the primitive FR-1 AC-3 names, `git ls-remote --heads origin <branch>`, cannot answer the question ' +
    'at all: branchBelongsToSd is a PREDICATE over a name you already hold, not an ENUMERATOR, so in the zero-evidence case there is no ' +
    'branch name to feed it, and remote-absence is precisely the normal post-merge state. SECOND (measured): the true blast radius is 6 ' +
    'existing assertions across TWO files, not the 1 file FR-3 names. Probes confirmed 3 fixtures in ' +
    'gates/pr-merge-verification.test.js (happy-path/other-SD-branches, squash-merge artifact, child-key-parent-passes) and 3 in the ' +
    'UNNAMED tests/unit/harness/prmerge-exact-match.test.js (prefix-sharing SD line 81, parent-with-child-PR line 90, chore/ branch line 107) ' +
    'all terminate on gates.js:906-915 with details {openPRs:0, unmergedBranches:0} under sd_type=infrastructure -- the exact line FR-1 ' +
    'converts to a failure, and the exact type FR-2 declares NON-exempt. So FR-3 AC-3 ("all 6 existing tests still pass unmodified") is ' +
    'unsatisfiable as written and must be reworded. That second file\'s own header states "THE ESTATE MUST NOT HOLD TWO TESTS PINNING ' +
    'OPPOSITE BEHAVIOURS OF ONE FUNCTION ... rewritten to ONE semantics in the same change" -- an in-repo standing rule the PRD violates by ' +
    'omission. It also already covers TS-3 (open-PR fails, 3 assertions), so TS-3 is mislabeled as living in the wrong file rather than ' +
    'uncovered. Baselines both green before probes: 6/6 and 13/13.',
  findings: [
    {
      id: 'TS5-merged-vs-neverpushed-indistinguishable',
      severity: 'critical',
      note:
        'MEASURED by probe (assertion passed): JSON.stringify(mergedAndBranchDeleted) === JSON.stringify(neverPushed). After a normal /ship ' +
        '(gh pr merge --delete-branch + git fetch --prune), Scan A returns 0 open PRs and Scan B returns 0 owned remote branches -- IDENTICAL ' +
        'to a branch that was never pushed. Therefore "both scans zero -> FAIL" as literally specified in FR-1 would fail EVERY correctly ' +
        'shipped SD. TS-5 is the single highest-value test in the plan and is mislabeled "unit (existing, regression)" -- no such test exists ' +
        'in either file. It must be authored as a NEW test and treated as the blocking false-positive control for FR-1. REQUIRED FIX: FR-1 ' +
        'must acquire a positive-evidence source. Recommended: a repo-level `gh pr list --repo <R> --state merged --search "<sdKey>" --json ' +
        'headRefName,number,url` filtered through the SAME branchBelongsToSd resolver (symmetric counterpart of Scan A, satisfies FR-1 AC-3 ' +
        'honestly), plus optionally `git log origin/main --grep=<sdKey>` as a second signal.',
    },
    {
      id: 'FR1-AC3-primitive-cannot-answer-the-question',
      severity: 'critical',
      note:
        'FR-1 AC-3 requires the check be "driven by the SAME branchBelongsToSd/loadKeySet resolver" using `git ls-remote --heads origin ' +
        '<branch>`. These two requirements are in tension and the FR never says where <branch> comes from. branchBelongsToSd(branch, sdKey, ' +
        'keySet) is a PREDICATE over a name you already hold (lib/git/branch-owner.js:257) -- it cannot enumerate names. In the zero-evidence ' +
        'case Scan A yielded no headRefName and Scan B yielded no matching remote branch, so there is no name to test. The only remaining ' +
        'candidates are the 4 anchored patterns at gates.js:645-650 -- exactly the anchored-matching approach RESUME-FINAL-READ-001 FR-3 ' +
        'proved insufficient. And `git ls-remote --heads origin` with NO branch arg lists all remote heads, which is the same information as ' +
        'Scan B (only more authoritative, since git branch -r reads local remote-tracking refs and the `git fetch --prune` at gates.js:788-791 ' +
        'swallows its own failure with a warning). RECOMMENDED TWO-SIDED DESIGN: enumerate LOCAL branches (`git for-each-ref ' +
        '--format=%(refname:short) refs/heads/`), filter with branchBelongsToSd (resolveBranchOwner strips an optional origin/ prefix at ' +
        'branch-owner.js:113, so local names work unchanged), then confirm never-pushed per candidate with the FR-1 primitive `git ls-remote ' +
        '--heads origin <branch>` (empty = never pushed). This uses the exact named primitive AND the exact named resolver, and is two-sided. ' +
        'DOCUMENT THE RESIDUAL: local-branch enumeration is HOST-LOCAL -- if LEAD-FINAL runs on a different machine than EXEC, the ' +
        'never-pushed branch is invisible and the gate still passes. State that limit in the code comment and PRD rather than claiming the ' +
        'gap is closed.',
    },
    {
      id: 'blast-radius-6-assertions-2-files-FR3-AC3-unsatisfiable',
      severity: 'critical',
      note:
        'MEASURED by two probes (all assertions passed). Landing on gates.js:906-915 with passed:true, details.openPRs===0, ' +
        'details.unmergedBranches===0, sd_type=infrastructure: (A) scripts/modules/handoff/executors/lead-final-approval/gates/' +
        'pr-merge-verification.test.js -- "happy path: only other-SD branches" (:102), "squash-merge artifact" (:137), "CHILD key does not ' +
        'block the parent" first assertion (:165). (B) tests/unit/harness/prmerge-exact-match.test.js -- NOT NAMED ANYWHERE IN THE PRD -- ' +
        '"does NOT block on a different SD whose key shares a prefix" (:81), "does NOT block the PARENT when the open PR belongs to a CHILD ' +
        'key" (:90), "ignores an unsupported branch type (chore/)" (:107). That file\'s header (lines 12-18) states the estate must not hold ' +
        'two tests pinning opposite behaviours of one function and that both files are to be rewritten to one semantics IN THE SAME CHANGE. ' +
        'FR-3 must add file (B) to scope. FR-3 AC-3 should be reworded from "All 6 existing tests still pass unmodified" to: "No existing ' +
        'assertion changes VERDICT; mock fixtures in BOTH files may be extended with the new command(s), and any verdict change must be ' +
        'justified in the test body." Note file (B) already covers TS-3 (open-PR fails: :66, :74, :99, :117) and its mockGh already stubs ' +
        '`--state merged` -> \'[]\', which is why a merged-PR-evidence design flips those 3 unless their fixtures are updated.',
    },
    {
      id: 'squash-merge-evidence-is-discarded',
      severity: 'high',
      note:
        'MEASURED by probe (assertion passed): in the squash-merge fixture the gate observes merged PR #42 via `gh pr list --head <branch> ' +
        '--state merged` (gates.js:824-832) but the result contains no trace of it -- JSON.stringify(result.details) does NOT match /42/. ' +
        '`prMerged` is a function-local `let` inside the branch loop (gates.js:822) and is thrown away. If merged-PR observation is to serve ' +
        'as FR-1 positive evidence, it must be hoisted into an accumulator (e.g. mergeEvidence[]) declared alongside unmergedBranches at ' +
        'gates.js:781 and surfaced in details. Without this hoist, TS-7 (squash-merge artifact still passes) FLIPS to FAIL, because that ' +
        'fixture ends with unmergedBranches=0 and openPRs=0 -- indistinguishable from never-pushed.',
    },
    {
      id: 'TS1-green-for-the-wrong-reason-hazard',
      severity: 'high',
      note:
        'Both test files replace the WHOLE sd-type-checker module: vi.mock(\'../../../../sd-type-checker.js\', () => ({ getTierForSD: ' +
        'vi.fn(() => 3) })) at pr-merge-verification.test.js:32. gates.js:15 imports getTierForSD from that same module. If the FR-1/FR-2 ' +
        'implementation imports ANY additional symbol from sd-type-checker.js -- which is precisely what FR-2 warns a future "simplification" ' +
        'back to isInfrastructureSDSync would do -- the mock yields undefined, the call throws, the outer catch at gates.js:917-943 returns ' +
        'passed:false/score:0, and a TS-1 asserting only passed===false GOES GREEN WITH ZERO never-pushed LOGIC PRESENT. TS-1 must assert a ' +
        'DISCRIMINATOR, exactly as the existing key-set test does at pr-merge-verification.test.js:77-78 (details.resolver / details.reason). ' +
        'REQUIRED: TS-1 asserts details.reason === \'never_pushed\' (or equivalent stable token) AND the literal message phrase AND the SD key ' +
        '-- the outer catch produces none of those. The PRD\'s TS-1 currently specifies only the message phrase; the message alone is a weak ' +
        'but non-zero discriminator, the details token is the strong one. Add both.',
    },
    {
      id: 'fixture-helper-needs-sd_type-parameterization',
      severity: 'medium',
      note:
        'TS-2 requires an sd_type=\'documentation\' context, but makeCtx hardcodes sd_type: \'infrastructure\' in BOTH files ' +
        '(pr-merge-verification.test.js:45 and prmerge-exact-match.test.js:32). Both helpers need an sdType parameter defaulting to ' +
        '\'infrastructure\' so every existing call site is untouched. Trivial, but the PRD does not mention it and TS-2 cannot be written ' +
        'without it. Also note the two files differ in repo fan-out, which matters for any per-repo evidence query or call-count assertion: ' +
        'MEASURED, pr-merge-verification.test.js\'s ctx has no target_application so computeReposForSD Tier-3 scans BOTH repos (open-PR scan ' +
        'fires 2x), while prmerge-exact-match.test.js\'s ctx sets target_application:\'EHG_Engineer\' so Tier-2 scans ONE repo (fires 1x).',
    },
    {
      id: 'mocking-pattern-IS-reusable-positive-finding',
      severity: 'info',
      note:
        'Direct answer to the reusability question, and it is good news. The vi.mock(\'child_process\') + injected loadKeySet pattern is ' +
        'genuinely reusable for TS-1/TS-2. Mocks dispatch on COMMAND STRING (cmd.startsWith / cmd.includes / cmd === ), never on call ORDER or ' +
        'call COUNT, so adding a new execSync command to the gate does not perturb existing fixtures positionally -- no ordering fragility. ' +
        'loadKeySet injection (gates.js:633, deps.loadKeySet) keeps every case in the vitest `unit` project with no DB, which matters because ' +
        'the `db` project runs zero files when no non-production target is designated. MEASURED CAVEAT that decides the design: every ' +
        'mockImplementation ends in a catch-all `return \'\'`. A new command therefore silently receives \'\'. Probe measured both readings: ' +
        '`git ls-remote ...` -> \'\' reads as "no remote branch" (BENIGN -- existing tests keep passing), whereas `gh pr list --state merged ' +
        '--json ...` -> \'\' parses via JSON.parse(x || \'[]\') to [] which reads as "NO MERGE EVIDENCE" (FLIPS the 6 assertions above). The ' +
        'choice of evidence source therefore directly determines whether FR-3 AC-3 is satisfiable without touching existing fixtures.',
    },
    {
      id: 'chore-branch-produces-a-false-diagnosis',
      severity: 'medium',
      note:
        'prmerge-exact-match.test.js:105-110 deliberately pins that a `chore/` branch is invisible to ownership resolution (chore is not in ' +
        'BRANCH_TYPE_TOKENS) -- a known, visible coverage gap. MEASURED: that fixture lands on the terminal pass. Under FR-1 it would newly ' +
        'FAIL, which is arguably an improvement, but it would fail with the message "no branch was ever pushed" for a branch that WAS pushed ' +
        'and even has an open PR (#6664). That is a false diagnosis pointing the operator at the wrong remediation. Either widen ' +
        'BRANCH_TYPE_TOKENS (out of scope, and the pin exists to make that a conscious decision) or soften FR-1\'s message to name what was ' +
        'actually measured -- "no PUSHED branch or merged PR could be found for <SD> under the recognized branch types (feat|fix|docs|test)" ' +
        '-- and enumerate the recognized types in the issue text.',
    },
    {
      id: 'TS8-census-harness-unspecified',
      severity: 'medium',
      note:
        'TS-8 is typed "unit/integration" and specifies a fixture set of completed SDs, but names no harness. A DB-backed test files under the ' +
        'vitest `db` project, which runs ZERO files when no non-production target is designated -- a test that cannot fire, inside an SD about ' +
        'guards that cannot fire (the same trap documented at gates.js:629-632 and pr-merge-verification.test.js:49-51). REQUIRED: FR-4\'s ' +
        'census must expose a PURE, exported classifier -- e.g. isNeverPushedSpecimen({ sd, shipReviewFindings, metadata }) -> boolean -- so ' +
        'TS-8 is a unit test over in-memory fixtures with no Supabase client, and the one-off script is a thin I/O shell around it. Without ' +
        'that split, TS-8 is either unwritable or silently skipped.',
    },
    {
      id: 'baselines-green-before-review',
      severity: 'info',
      note:
        'Recorded so any post-EXEC change is measured against a known-good baseline rather than an assumed one. Both suites were RUN, not ' +
        'read: scripts/modules/handoff/executors/lead-final-approval/gates/pr-merge-verification.test.js 6/6 passed (1.12s); ' +
        'tests/unit/harness/prmerge-exact-match.test.js 13/13 passed. Neither file is quarantined. Two probe files were created, executed, and ' +
        'DELETED (git status confirmed clean of probe artifacts): scripts/modules/handoff/executors/lead-final-approval/gates/' +
        'pr-merge-probe.test.js (6/6 assertions passed) and tests/unit/harness/prmerge-probe2.test.js (4/4 assertions passed).',
    },
  ],
  metadata: {
    review_type: 'test_strategy_review_pre_implementation',
    prd_id: 'PRD-SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001',
    gate_file: 'scripts/modules/handoff/executors/lead-final-approval/gates.js',
    gate_function: 'createPRMergeVerificationGate',
    gate_lines: '628-947',
    fr1_target_line: '906-915',
    test_files_in_scope: [
      'scripts/modules/handoff/executors/lead-final-approval/gates/pr-merge-verification.test.js',
      'tests/unit/harness/prmerge-exact-match.test.js',
    ],
    test_file_missing_from_prd: 'tests/unit/harness/prmerge-exact-match.test.js',
    baseline_pr_merge_verification: '6/6 passed',
    baseline_prmerge_exact_match: '13/13 passed',
    assertions_at_risk_of_flipping: 6,
    probe_method:
      'Two temporary vitest files were authored, executed, and deleted. Every claim of the form "fixture X lands on the FR-1 target line" ' +
      'is a PASSING assertion on details.openPRs===0 && details.unmergedBranches===0 && passed===true, not a reading of the source.',
    ts_verdicts: {
      'TS-1': 'INSUFFICIENT — must assert a details discriminator, not only passed===false (whole-module sd-type-checker mock makes the outer catch a false-green path)',
      'TS-2': 'BLOCKED — makeCtx hardcodes sd_type in both files; needs parameterization',
      'TS-3': 'COVERED, MISLOCATED — exists in tests/unit/harness/prmerge-exact-match.test.js (:66,:74,:99,:117), not in the file FR-3 names',
      'TS-4': 'COVERED — pr-merge-verification.test.js:117 (suffixed unmerged branch)',
      'TS-5': 'DOES NOT EXIST and is the highest-value test in the plan — mislabeled "existing"; measured byte-identical to never-pushed',
      'TS-6': 'COVERED but AT RISK — pr-merge-verification.test.js:155 parent assertion lands on the FR-1 target line',
      'TS-7': 'COVERED but AT RISK — pr-merge-verification.test.js:137; requires hoisting the discarded prMerged observation',
      'TS-8': 'UNWRITABLE AS SPECIFIED — no harness named; needs a pure exported classifier to stay in the unit tier',
    },
    conditions_to_clear: [
      'FR-1 acquires a positive-merge-evidence source; TS-5 authored as a NEW blocking false-positive control',
      'FR-3 adds tests/unit/harness/prmerge-exact-match.test.js to scope and AC-3 is reworded to "no verdict changes" rather than "unmodified"',
      'TS-1 asserts details.reason plus the message phrase plus the SD key',
      'FR-4 exposes a pure classifier so TS-8 is a unit test',
      'FR-1 message names the recognized branch types so the chore/ case is not misdiagnosed',
    ],
  },
  execution_time_ms: 900000,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'TESTING',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('TESTING', SD_ID, { name: 'QA Engineering Director' }, results, { phase: PHASE });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_PHASE=' + (stored?.phase || 'n/a'));
console.log('STORED_SD_ID=' + (stored?.sd_id || 'n/a'));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('EXECUTED_FROM_CWD=' + results.metadata.executed_from_cwd);
