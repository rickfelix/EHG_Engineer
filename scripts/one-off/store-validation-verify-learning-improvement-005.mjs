// SD-LEARN-FIX-LEARNING-IMPROVEMENT-005 — VALIDATION sub-agent evidence writer (PLAN VERIFY phase).
// PRD-fidelity audit for the PLAN-TO-LEAD handoff: does the shipped code match what the PRD promises?
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEARN-FIX-LEARNING-IMPROVEMENT-005';
const PHASE = 'PLAN_VERIFICATION';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 82,
  summary:
    'PRD-fidelity audit at HEAD c35ad42ea9d. FR-1 and FR-3 are genuinely MET by the code (verified line-by-line, not by '
    + 'assertion). FR-2 is honestly DEFERRED and its premise was independently re-measured (gh pr view 7978 -> state=OPEN, '
    + 'mergedAt=null, 2026-09-02). Tests are substantive, not decorative: they use real temp files, real sha256, and '
    + 'adversarial wrong-on-disk fixtures that would fail if the reuse branch recomputed. Measured: 28 files / 272 tests '
    + 'passed (testing-subagent + sub-agent-executor) plus 1 file / 12 tests (dedup-phase-key, the 4th exact-shape '
    + 'consumer outside those dirs); eslint clean on all 4 changed files; zero migrations; zero change to '
    + 'testing-verdict-guard.js. CONDITIONAL, not PASS, on five findings: (1) FR-2 deferral_reason claims a "tracked '
    + 'follow-up" that is not tracked anywhere (0 SDs, 0 backlog rows, 0 feedback rows reference it); (2) the accepted '
    + 'EXEC-TO-PLAN handoff executive_summary says "All deliverables met" while 1 of 3 FRs is deferred and SD '
    + 'success_criteria[1] (gate wiring) is unmet and unamended; (3) EXEC authored NEW hashing logic at '
    + 'phase3-execution.js:222 in direct contradiction of FR-1\'s "do not author new hashing logic" -- justified by '
    + 'SECURITY SEC-1 (bdbe3d54) but the PRD text was never amended, so PRD and code now disagree; (4) nothing pins that '
    + 'new hash to artifact-verification.js hashArtifactContent, which FR-2 will compare against -- they agree by '
    + 'inspection only; (5) FR-3 AC-2 asks for a "real aggregateE2EResults-shaped" input and the test hand-builds one. '
    + 'Separately, and for LEAD not EXEC: near-term observable yield is ~0 on the live population (re-measured below). '
    + 'The SD title condition "zero readers" is NOT resolved by this PR and no completion narrative should claim it is.',
  findings: [
    {
      id: 'FR-1-MET',
      severity: 'info',
      note: 'FR-1 verified MET. lib/sub-agents/testing/index.js:414-448 buildMainlinePhase3TestExecution stays single-arg '
        + '(AC: no signature change). AC-1 hash-definition match verified by reading both sides: phase3-execution.js:222 '
        + 'computes createHash("sha256").update(JSON.stringify(report)) where report = JSON.parse(readFileSync(...)) '
        + '(:203), and artifact-verification.js:92-99 hashArtifactContent computes '
        + 'createHash("sha256").update(JSON.stringify(JSON.parse(raw))) -- identical method (re-serialized parse, not raw '
        + 'bytes). AC-2 reuse branch: index.js:436-439 returns phase3.artifact_sha as-is under source:"reused", never '
        + 'recomputed. AC-3 runner untouched: base object still hardcodes runner:"playwright" exactly as before; git diff '
        + 'confirms no runner edit. AC-4 zero-executed branch: index.js:425 `if (!reportUrl) return buildTestExecution(base)` '
        + '-- no fabricated path. AC-5: the exact-shape toEqual at mainline-test-execution.test.js:27-36 was updated to the '
        + '8-key shape; all 4 exact-shape consumers repo-wide were found and updated (mainline-test-execution, '
        + 'test-execution-record, type-shortcut-removed, and dedup-phase-key which needed no edit and still passes).',
    },
    {
      id: 'FR-3-MET',
      severity: 'info',
      note: 'FR-3 verified MET. index.js:426 uses `Array.isArray(reportUrl)` before any truthiness test, so the '
        + 'truthy-empty-array case (aggregateE2EResults report_url = per_repo.map(r=>r.report_url).filter(Boolean), '
        + 'phase3-execution.js:303, which can yield [] or a length-1 array) hits the same explicit branch rather than '
        + 'falling through. Chosen behavior = OMIT, documented in a code comment at index.js:424-425. Covered by TS-9 and '
        + 'TS-9b. Confirmed the aggregate never carries artifact_sha at top level (aggregateE2EResults does not propagate '
        + 'per-repo shas), so the array branch cannot be bypassed via a stray precomputed sha.',
    },
    {
      id: 'FR-2-DEFERRAL-HONEST-BUT-UNTRACKED',
      severity: 'medium',
      note: 'The DEFERRAL itself is honest and the premise holds under independent re-measurement: `gh pr view 7978` '
        + 'returns state=OPEN, mergedAt=null, headRefName=feat/SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-012 (measured '
        + '2026-09-02 by this review, not inherited from the EXEC claim). PRD FR-2 carries status:"DEFERRED" + '
        + 'deferral_reason, and PRD metadata.exec_phase_deferral records {fr:"FR-2", blocked_by_pr:7978, checked_at}. '
        + 'DEFECT: the deferral_reason says FR-2 is "deferred as a tracked follow-up" and NOTHING TRACKS IT. Measured: 0 '
        + 'strategic_directives_v2 rows reference LEARNING-IMPROVEMENT-005 in description; 0 sd_backlog_map rows for this '
        + 'SD; 0 feedback rows matching. "Tracked" is currently an unbacked claim -- exactly the class of overclaim this '
        + 'SD exists to fix. REQUIRED before LEAD approval: create the real follow-up row (SD or backlog item) keyed to '
        + 'PR #7978 merging, or amend the word "tracked" out of the deferral_reason.',
    },
    {
      id: 'HANDOFF-NARRATIVE-OVERCLAIMS',
      severity: 'medium',
      note: 'The ACCEPTED EXEC-TO-PLAN handoff (sd_phase_handoffs, 2026-09-02T06:07:26Z) has executive_summary '
        + '"Implementation complete. All deliverables met" and deliverables_manifest "All user stories implemented / E2E '
        + 'tests written and passing". Both are false as written: FR-2 of 3 is deferred, and no E2E test was written '
        + '(unit only, correctly so). This is handoff.js boilerplate rather than hand-authored prose, but it is the row '
        + 'LEAD reads. Additionally strategic_directives_v2.success_criteria[1] ("A verifier re-reads the artifact ... '
        + 'wired into mandatory-testing-validation.js as an additional defense-in-depth check") is UNMET and the SD row '
        + 'was never amended to reflect the deferral -- only the PRD FR was. LEAD must be told plainly that 1 of 5 SD '
        + 'success_criteria is not satisfied by this PR.',
    },
    {
      id: 'FR-1-TEXT-CONTRADICTS-SHIPPED-CODE',
      severity: 'medium',
      note: 'Unrecorded scope deviation. PRD FR-1 description states: compute the sha "via the EXISTING '
        + 'lib/sub-agents/testing/artifact-verification.js computeArtifactSha()/readArtifactWithSha() (do not author new '
        + 'hashing logic)". EXEC instead added a NEW inline hash at lib/sub-agents/testing/phases/phase3-execution.js:222 '
        + '(createHash("sha256").update(JSON.stringify(report))) and made index.js:445 prefer it '
        + '(`phase3.artifact_sha || computeArtifactSha(reportUrl)`). The SECURITY justification (evidence bdbe3d54, SEC-1: '
        + 'avoid a split-read TOCTOU by hashing the same parsed object the counts came from) is sound and I concur with '
        + 'it. The DEFECT is process, not code: FR-2 got a status/deferral_reason amendment but FR-1 was left contradicting '
        + 'the shipped implementation. Amend FR-1 (or add an exec_phase_amendment alongside exec_phase_deferral) so the '
        + 'PRD and the code agree.',
    },
    {
      id: 'TWO-HASH-IMPLS-UNPINNED',
      severity: 'medium',
      note: 'There are now TWO independent implementations of the same artifact hash and NO test asserts they agree: '
        + '(a) phase3-execution.js:222 (the live producer for a fresh run) and (b) artifact-verification.js:92-99 '
        + 'hashArtifactContent, reached via computeArtifactSha -- which is precisely the function FR-2 gate-side '
        + 'verification will compare against via isReportHashMismatch. They match by inspection today. If either drifts, '
        + 'FR-2 will emit a hash-mismatch warning on EVERY genuinely-fresh row -- a false-alarm generator inside the very '
        + 'mechanism meant to detect forgery. What the tests actually cover: TS-1 (mainline-test-execution.test.js:70-86) '
        + 'exercises only the computeArtifactSha FALLBACK, and the SEC-1 test (:88-105) uses the literal string '
        + '"precomputed-single-read-sha", proving reuse-not-recompute but proving nothing about hash equality. Measured: '
        + 'grep shows no test file anywhere references runFullE2ESuite\'s new artifact_sha field. RECOMMENDATION (small, '
        + 'FR-2-independent): one unit test writing a report file, calling the phase3 hashing expression and '
        + 'computeArtifactSha on it, and asserting equality.',
    },
    {
      id: 'FR-3-AC2-TEST-FIDELITY',
      severity: 'low',
      note: 'FR-3 acceptance_criteria[1] requires the multi-repo case be "covered by a unit test using a real '
        + 'aggregateE2EResults-shaped multi-repo input". TS-9 (mainline-test-execution.test.js:160-170) hand-builds '
        + '{report_url: ["/repo1/playwright-results.json", "/repo2/playwright-results.json"]} rather than feeding the '
        + 'output of an actual aggregateE2EResults([...]) call. I independently verified the hand-built shape IS correct '
        + '(phase3-execution.js:303), so this is fidelity-to-the-AC, not a correctness hole. Noting it rather than '
        + 'blocking on it.',
    },
    {
      id: 'NEAR-ZERO-OBSERVABLE-YIELD-LEAD-DECISION',
      severity: 'high',
      note: 'FOR LEAD, NOT AN EXEC DEFECT -- this was flagged and explicitly accepted at LEAD, but the acceptance '
        + 'rationale was never re-measured and is contradicted by a number in its own record. Re-measured live '
        + '2026-09-02: sub_agent_execution_results where sub_agent_code=TESTING -> 3057 rows total; 23 carry '
        + 'metadata.test_execution; runner="playwright" on 0 of 3057; runner="vitest" on 8; artifact_sha non-null on 1 '
        + '(value 98ef8a34... = 40 hex chars = sha1, hand-authored, not this code\'s sha256); artifact_path non-null on 0. '
        + 'READ SIDE: grep across lib/ and scripts/ finds ZERO consumers of metadata.test_execution.artifact_path / '
        + '.artifact_sha / .source (the only artifact_path hits are unrelated domains: approval-artifact-resolver.js, '
        + 'live-probe-enrichment.js, chairman-apply-retrospective-sweep.mjs). So the SD title condition -- "TESTING '
        + 'evidence provenance fields have zero readers" -- remains literally true after this PR. WHAT IS NOT DEAD: the '
        + 'reuse branch is genuinely reachable -- buildPhase3FromEvidence (index.js:856-876) sets report_url from '
        + 'freshEvidence.report_file_path (:863) and artifact_sha (:872), so an evidence-reuse run WILL now stamp '
        + 'artifact_path + source:"reused". The FRESH branch additionally requires --full-e2e AND a single resolved repo '
        + '(phase3-execution.js:56-58), a population with 0 historical rows. The from_cache co-equal fix is correctly '
        + 'documented as defensive: I confirmed getCachedTestResults (phase3-execution.js:411-421) returns from_cache:true '
        + 'and no report_url, so that branch cannot fire today -- the code comment is honest about this. LEAD SHOULD KNOW: '
        + 'the LEAD-TO-PLAN handoff known_issues already contained "0 of 3055 TESTING rows table-wide carry '
        + 'runner=playwright ... ZERO-YIELD / dead-by-construction risk" alongside the accepting rationale "Playwright-path '
        + 'provenance alone is still real, observable value for the population that actually executes it". Those two '
        + 'statements are in tension and the second was never measured. Accept the PR on its code merits, but do not let '
        + 'any completion narrative say the zero-readers defect is fixed.',
    },
    {
      id: 'SCOPE-CLEAN',
      severity: 'info',
      note: 'No scope creep and no silent drops beyond FR-2. Diff vs merge-base e9ddcaf23d3: 12 files, 632 insertions / '
        + '15 deletions -- 3 lib files (~74 net LOC of production change), 3 test files, 6 scripts/one-off DB scripts. SD '
        + 'success_criteria[2] verified MET by measurement: `git diff --name-only` shows zero migration/.sql files and '
        + 'zero change to lib/sub-agent-executor/testing-verdict-guard.js (whose REQUIRED_NUMERIC_FIELDS at :29 enumerates '
        + 'only the 4 counters and ignores the 2 added keys, as the PRD predicted). Unaddressed test scenarios TS-4/5/6/7/8 '
        + 'all belong to FR-2 and fall with it -- correct, not a silent drop. Commit history is coherent and matches the '
        + 'review narrative exactly: 6b00fecd5a2 (feat: stamping) -> 0249420fbfd (fix: from_cache co-equal, per TESTING '
        + 'evidence 24ae08ab) -> c35ad42ea9d (fix: TOCTOU, per SECURITY evidence bdbe3d54). Both cited evidence rows exist '
        + 'in sub_agent_execution_results at phase EXEC-TO-PLAN, CONDITIONAL_PASS @88.',
    },
    {
      id: 'BRANCH-BEHIND-MAIN',
      severity: 'low',
      note: 'Mechanical, not a defect: `git rev-list --left-right --count origin/main...HEAD` = 20 behind / 3 ahead. The '
        + 'branch needs a rebase or merge before the PR lands. A naive `git diff origin/main..HEAD` shows ~35 unrelated '
        + 'files and 1734 deletions and would badly misrepresent this PR\'s size to any reviewer or gate that reads it -- '
        + 'the correct comparison is against the merge-base (e9ddcaf23d3), which shows the true 12-file change.',
    },
  ],
  conditions: [
    {
      priority: 'high',
      blocking: false,
      action: 'Create the actual follow-up tracking row for FR-2 (SD or sd_backlog_map entry keyed to PR #7978 merging), '
        + 'or remove the word "tracked" from the FR-2 deferral_reason. As written the PRD claims tracking that does not exist.',
    },
    {
      priority: 'high',
      blocking: false,
      action: 'Do not let the LEAD-FINAL / retrospective narrative state that the "zero readers" defect is fixed. It is '
        + 'not: 0 consumers of metadata.test_execution.artifact_path/.artifact_sha/.source exist in lib/ or scripts/ at '
        + 'HEAD c35ad42ea9d. This PR ships the write side only. Amend SD success_criteria[1] to reflect the deferral.',
    },
    {
      priority: 'medium',
      blocking: false,
      action: 'Amend PRD FR-1 (or record an exec_phase_amendment) so it no longer says "do not author new hashing logic" '
        + 'while the shipped code authors exactly that at phase3-execution.js:222 under the SEC-1 justification.',
    },
    {
      priority: 'medium',
      blocking: false,
      action: 'Add a unit test pinning phase3-execution.js:222\'s hash to computeArtifactSha() of the same file. Without '
        + 'it, FR-2\'s future gate check can false-mismatch every fresh row if either implementation drifts.',
    },
  ],
  justification:
    'CONDITIONAL_PASS rather than PASS: the code genuinely delivers FR-1 and FR-3 and the tests genuinely test them '
    + '(verified by reading both, and by running them: 272 + 12 passing, eslint clean), and the FR-2 deferral premise '
    + 'was re-measured independently rather than inherited. What holds this back from a clean PASS is a cluster of '
    + 'accuracy defects in the SURROUNDING RECORD rather than in the code: an untracked "tracked follow-up", a handoff '
    + 'summary asserting "all deliverables met" when one FR is deferred, a PRD FR-1 that now contradicts the shipped '
    + 'implementation, and an unpinned second hash implementation. None are blocking; all are cheap to close. The '
    + 'near-zero observable yield finding is a LEAD decision that was already made with the relevant number in front of '
    + 'it, so it is reported rather than treated as an EXEC failure.',
  metadata: {
    gate: 'GATE_4_PLAN_VERIFICATION',
    audit_type: 'PRD_FIDELITY',
    head_sha: 'c35ad42ea9d',
    merge_base: 'e9ddcaf23d3032f7df5e426be02a1eb4c92e83c1',
    branch: 'feat/SD-LEARN-FIX-LEARNING-IMPROVEMENT-005',
    fr_status: { 'FR-1': 'MET', 'FR-2': 'DEFERRED_HONESTLY', 'FR-3': 'MET' },
    tests_run_by_this_review: {
      command: 'npx vitest run tests/unit/testing-subagent/ tests/unit/sub-agent-executor/',
      files_passed: 28,
      tests_passed: 272,
      failures: 0,
      duration_s: 4.02,
      vitest_version: '4.1.4',
      supplemental: {
        command: 'npx vitest run tests/unit/sub-agent-execution-results-dedup-phase-key.test.js',
        files_passed: 1,
        tests_passed: 12,
      },
      eslint: 'clean on all 4 changed files',
    },
    live_population_measured_2026_09_02: {
      testing_rows_total: 3057,
      with_test_execution: 23,
      runner_playwright: 0,
      runner_vitest: 8,
      artifact_sha_non_null: 1,
      artifact_path_non_null: 0,
      readers_of_new_fields: 0,
    },
    pr_7978_remeasured: { state: 'OPEN', merged_at: null, measured_at: '2026-09-02' },
    corroborating_evidence: ['24ae08ab (TESTING EXEC-TO-PLAN)', 'bdbe3d54 (SECURITY EXEC-TO-PLAN)'],
  },
  execution_time_ms: 600000,
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
console.log('STORED_PHASE=' + (stored?.phase || PHASE));
