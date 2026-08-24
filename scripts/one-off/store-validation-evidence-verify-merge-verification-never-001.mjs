// SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 — VALIDATION sub-agent evidence writer (PLAN_VERIFICATION phase).
// Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001';
const PHASE = 'PLAN_VERIFICATION';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 91,
  summary:
    'PRD-fidelity verification of the shipped never-pushed third state. Every claim below was MEASURED against the working tree ' +
    '(diff vs merge-base d9de13b0, direct source reads, a live test run, a live DB census re-run and independent sd_type population ' +
    'counts) — not read from the PRD narrative. IMPLEMENTATION VERDICT: the gate code genuinely delivers FR-1, FR-2, FR-3 and FR-5, ' +
    'and closes FR-4\'s previously-false "shared classifier" claim. VERIFIED: (1) FR-1 — the third state is genuinely four-gated. ' +
    'Scan A early-returns on openPRs.length>0 (gates.js:792) and on unreadableRepos (gates.js:772); Scan B early-returns on ' +
    'unmergedBranches.length>0 (gates.js:938); the block itself is guarded by mergeEvidence.length===0 (gates.js:984); and Scan C\'s ' +
    'mergedPRs.length feeds isNeverPushedSpecimen, whose hasMergedPR check disqualifies. Scan C at gates.js:992 DOES carry ' +
    '--search "${sdId}", pinned by a regression test asserting the literal command string. scan_c_saturated exists (gates.js:1020) and ' +
    'fires. (2) FR-2 — NO_CODE_SD_TYPES is exactly [documentation, docs, orchestrator] (gates.js:630): no "process", no ' +
    'isInfrastructureSDSync. Independently re-measured the population: process=0 rows, documentation=147, docs=11, orchestrator=604, ' +
    'infrastructure=3332 — confirming both that the "process" removal was correct and that FR-2\'s core argument holds (the rejected ' +
    'predicate would have exempted this SD\'s own sd_type). AC-2 satisfied (comment cites FR-2 + 73.8%/59.5%); AC-3 satisfied (zero ' +
    'isInfrastructureSDSync call sites in gates.js). (3) FR-3 — 34/34 tests pass across the three files in 576ms, covering TS-1, TS-2, ' +
    'TS-5, Scan C search-scoping, Scan C fail-closed, saturation, and the ship_review_findings rescue. (4) FR-4 — isNeverPushedSpecimen ' +
    'IS now called by the live gate (gates.js:1078), verified by repo-wide grep and by reading the call site; the census script imports ' +
    'it (line 74) and calls it (line 219). The EXEC-phase TESTING finding is genuinely closed. (5) FR-5 — the deferral comment at ' +
    'gates.js:913-921 cites this SD, FR-5, and the RESUME-FINAL-READ-001 FR-4 precedent. (6) SECURITY — gates.js:1108 uses ' +
    'execFileSync("git", ["ls-remote","--heads","origin","--",branch]); the argv array closes SEC-1. ' +
    'CONDITIONAL ON THREE MEASURED DEFECTS, none of which is a code fault: two PRD acceptance criteria are stale and FAIL as written ' +
    'against the shipped (correct) code — FR-2 AC-1 still demands "process" in the exemption list, and FR-3 AC-5 still asserts the ' +
    'chore/ fixture\'s verdict is UNCHANGED when the shipped test asserts it CHANGED from PASS to FAIL. Third and most substantive: ' +
    'the FR-4 census script\'s headline figure is under-scoped by ~180x. Its header advertises "MEASURED FINDING (round 3, final): ' +
    'dropped the count to 4/920", but running the shipped script with its DEFAULT arguments scans 3910 completed SDs and reports 731 ' +
    'specimens. I reproduced the advertised figure exactly by passing --since 2026-07-01 (921 scanned, 4 specimens) — a window that is ' +
    'neither the script default (--since 2026-01-01) nor disclosed anywhere in the header or Usage block. An operator running the first ' +
    'documented Usage line gets 731, and --commit at that scope would insert 731 feedback rows.',
  critical_issues: [],
  warnings: [
    {
      issue:
        'FR-4 CENSUS COUNT IS UNDER-SCOPED BY ~180x AND THE WINDOW IS UNDISCLOSED (measured by re-running the shipped script twice). ' +
        'scan-completed-sds-for-never-pushed-merge-verification-never-001.mjs\'s header states "MEASURED FINDING (round 3, final): ' +
        'dropped the count to 4/920" and then manually triages exactly those 4 SDs. Run with DEFAULT arguments (parseArgs sets ' +
        'since=2026-01-01, line 123) the shipped script reports: "Scanned 3910 completed SDs since 2026-01-01; 731 never-pushed ' +
        'specimen(s) found; 0 unverifiable". Passing --since 2026-07-01 reproduces the header exactly: "Scanned 921 completed SDs since ' +
        '2026-07-01; 4 never-pushed specimen(s) found". The header\'s denominator (920) and its numerator (4) therefore both belong to a ' +
        'Jul-2026+ window that is neither the default nor stated in the header, the Usage block, or FR-4. This is the ratio/extent ' +
        'mismatch class the SD is itself about: a stamped count whose measurement scope differs from the default the next operator runs.',
      severity: 'medium',
      recommendation:
        'State the --since window explicitly next to every count in the header ("4/921 for --since 2026-07-01"), and either report the ' +
        'default-scope figure (731/3910) alongside it or change the default --since to match the measured window. Also warn in the ' +
        'header that --commit at default scope would emit 731 feedback rows.',
    },
    {
      issue:
        'FR-3 AC-5 IS FALSIFIED BY THE SHIPPED TEST AND ITS STATED MECHANISM IS WRONG. AC-5 reads: the chore/ fixture "is NOT reachable ' +
        'by the new third-state check at all, because Scan A already finds its open PR and short-circuits before the third state ' +
        'evaluates — verified by a regression assertion that this fixture\'s verdict and reason are unchanged." The shipped test at ' +
        'tests/unit/harness/prmerge-exact-match.test.js:120 asserts the exact opposite and says so in its own name: "VERDICT CHANGED by ' +
        'SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001: an unsupported branch type (chore/) now FAILS". Mechanism: "chore" is not in ' +
        'BRANCH_TYPE_TOKENS (lib/git/branch-owner.js:64 = [feat, fix, docs, test]), so branchBelongsToSd returns false, Scan A never ' +
        'sees PR #6664, and nothing short-circuits — the fixture falls straight through to the third state. AC-5 was never amended ' +
        'across the PRD\'s three revisions.',
      severity: 'medium',
      recommendation:
        'Amend FR-3 AC-5 to record the actual, justified outcome (verdict changes PASS->FAIL with details.reason=never_pushed, ' +
        'justified in the test body per AC-4\'s escape hatch) and delete the incorrect "Scan A short-circuits" mechanism, so a future ' +
        'auditor comparing AC-5 to the suite does not read a FAIL.',
    },
    {
      issue:
        'OPERATIONAL CONSEQUENCE of the above, introduced by this SD: any SD whose only PR sits on an unrecognized-prefix branch ' +
        '(chore/, refactor/, perf/, ci/, build/, style/, hotfix/ — anything outside BRANCH_TYPE_TOKENS) now FAILS LEAD-FINAL-APPROVAL ' +
        'with details.reason=\'never_pushed\', a false diagnosis about a branch that WAS pushed and has a live open PR. Before this SD ' +
        'it passed. FR-4\'s census keys off that same reason token, so such SDs would also be misclassified by anything consuming gate ' +
        'output. The sole mitigation is message wording (it states only what was checked and enumerates the recognized types, and ' +
        'deliberately does not name the PR) — which the test pins.',
      severity: 'medium',
      recommendation:
        'Follow-up SD: either widen BRANCH_TYPE_TOKENS to cover the conventional-commit prefixes actually in use, or have the ' +
        'never-pushed path run one unfiltered open-PR probe before concluding, so an unrecognized-prefix branch with a live PR is ' +
        'reported as "unrecognized branch prefix" rather than as never_pushed.',
    },
    {
      issue:
        'FR-2 AC-1 IS STALE AND FAILS AS WRITTEN. It still requires the exemption list to be "exactly [documentation, docs, process, ' +
        'orchestrator]", and FR-2\'s description repeats the four-element list. The shipped code correctly has three ' +
        '(gates.js:630) — "process" was removed per SECURITY SEC-7, which I independently corroborated (sd_type=\'process\' returns 0 ' +
        'rows across strategic_directives_v2). The removal is recorded ONLY inside FR-1\'s description; FR-2 itself was never amended, ' +
        'so the AC a future auditor reads contradicts the code it is auditing.',
      severity: 'medium',
      recommendation:
        'Amend FR-2\'s description and acceptance_criteria[0] to the three-element list, citing SEC-7, so the correction lives on the ' +
        'FR it actually governs rather than only in FR-1\'s narrative.',
    },
    {
      issue:
        'SINGLE-REPRESENTATION VIOLATION (1-REP): RECOGNIZED_BRANCH_TYPES at gates.js:634 hardcodes [feat, fix, docs, test], ' +
        'duplicating BRANCH_TYPE_TOKENS at lib/git/branch-owner.js:64. Verified identical today. gates.js ALREADY imports from that ' +
        'module (line 13: branchBelongsToSd, loadKeySet, OWNER_REASON), so the constant could be imported rather than redeclared. If ' +
        'the token set is ever widened, the never-pushed remediation message silently advertises a stale set — and that message is the ' +
        'only mitigation for the chore/ false-diagnosis risk above.',
      severity: 'low',
      recommendation:
        'Import BRANCH_TYPE_TOKENS from lib/git/branch-owner.js and derive RECOGNIZED_BRANCH_TYPES from it, keeping the "chore is ' +
        'deliberately not recognized" comment.',
    },
  ],
  recommendations: [
    'Amend FR-2 (description + acceptance_criteria[0]) to the shipped three-element exemption list, citing SECURITY SEC-7.',
    'Amend FR-3 AC-5 to record the actual chore/ verdict change and drop the incorrect "Scan A short-circuits" mechanism.',
    'Label every count in the census script header with its --since window, and disclose the default-scope figure (731/3910) plus the --commit blast radius.',
    'Follow-up SD: stop an unrecognized-prefix branch with a live open PR from being reported as reason=never_pushed.',
    'Import BRANCH_TYPE_TOKENS instead of redeclaring RECOGNIZED_BRANCH_TYPES (gates.js:634).',
    'Consider surfacing the per-branch mergeEvidence records (branch/repo/prNumber) in details rather than only mergeEvidence.length, and include the field on the never_pushed failure details too (FR-1 AC-3 asks for accumulator visibility; only a count is exposed today).',
    'Carry forward SECURITY\'s still-open, out-of-scope residual: gates.js:864 (git rev-list --count origin/main..${branch}) and gates.js:875 remain execSync string interpolations fed from REMOTE branch names — rated strictly worse and remote-reachable, and unchanged by this SD.',
  ],
  metadata: {
    verification_method: 'independent measurement — git diff vs merge-base, source reads, live vitest run, live DB census re-run, direct sd_type population counts',
    merge_base: 'd9de13b0e2f025396a51c85722bcf9163172995f',
    test_run: {
      command: 'npx vitest run scripts/modules/handoff/executors/lead-final-approval/gates/pr-merge-verification.test.js tests/unit/harness/prmerge-exact-match.test.js scripts/modules/handoff/executors/lead-final-approval/gates/never-pushed-specimen.test.js',
      files_passed: 3,
      tests_passed: 34,
      tests_failed: 0,
      duration_ms: 576,
    },
    fr_verdicts: {
      'FR-1': 'PASS — four-gated (Scan A early-return :792, Scan B early-return :938, mergeEvidence guard :984, Scan C via isNeverPushedSpecimen); --search present :992; scan_c_saturated present :1020',
      'FR-2': 'CODE PASS / PRD AC-1 STALE — code is [documentation, docs, orchestrator]; AC still demands "process"',
      'FR-3': 'PASS on substance (34/34) / AC-5 FALSIFIED by the shipped chore/ test',
      'FR-4': 'WIRING PASS (gate genuinely calls the classifier at :1078) / HEADLINE COUNT UNDER-SCOPED ~180x',
      'FR-5': 'PASS — deferral comment at gates.js:913-921 cites this SD, FR-5 and the RESUME-FINAL-READ-001 FR-4 precedent',
      SECURITY_FIX: 'PASS — execFileSync argv array at gates.js:1108 closes SEC-1',
    },
    census_reproduction: {
      default_args: { since: '2026-01-01', scanned: 3910, specimens: 731, unverifiable: 0 },
      header_advertised: { claim: '4/920', reproduced_with: '--since 2026-07-01', scanned: 921, specimens: 4, unverifiable: 0 },
      conclusion: 'header figure is real but scoped to an undisclosed Jul-2026+ window, not the script default',
      commit_mode_run: false,
      commit_mode_blast_radius_at_default_scope: '731 feedback rows',
    },
    sd_type_population_measured: {
      process: 0,
      documentation: 147,
      docs: 11,
      orchestrator: 604,
      infrastructure: 3332,
      note: 'corroborates SEC-7 (process invalid) and FR-2 (isInfrastructureSDSync would exempt this SD\'s own type)',
    },
    branch_token_check: {
      canonical: 'lib/git/branch-owner.js:64 BRANCH_TYPE_TOKENS = [feat, fix, docs, test]',
      duplicate: 'gates.js:634 RECOGNIZED_BRANCH_TYPES = [feat, fix, docs, test]',
      identical_today: true,
      drift_risk: 'redeclared rather than imported, though gates.js already imports from that module at line 13',
    },
    classifier_call_sites_verified_by_grep: [
      'gates.js:1078 — live gate third state (the EXEC TESTING finding is closed)',
      'scripts/one-off/scan-completed-sds-for-never-pushed-merge-verification-never-001.mjs:219 — census',
      'scripts/modules/handoff/executors/lead-final-approval/gates/never-pushed-specimen.test.js — 8 unit tests',
    ],
    isinfrastructuresdsync_call_sites_in_gates_js: 0,
    residual_open_not_introduced_by_this_sd: [
      'gates.js:864 / :875 — pre-existing execSync interpolation of REMOTE branch names (SECURITY: strictly worse, remote-reachable, routed to follow-up)',
      'gates.js:992 — --search "${sdId}" interpolates sd_key; SECURITY measured 0 shell metacharacters across all 5799 keys, but sd_key has no CHECK constraint enforcing that',
      'gates.js:913-921 — branch-scan repo-error suppression, explicitly deferred per FR-5',
    ],
  },
  execution_time_ms: 1_500_000,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'VALIDATION',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('VALIDATION', SD_ID, { name: 'Principal Systems Analyst' }, results, { phase: PHASE });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_PHASE=' + (stored?.phase || 'n/a'));
console.log('STORED_SD_ID=' + (stored?.sd_id || 'n/a'));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('EXECUTED_FROM_CWD=' + results.metadata.executed_from_cwd);
console.log('CRITICAL_ISSUES=' + (results.critical_issues?.length ?? 'unset'));
console.log('WARNINGS=' + (results.warnings?.length ?? 'unset'));
console.log('RECOMMENDATIONS=' + (results.recommendations?.length ?? 'unset'));
