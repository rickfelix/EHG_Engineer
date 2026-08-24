// SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 — TESTING sub-agent evidence writer (EXEC phase).
// Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001';
const PHASE = 'EXEC';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 92,
  summary:
    'EXEC-phase post-implementation review of the never-pushed third state in createPRMergeVerificationGate ' +
    '(scripts/modules/handoff/executors/lead-final-approval/gates.js). Targeted suite is GREEN: 29/29 passed across 3 files ' +
    '(pr-merge-verification.test.js, prmerge-exact-match.test.js, never-pushed-specimen.test.js), 575ms, zero skips. Two of the three ' +
    'correctness properties the review was asked to confirm are VERIFIED BY MEASUREMENT; the third is FALSIFIED BY MEASUREMENT. ' +
    'VERIFIED (b) the exemption is genuinely narrow: exact population counts (count:exact, not a capped fetch) over ' +
    'strategic_directives_v2 status=completed give 4596 total, 572 exempt by NO_CODE_SD_TYPES (12.4%), 4024 subject (87.6%) -- versus ' +
    'the rejected isInfrastructureSDSync/NON_CODE predicate at 73.8% exempt. A 6x narrowing, objective met; zero completed SDs have a ' +
    'NULL sd_type, so the has(undefined)===false fall-through has no blast radius. VERIFIED (b2) grep of gates.js returns ZERO ' +
    'references to isInfrastructureSDSync or SD_TYPE_CATEGORIES (the only matches are inside the explanatory comment); the pre-existing ' +
    'getTierForSD import at line 15 is untouched. VERIFIED (c) the third state cannot override an earlier fail path: it sits at line 973, ' +
    'after the unreadableRepos refusal (771), the openPRs return (789) and the unmergedBranches return (923), all of which return early -- ' +
    'it is reachable only when every prior scan has both completed and found nothing. FALSIFIED (a): a merged-and-cleaned-up SD CAN ' +
    'false-positive as never-pushed. Scan C is `gh pr list --repo <R> --state merged --limit 100` with NO search filter, so it sees only ' +
    'the 100 most recent merged PRs repo-wide -- MEASURED at 50.6 hours (2.11 days) of wall-clock on rickfelix/EHG_Engineer ' +
    '(PR#7389 2026-08-22T13:48Z .. PR#7495 2026-08-24T16:21Z). Demonstrated on a real completed SD, not a fixture: ' +
    'SD-LEO-INFRA-RESUME-FINAL-READ-001 shipped via merged PR #6790 on 2026-08-04, and is INVISIBLE to Scan C (0 matches) while a bounded ' +
    '--head query finds it immediately. With its branch deleted post-merge (the normal /ship --delete-branch end state), re-running ' +
    'LEAD-FINAL-APPROVAL on it today yields A=0, B=0, mergeEvidence=empty, C=0 -> FAIL reason never_pushed on an SD that shipped ' +
    'correctly. The gate is therefore time-dependent rather than correct: it holds for the dominant path (/ship then approve within ' +
    'minutes) and breaks past roughly 48h -- orchestrator parents waiting on children, gate retries, weekends, resumed SDs. No fixture ' +
    'can catch this because every mock returns the merged PR unconditionally and has no notion of a 100-item cap (fixture proves logic, ' +
    'not observability). Fix is one flag and is VERIFIED BY EXECUTION, not proposed: adding --search "<sdId>" to the Scan C command ' +
    'returns PR #6790 as the first result while the existing branchBelongsToSd filter is retained -- which is precisely what this ' +
    'sub-agent recommended at PLAN phase ("--search \\"<sdKey>\\""); EXEC substituted --limit 100 with no search filter and introduced ' +
    'the window. Direction, structure, comments and test discipline of this change are otherwise good and the targeted false-PASS is ' +
    'genuinely closed -- CONDITIONAL on the Scan C window fix.',
  findings: [
    {
      id: 'scanC-limit-100-window-false-fails-shipped-SDs',
      severity: 'critical',
      note:
        'MEASURED, with a real-SD demonstration rather than a fixture. Scan C (gates.js:977-980) runs ' +
        '`gh pr list --repo <R> --state merged --json number,headRefName,url,mergedAt --limit 100` and filters the result through ' +
        'branchBelongsToSd. The --limit applies BEFORE the filter and there is no --search/--head narrowing, so Scan C can only ever see ' +
        'the 100 most recently merged PRs in the whole repo. MEASURED WINDOW on rickfelix/EHG_Engineer at review time: those 100 PRs span ' +
        'PR#7389 (2026-08-22T13:48:13Z) to PR#7495 (2026-08-24T16:21:41Z) = 50.6 hours = 2.11 days. DEMONSTRATION on a real completed SD: ' +
        'SD-LEO-INFRA-RESUME-FINAL-READ-001 shipped via merged PR #6790 (2026-08-04T01:51:04Z). Counting its key in the Scan C payload ' +
        'returns 0; `gh pr list --state merged --head feat/SD-LEO-INFRA-RESUME-FINAL-READ-001` returns PR #6790. Contrast control: ' +
        'SD-LEO-FIX-BOUNDARY-LINT-NAMESPACE-001 (merged 2026-08-22, inside the window) returns 1 -- so visibility is purely a function of ' +
        'elapsed time since merge, not of whether the SD shipped. CONSEQUENCE: for any of the 4024 non-exempt completed SDs, running ' +
        'LEAD-FINAL-APPROVAL more than ~48h after the merge, with the branch deleted as /ship --delete-branch normally leaves it, gives ' +
        'A=0 / B=0 / mergeEvidence=[] / C=0 and returns passed:false with details.reason=\'never_pushed\'. This directly falsifies the ' +
        'property the EXEC brief asked to be confirmed ("a merged-and-cleaned-up SD cannot false-positive as never-pushed"). It is ' +
        'fail-CLOSED (blocks completion, with a bypass named in the message) rather than a false pass, which is why this is CONDITIONAL_PASS ' +
        'and not FAIL -- but it converts a correct-by-construction gate into one that is correct only inside a 2-day window. NOT reachable ' +
        'by any current test: every fixture stubs the merged-PR command to return the SD\'s PR unconditionally, so no mock can express a ' +
        '100-item cap. REQUIRED FIX (verified by execution, not proposed): add --search "<sdId>" to the Scan C invocation, keeping the ' +
        'branchBelongsToSd filter -- `gh pr list --repo <R> --state merged --search "<sdId>" --json number,headRefName,url,mergedAt ' +
        '--limit 100`. RUN against the aged-out SD above, this returns PR #6790 as the first element. This is verbatim the design this ' +
        'sub-agent specified at PLAN phase (finding TS5-merged-vs-neverpushed-indistinguishable: \'a repo-level gh pr list --repo <R> ' +
        '--state merged --search "<sdKey>"\'); the implementation kept the shape but dropped --search. Rejected alternative: per-pattern ' +
        '--head "<type>/<KEY>" (also verified working, and it is the idiom already used at gates.js:872) -- but it re-anchors on the 4 ' +
        'literal patterns and so cannot see a suffixed branch, which is the exact blindness RESUME-FINAL-READ-001 FR-3 existed to remove. ' +
        'Use --search. ALSO ADD a regression test: a fixture where the merged-PR command returns 100 unrelated PRs and the SD\'s own PR is ' +
        'absent, asserting the gate does NOT report never_pushed once --search is in place.',
    },
    {
      id: 'shared-classifier-is-not-actually-shared-with-the-live-gate',
      severity: 'high',
      note:
        'MEASURED by repo-wide grep. isNeverPushedSpecimen is defined at gates.js:644 and its ONLY callers are ' +
        'never-pushed-specimen.test.js and scripts/one-off/scan-completed-sds-for-never-pushed-merge-verification-never-001.mjs:219. The ' +
        'live gate NEVER calls it -- it inlines an independent condition at gates.js:973 ' +
        '(`mergeEvidence.length === 0 && !NO_CODE_SD_TYPES.has(ctx.sd.sd_type)`). The function\'s own docstring states it is "shared by the ' +
        'live gate\'s third state (below) and the retro census one-off script, so the two definitions of \'never-pushed specimen\' can ' +
        'never drift apart". That claim is false as written: the only thing genuinely shared is the NO_CODE_SD_TYPES Set, so the exemption ' +
        'cannot drift but the evidence-combination logic exists in two independent implementations. THE DRIFT IS ALREADY PRESENT, not ' +
        'hypothetical: isNeverPushedSpecimen treats a ship_review_findings row carrying a pr_number as disqualifying evidence ' +
        '(gates.js:654-656), and the live gate has no ship_review_findings check at all. An SD with a ship_review_findings row and no other ' +
        'evidence is therefore NOT a specimen per the census but WOULD fail the live gate -- the two disagree on exactly the population the ' +
        'census (FR-4) exists to enumerate, which is how a census under-reports the very defect it is measuring. TEST GAP: ' +
        'never-pushed-specimen.test.js exercises only the classifier and pr-merge-verification.test.js only the gate; nothing asserts the ' +
        'two agree, so this divergence is invisible to the suite. FIX: either have the gate call isNeverPushedSpecimen with the evidence it ' +
        'has already gathered (openPRs/unmergedBranches/mergeEvidence counts) so there is one implementation, or -- if the gate ' +
        'deliberately does not consult ship_review_findings -- correct the docstring to say what is actually shared and add a test pinning ' +
        'the intended divergence.',
    },
    {
      id: 'scanC-swallowed-error-mislabels-a-transient-gh-failure-as-never_pushed',
      severity: 'medium',
      note:
        'Scan C\'s per-repo catch (gates.js:984-989) swallows the error and continues, with a comment reasoning that Scan A already covers ' +
        'the fail-closed case. That reasoning is sound for a persistent gh outage -- Scan A pushes into unreadableRepos and returns ' +
        'reason=\'repo_scan_unreadable\' long before Scan C is reached -- but it does not hold for a failure that begins BETWEEN Scan A and ' +
        'Scan C (rate limit crossed mid-validator, transient network, token expiry at a 30s timeout boundary). In that window Scan C yields ' +
        'zero merged PRs for a reason that has nothing to do with the SD, and the gate returns details.reason=\'never_pushed\'. The verdict ' +
        'direction is still fail-closed and therefore safe, but the REASON CODE is wrong, and that code is load-bearing: FR-4\'s census and ' +
        'any downstream pattern analysis key off never_pushed, so a transient gh failure is recorded as a never-pushed specimen. Cheap fix: ' +
        'track Scan C read failures the way Scan A tracks unreadableRepos and, when any occurred, return a distinct reason ' +
        '(e.g. merged_scan_unreadable) instead of never_pushed.',
    },
    {
      id: 'chore-branch-verdict-change-is-honest-and-correctly-scoped',
      severity: 'info',
      note:
        'Positive finding, recorded because the PLAN-phase review flagged this as a false-diagnosis risk and the implementation addressed ' +
        'it properly. prmerge-exact-match.test.js\'s chore/ fixture legitimately changes verdict (PASS -> FAIL) and the test body says so in ' +
        'its title and explains why. The mitigation asked for at PLAN phase was applied: the issue text asserts only what was actually ' +
        'measured ("no open PR, no unmerged remote branch, and no merged PR evidence") and enumerates RECOGNIZED_BRANCH_TYPES rather than ' +
        'claiming nothing exists, and the test pins the honesty property directly by asserting the message does NOT mention PR #6664. The ' +
        'pre-existing chore-not-a-recognized-token gap is left untouched and still deliberately pinned, which is the correct scope call. ' +
        'RESIDUAL, minor: in this scenario details.openPRs is reported as 0 while an open PR does exist on an unrecognized branch. That is ' +
        'defensible as "0 open PRs resolved to this SD", but the census consumes details, so it is worth a comment.',
    },
    {
      id: 'exemption-narrowness-and-ordering-verified',
      severity: 'info',
      note:
        'Positive findings for the two properties the EXEC brief asked to be confirmed, recorded with the measurements behind them so a ' +
        'future reader is not re-deriving them. (b) NARROWNESS: exact counts via count:exact/head:true (deliberately NOT a capped ' +
        '.select() -- a capped fetch measures the cap) over strategic_directives_v2 where status=completed: 4596 total, 572 exempt by ' +
        'NO_CODE_SD_TYPES = 12.4%, 4024 subject = 87.6%. The rejected isInfrastructureSDSync/NON_CODE predicate exempts 73.8%, so the ' +
        'narrow list is a ~6x reduction in exemption surface and the FR-2 objective is met. Type breakdown of the exempt set: orchestrator ' +
        '119, documentation 98, docs 10 within the first 1000 rows sampled; infrastructure (478 in that sample) is correctly NON-exempt, ' +
        'including this SD\'s own type. Zero completed SDs carry a NULL/empty sd_type, so NO_CODE_SD_TYPES.has(undefined)===false falling ' +
        'through to the non-exempt branch has no current blast radius (and fails closed anyway). (b2) grep of gates.js for ' +
        'isInfrastructureSDSync and SD_TYPE_CATEGORIES: zero code references, matches confined to the explanatory comment at 619-623. ' +
        '(c) ORDERING: the third state at line 973 is dominated by three earlier early-returns -- unreadableRepos refusal (771), openPRs ' +
        '(789), unmergedBranches (923) -- so it can neither override nor mask an earlier failure, and it is skipped entirely when ' +
        'mergeEvidence is non-empty (squash-merge artifact observed in Scan B) or when the type is exempt. Structure is correct.',
    },
    {
      id: 'test-suite-green-and-coverage-gaps',
      severity: 'info',
      note:
        'RUN, not read: `npx vitest run` over the three targeted files returned Test Files 3 passed (3), Tests 29 passed (29), 575ms, zero ' +
        'skipped, at 13:20:21. Breakdown: pr-merge-verification.test.js (6 pre-existing + TS-1/TS-2/TS-5 new), prmerge-exact-match.test.js ' +
        '(13, one verdict deliberately changed), never-pushed-specimen.test.js (7 new pure unit tests). The two PLAN-phase blocking ' +
        'conditions on test quality were satisfied: TS-1 asserts details.reason===\'never_pushed\' plus the message phrase plus the SD key ' +
        '(so the whole-module sd-type-checker mock cannot produce a false green via the outer catch), and makeCtx was parameterized with a ' +
        'defaulted sdType so TS-2 is writable without touching existing call sites. GENUINE GAPS, in priority order: (1) no test can reach ' +
        'the Scan C --limit window defect above, because every fixture returns the SD\'s merged PR unconditionally -- a fixture returning ' +
        '100 unrelated merged PRs is the missing control; (2) nothing asserts the live gate and isNeverPushedSpecimen agree, which is what ' +
        'lets the already-present ship_review_findings divergence stay invisible; (3) the diagnostic local-branch enumeration ' +
        '(git for-each-ref + git ls-remote, gates.js:997-1020) is exercised only in its empty form -- no fixture returns a local branch that ' +
        'IS absent from the remote, so the localCandidate-populated message branch and its ls-remote error path are both unasserted. (3) is ' +
        'low-severity since that path is explicitly diagnostic-only and never affects the verdict, but it is currently dead code from the ' +
        'suite\'s perspective. Pre-existing unrelated flake in tests/unit/invocation-detector/invocation-path-gate.test.js was excluded from ' +
        'scope as instructed and was not observed in this run.',
    },
  ],
  metadata: {
    review_type: 'post_implementation_verification',
    prd_id: 'PRD-SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001',
    gate_file: 'scripts/modules/handoff/executors/lead-final-approval/gates.js',
    gate_function: 'createPRMergeVerificationGate',
    third_state_line: 973,
    scan_c_line: '977-980',
    tests_run: '29/29 passed (3 files, 575ms, 0 skipped)',
    test_files_run: [
      'scripts/modules/handoff/executors/lead-final-approval/gates/pr-merge-verification.test.js',
      'tests/unit/harness/prmerge-exact-match.test.js',
      'scripts/modules/handoff/executors/lead-final-approval/gates/never-pushed-specimen.test.js',
    ],
    properties_verified: {
      'exemption_is_narrow': 'VERIFIED — 572/4596 = 12.4% exempt vs 73.8% for the rejected NON_CODE predicate (exact counts, not capped fetch)',
      'no_stray_sd_type_checker_refs': 'VERIFIED — zero code references to isInfrastructureSDSync/SD_TYPE_CATEGORIES in gates.js',
      'third_state_does_not_override_earlier_fails': 'VERIFIED — line 973 is dominated by early returns at 771, 789, 923',
      'merged_and_cleaned_up_cannot_false_positive': 'FALSIFIED — Scan C --limit 100 is a 50.6h window; demonstrated on real SD-LEO-INFRA-RESUME-FINAL-READ-001 (merged PR #6790, invisible to Scan C)',
    },
    measurement_method:
      'Every quantitative claim was executed, not read. Scan C window measured by running the gate\'s exact gh command and computing the ' +
      'mergedAt span of the returned 100 rows. False-positive demonstrated by contrasting that payload against a bounded --head query for ' +
      'the same SD key. Population figures taken with Supabase count:exact/head:true rather than a .select() that silently caps at 1000. ' +
      'Both candidate fixes (--search and --head) were RUN against the aged-out SD before being recommended.',
    scan_c_window_measured_hours: 50.6,
    scan_c_window_prs: 'PR#7389 2026-08-22T13:48:13Z .. PR#7495 2026-08-24T16:21:41Z',
    false_positive_specimen: 'SD-LEO-INFRA-RESUME-FINAL-READ-001 (merged PR #6790, 2026-08-04T01:51:04Z) — 0 matches in Scan C, found by --head and by --search',
    completed_sds_total: 4596,
    completed_sds_exempt: 572,
    completed_sds_subject: 4024,
    conditions_to_clear: [
      'BLOCKING: add --search "<sdId>" to the Scan C gh invocation (gates.js:977-980), retaining the branchBelongsToSd filter — verified to find a PR 20 days outside the current window',
      'Add a regression fixture where the merged-PR command returns 100 unrelated PRs and the SD\'s own PR is absent, asserting no never_pushed verdict',
      'Resolve the isNeverPushedSpecimen sharing claim: either call it from the gate, or correct the docstring and pin the ship_review_findings divergence with a test',
      'RECOMMENDED: give Scan C read failures a distinct reason code (merged_scan_unreadable) so a transient gh failure is not censused as never_pushed',
    ],
  },
  execution_time_ms: 1500000,
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
