// SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 — REGRESSION sub-agent evidence writer (PLAN_VERIFICATION).
// Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
// Run with --partial first (crash insurance), then without for the final verdict.
import { createClient } from '@supabase/supabase-js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001';
const PARTIAL = process.argv.includes('--partial');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: existing, error: exErr } = await supabase
  .from('sub_agent_execution_results')
  .select('id, sub_agent_code, phase, verdict, created_at')
  .eq('sd_id', SD_ID)
  .order('created_at', { ascending: false })
  .limit(25);
if (exErr) console.log('EXISTING_LOOKUP_ERROR=' + exErr.message);
console.log('EXISTING_ROWS=' + JSON.stringify((existing || []).map(r => `${r.sub_agent_code}/${r.phase}/${r.verdict}`)));

const PHASE = 'PLAN_VERIFICATION';

const partialResults = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 40,
  summary:
    'PARTIAL / PROVISIONAL ROW (crash insurance per SD-FDBK-ENH-REGRESSION-SUB-AGENT-001). REGRESSION validation of ' +
    'createPRMergeVerificationGate in scripts/modules/handoff/executors/lead-final-approval/gates.js is IN PROGRESS. If this row is still ' +
    'CONDITIONAL_PASS at confidence 40 with this summary, the sub-agent crashed mid-run and this verdict is NOT a real result.',
  findings: [{ id: 'partial-row-in-progress', severity: 'info', note: 'Provisional row; superseded by the final update.' }],
  metadata: { partial: true, phase: PHASE },
  execution_time_ms: 0,
};

const finalResults = {
  verdict: 'PASS',
  confidence: 93,
  summary:
    'PLAN_VERIFICATION-phase REGRESSION validation of SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 against ' +
    'scripts/modules/handoff/executors/lead-final-approval/gates.js. VERDICT: PASS — no regression found in the pre-existing code paths. ' +
    'The change is structurally additive by measurement, not by assertion: `git diff -U0` yields 7 hunks, of which FIVE are pure insertions ' +
    '(@@ -617,0 +618,44 @@ / @@ -781,0 +826,6 @@ / @@ -830,0 +881,1 @@ / @@ -864,0 +916,6 @@ / @@ -907,0 +965,190 @@ — the `,0` on the ' +
    'old-side range is the machine-checkable proof that ZERO pre-existing lines were removed in each) and only TWO are single-line ' +
    'modifications, both additive within the line: (1) old:683 `const { execSync } = await import(\'child_process\')` -> ' +
    '`const { execSync, execFileSync } = ...` (destructuring one more binding off the same module; execSync itself unchanged, and ' +
    'execFileSync is used only inside the new diagnostic block), and (2) old:914 the terminal success `details` object gains one field ' +
    '`mergeEvidence: mergeEvidence.length` alongside the unchanged checkedPatterns/openPRs/unmergedBranches. Whole-file totals corroborate: ' +
    '249 insertions, 2 deletions, and the 2 deletions are exactly those two rewritten lines. ' +
    'ITEM-BY-ITEM: (1) Scan A + unreadableRepos fail-closed path — UNCHANGED. Reviewed the region old:684-781 (current 728-825) and there is ' +
    'no diff hunk in it at all; the `gh pr list --state open` invocation, the branchBelongsToSd ownership filter, the unreadableRepos push ' +
    'and its refusal return, and the openPRs early return are byte-identical. NOTE for precision: the brief predicted ZERO changed lines ' +
    'above the "No open PRs found" log line; there is exactly ONE (the execFileSync destructure at current:727, which sits above it). It is ' +
    'non-behavioral — it binds an additional export from the same already-awaited dynamic import and does not touch execSync\'s binding, ' +
    'call sites, or any control flow. Everything else above that log line is untouched. ' +
    '(2) Scan B (unmerged branches) — only the two predicted changes, confirmed by the hunk ranges. The hoisted `const mergeEvidence = []` ' +
    '(current:826-831, 6 lines of which 5 are comment) is declared alongside the pre-existing `const unmergedBranches = []` and is a new ' +
    'binding that shadows nothing. The single pushed line (current:881) sits INSIDE the pre-existing squash-merge whitelist branch, after ' +
    'the pre-existing `prMerged = true` and before the pre-existing console.log — it neither guards nor short-circuits anything, so the ' +
    'squash-merge whitelist still skips the branch exactly as before. The commit-count check, the unverified-branch handling, the ' +
    '`catch (_repoError)` suppression and the unmergedBranches early return are all outside every hunk except a 6-line COMMENT-ONLY ' +
    'insertion in the _repoError catch (current:916-921, documenting the deferred FR-5 fail-open) that adds no statement. ' +
    '(3) Final `catch (error)` fail-closed block — UNTOUCHED. The last hunk ends at old:914 (the details line); the `} catch (error) {` and ' +
    'its body appear only as diff context. ' +
    '(4) createPRPrecheckGate — UNTOUCHED. The first hunk is `@@ -617,0 +618,44 @@`, i.e. an insertion positioned AFTER that function\'s ' +
    'closing brace; no line inside it is in any hunk. ' +
    '(5) Caller compatibility — VERIFIED by repo-scoped grep over scripts/, lib/, tests/. computeReposForSD is unchanged (still ' +
    '`computeReposForSD(sd)` at gates.js:117) and both call sites still pass one argument: gates.js:731 and ' +
    'scripts/one-off/scan-completed-sds-for-never-pushed-merge-verification-never-001.mjs:110. createPRMergeVerificationGate keeps its ' +
    '`(supabase, deps = {})` signature and both call sites are compatible: the production registration at gates.js:1785 ' +
    '`createPRMergeVerificationGate(supabase)` (deps defaulted) and the test factory `createPRMergeVerificationGate(null, { loadKeySet })`. ' +
    'No new REQUIRED parameter was added anywhere — the new supabase usage (ship_review_findings) is explicitly guarded by `if (supabase)`, ' +
    'so the null-supabase test call path is preserved. isNeverPushedSpecimen is a NEW export, so it can break no existing caller by ' +
    'construction; it is now genuinely called by the live gate at gates.js:1078, which RESOLVES the prior EXEC-phase TESTING finding ' +
    '"shared-classifier-is-not-actually-shared-with-the-live-gate" (recorded in scripts/one-off/patch-testing-evidence-exec-columns.mjs). ' +
    'It is also still exported to the FR-4 census script, so the two consumers now share one implementation. ' +
    '(6) Broader test battery — RUN, not read. See the test findings below for exact counts. ' +
    'RESIDUAL (warning, not a regression): the new Scan C block executes on the previously-terminal success path for every non-exempt SD ' +
    'whose mergeEvidence is empty, which is the NORMAL shipped-and-branch-deleted case. That is the SD\'s deliberate intent, but it does ' +
    'mean a path that formerly returned passed:true using only already-gathered local state now performs additional network `gh` calls and ' +
    'can now fail closed on gh outage (reason scan_c_unreadable) or on a saturated search window (reason scan_c_saturated). Behavior for ' +
    'the five ORIGINAL scenarios named in the brief is unchanged; this is a new failure mode on a previously-passing path, correctly ' +
    'fail-closed and documented in-code, and it is the point of the SD rather than a regression.',
  findings: [
    {
      id: 'diff-is-structurally-additive-by-hunk-measurement',
      severity: 'info',
      note:
        'MEASURED, not asserted. `git diff -U0` on the file gives exactly 7 hunk headers: @@ -617,0 +618,44 @@ (new NO_CODE_SD_TYPES / ' +
        'RECOGNIZED_BRANCH_TYPES / isNeverPushedSpecimen), @@ -683 +727 @@ (execFileSync destructure), @@ -781,0 +826,6 @@ (hoisted ' +
        'mergeEvidence), @@ -830,0 +881 @@ (one push inside the squash-merge whitelist), @@ -864,0 +916,6 @@ (comment-only, _repoError ' +
        'catch), @@ -907,0 +965,190 @@ (Scan C third state), @@ -914 +1161 @@ (details gains mergeEvidence count). Five of seven carry a ' +
        'ZERO-length old-side range (`-N,0`), which is the diff format\'s own guarantee that no pre-existing line was deleted or rewritten ' +
        'there. Only two hunks touch an existing line, and both are strictly additive within that line. Whole-file `--stat`: 249 ' +
        'insertions(+), 2 deletions(-) — the 2 deletions reconcile exactly to those two rewritten lines, leaving no unaccounted removal.',
    },
    {
      id: 'scan-a-and-unreadable-repos-unchanged-with-one-precision-correction',
      severity: 'info',
      note:
        'Scan A (open-PR scan) and its unreadableRepos fail-closed refusal are UNCHANGED: the old-file range 684-781 contains no hunk, so ' +
        'the `gh pr list --repo <R> --state open --json number,title,headRefName,url --limit 100` invocation, the ' +
        'branchBelongsToSd ownership filter, the unreadableRepos accumulation, the repo_scan_unreadable refusal return and the openPRs ' +
        'blocking return are byte-identical to pre-SD. PRECISION CORRECTION to the brief\'s stated expectation ("the diff should show ZERO ' +
        'changes above the \'No open PRs found\' log line"): there is exactly one changed line above it — current:727, ' +
        '`const { execSync, execFileSync } = await import(\'child_process\')`, formerly `const { execSync } = ...`. This is a destructuring ' +
        'addition on an already-existing dynamic import of the same builtin. execSync\'s binding and every execSync call site are ' +
        'untouched; execFileSync is referenced only inside the new diagnostic local-branch probe (current ~1105). No control flow above the ' +
        '"No open PRs found" line changed. Recording it explicitly so the "zero changes" claim is not carried forward as if measured when ' +
        'the measurement actually shows one benign line.',
    },
    {
      id: 'scan-b-loop-logic-unchanged-only-additive-evidence-capture',
      severity: 'info',
      note:
        'Scan B is limited to the two predicted changes plus one comment-only insertion. (a) `const mergeEvidence = []` at current:826-831 ' +
        '(5 explanatory comment lines + 1 declaration) is inserted immediately after the pre-existing `const unmergedBranches = []` and ' +
        'before the `for (const { githubRepo, localPath } of reposWithPaths)` loop — a fresh binding that shadows nothing and is read only ' +
        'after the loop. (b) The single statement `mergeEvidence.push({ branch: cleanBranch, repo, prNumber: mergedPrs[0].number })` at ' +
        'current:881 sits inside the pre-existing `if (mergedPrs.length > 0)` squash-merge whitelist branch, positioned after the ' +
        'pre-existing `prMerged = true;` and before the pre-existing console.log — it is a pure side-effect on a new array, adds no branch, ' +
        'and cannot alter whether the whitelist skips the branch. Everything else in the loop is outside all hunks: the ' +
        '`git rev-list --count` commit-count check, the unverified-branch handling, the per-branch try/catch, and the ' +
        'unmergedBranches.length > 0 blocking return. The only other Scan B diff is a 6-line COMMENT block inside `catch (_repoError)` ' +
        '(current:916-921) documenting the deferred FR-5 fail-open; it introduces no statement and the ' +
        '`console.debug(\'[LeadFinalApproval] repo branch check suppressed:\', ...)` line is unchanged.',
    },
    {
      id: 'outer-catch-and-sibling-gate-untouched',
      severity: 'info',
      note:
        'Two negative results, both measured from hunk positions rather than by reading and trusting. (1) The function-terminal ' +
        '`catch (error)` fail-closed block: the final hunk is @@ -914 +1161 @@, which rewrites the success-path `details` line ONLY; the ' +
        '`} catch (error) {` that follows and its entire body render as unchanged diff context, so the outer fail-closed handler still ' +
        'catches any throw from the new Scan C code exactly as it did before. This matters because the new block dereferences ' +
        '`ctx.sd.sd_type` — but `ctx.sd` is already unconditionally dereferenced far earlier at `const sdId = ctx.sd.sd_key || ctx.sd.id`, ' +
        'so the new code introduces no null-deref surface that did not already exist, and any surprise still fails closed. ' +
        '(2) createPRPrecheckGate: the first hunk is an insertion at @@ -617,0 +618,44 @@, i.e. positioned after that function\'s closing ' +
        'brace. No line of createPRPrecheckGate appears on either side of any hunk. UNTOUCHED.',
    },
    {
      id: 'caller-compatibility-verified-repo-wide',
      severity: 'info',
      note:
        'MEASURED by repo-scoped grep across scripts/, lib/ and tests/ for computeReposForSD, createPRMergeVerificationGate and ' +
        'isNeverPushedSpecimen. computeReposForSD: definition unchanged at gates.js:117 with the same single `sd` parameter; call sites are ' +
        'gates.js:731 `computeReposForSD(ctx.sd)` and ' +
        'scripts/one-off/scan-completed-sds-for-never-pushed-merge-verification-never-001.mjs:110 `computeReposForSD(sd)` — both one ' +
        'argument, both compatible. createPRMergeVerificationGate: signature still `(supabase, deps = {})`; call sites are the production ' +
        'gate registration gates.js:1785 `createPRMergeVerificationGate(supabase)` and the test factory ' +
        'pr-merge-verification.test.js:62 `createPRMergeVerificationGate(null, { loadKeySet })` plus :346 with a fake supabase. NO new ' +
        'required parameter was introduced; critically, the new ship_review_findings lookup is wrapped in `if (supabase)` and its own ' +
        'try/catch, so the long-standing null-supabase call path still works and degrades to an empty findings array rather than throwing. ' +
        'isNeverPushedSpecimen is a NEW export (gates.js:647) and therefore cannot break an existing caller; it is consumed by the live ' +
        'gate (gates.js:1078), its unit test, and the FR-4 census script — which also CLOSES the prior EXEC-phase TESTING finding that the ' +
        '"shared" classifier was not actually called by the gate. Both re-export surfaces at gates.js:1870 remain intact.',
    },
    {
      id: 'broader-test-battery-green-14-files-149-passed',
      severity: 'info',
      note:
        'RUN, not read. `npx vitest run` over all 14 files named in the review brief (the 3 SD-specific files plus 11 adjacent ' +
        'gate/completion suites) returned: Test Files 14 passed (14), Tests 149 passed | 2 skipped (151), duration 1.32s, ZERO failures. ' +
        'The 2 skips were traced rather than waved past: both come from tests/unit/handoff/gates/phantom-test-audit-gate.test.js:126, ' +
        '`const itOrSkip = hasKey ? it : it.skip` — a pre-existing environment/credential-gated conditional skip whose gating has nothing ' +
        'to do with this change. No test was skipped as a consequence of this SD, and no previously-passing test failed. Combined with the ' +
        'hunk analysis, the adjacent suites (cross-repo PR merge verification, squash-detection, gate-pipeline placement, leo-create-sd ' +
        'target repos, sd-completion-readiness contract, venture-aware completion gates, chairman-apply verification, FR-delivery ' +
        'fail-open, EVA gate inventory) exercise the neighbouring gate registration and completion surfaces and are all unaffected. ' +
        'tests/unit/invocation-detector/invocation-path-gate.test.js was excluded as instructed — a known, already-signaled, ' +
        'content-independent Windows/vitest flake proven by byte-identical-file-different-result testing earlier in this session.',
    },
    {
      id: 'previously-passing-path-gains-a-network-dependency-and-two-new-fail-closed-exits',
      severity: 'warning',
      note:
        'The one genuine behavioral delta on a pre-existing path, recorded so it is not mistaken for "purely additive". Before this SD, an ' +
        'SD reaching the end of Scan B with zero open PRs and zero unmerged branches returned passed:true immediately, using only state ' +
        'already gathered. Now, for any sd_type NOT in NO_CODE_SD_TYPES whose mergeEvidence array is empty, control falls into Scan C, ' +
        'which issues an additional `gh pr list --repo <R> --state merged --search "<sdId>" --limit 100` per target repo (30s timeout ' +
        'each) and can return passed:false with two NEW reason codes that did not previously exist on this path: scan_c_unreadable (any ' +
        'repo\'s gh call threw and nothing matched) and scan_c_saturated (search returned >= 100 raw results with none owned by the SD). ' +
        'The empty-mergeEvidence case is the COMMON case, not an edge case — mergeEvidence is populated in Scan B only via the squash-merge ' +
        'whitelist, which requires the branch to still exist on the remote, whereas the normal /ship --delete-branch end state leaves no ' +
        'branch. So the added latency and the added gh-availability dependency apply to most completing SDs. This is the SD\'s explicit, ' +
        'in-code-documented intent (fail closed rather than conclude never_pushed from a verification outage) and all five ORIGINAL ' +
        'scenarios in the brief still behave identically — open PR blocks, unmerged branch blocks, squash-merge passes (mergeEvidence ' +
        'non-empty short-circuits Scan C entirely), key-set-unavailable fails closed, unreadable-repo fails closed. Flagged as a WARNING ' +
        'rather than a regression because the direction is fail-closed and intended, but operators should expect PR_MERGE_VERIFICATION to ' +
        'become gh-outage-sensitive on the success path, which it was not before.',
    },
  ],
  metadata: {
    validation_type: 'regression_no_behavior_change',
    prd_id: 'PRD-SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001',
    gate_file: 'scripts/modules/handoff/executors/lead-final-approval/gates.js',
    diff_stat: '249 insertions(+), 2 deletions(-), 1 file',
    hunk_count: 7,
    pure_insertion_hunks: 5,
    modified_line_hunks: 2,
    modified_lines: [
      "old:683 -> current:727 — const { execSync } => const { execSync, execFileSync } (additive destructure, same dynamic import)",
      "old:914 -> current:1161 — success-path details object gains mergeEvidence: mergeEvidence.length (additive field)",
    ],
    original_scenarios_unchanged: {
      open_pr_blocks: 'UNCHANGED — Scan A region old:684-781 has no hunk',
      unmerged_branch_blocks: 'UNCHANGED — commit-count check, unverified handling and blocking return all outside every hunk',
      squash_merge_passes: 'UNCHANGED — one additive push inside the existing whitelist branch; non-empty mergeEvidence short-circuits Scan C',
      key_set_unavailable_fails_closed: 'UNCHANGED — keySetResult handling precedes the first hunk in the function body',
      unreadable_repo_fails_closed: 'UNCHANGED — unreadableRepos accumulation and refusal return are byte-identical',
    },
    sibling_gate_createPRPrecheckGate: 'UNTOUCHED — first hunk is an insertion after its closing brace',
    outer_catch_fail_closed: 'UNTOUCHED — appears only as diff context after the final hunk',
    callers_checked: {
      computeReposForSD: ['gates.js:731', 'scripts/one-off/scan-completed-sds-for-never-pushed-merge-verification-never-001.mjs:110'],
      createPRMergeVerificationGate: ['gates.js:1785 (supabase)', 'pr-merge-verification.test.js:62 (null, { loadKeySet })', 'pr-merge-verification.test.js:346 (fakeSupabase, { loadKeySet })'],
      isNeverPushedSpecimen: ['gates.js:1078 (live gate)', 'never-pushed-specimen.test.js', 'scan-completed-sds-...mjs:219'],
      signature_changes: 'NONE — no new required parameter on any pre-existing export',
    },
    prior_finding_resolved:
      'EXEC-phase TESTING finding "shared-classifier-is-not-actually-shared-with-the-live-gate" is CLOSED — the live gate now calls isNeverPushedSpecimen at gates.js:1078 with the gathered evidence plus shipReviewFindings.',
    test_results: {
      command: 'npx vitest run <14 files>',
      test_files: '14 passed (14)',
      tests: '149 passed | 2 skipped (151)',
      duration: '1.32s',
      failures: 0,
      skips_explained: 'Both skips are in tests/unit/handoff/gates/phantom-test-audit-gate.test.js:126, which uses `const itOrSkip = hasKey ? it : it.skip` — an environment/key-gated conditional skip that is pre-existing and independent of this SD. No test in the battery was skipped because of this change.',
    },
    excluded_from_battery: 'tests/unit/invocation-detector/invocation-path-gate.test.js — known content-independent Windows/vitest flake, already signaled, out of scope',
    measurement_method:
      'Regression conclusions are drawn from git diff hunk ranges (the -N,0 old-side zero-length marker proves non-deletion mechanically) ' +
      'and from repo-scoped grep for call sites, then confirmed by executing the test battery. No conclusion rests on reading the new code ' +
      'and judging it harmless.',
  },
  execution_time_ms: 900000,
};


const CRITICAL_ISSUES = [];

const WARNINGS = [
  'Behavioral delta on a previously-passing path (intended, fail-closed): for any sd_type not in NO_CODE_SD_TYPES with an empty mergeEvidence array — the COMMON case, since mergeEvidence is only populated by Scan B\'s squash-merge whitelist which requires the remote branch to still exist — the terminal passed:true return is now preceded by Scan C, an extra `gh pr list --state merged --search "<sdId>" --limit 100` per target repo at a 30s timeout. PR_MERGE_VERIFICATION therefore becomes gh-outage-sensitive on the success path, which it was not before, and can now return two new reason codes on that path: scan_c_unreadable and scan_c_saturated.',
  'One line above the "No open PRs found" log line DID change, contrary to the zero-changes expectation stated in the review brief: current:727 `const { execSync, execFileSync } = await import(\'child_process\')`. Non-behavioral (an additional binding destructured off the same already-existing dynamic import; execSync and all its call sites untouched), but recorded so the "zero changes above that point" claim is not carried forward as measured when the measurement shows one benign line.',
  'The diagnostic local-branch probe added inside the never-pushed branch (git for-each-ref + execFileSync git ls-remote) is documented as host-local and verdict-irrelevant, but it is only exercised in its empty form by the current suite, so the localCandidate-populated message branch is unasserted. Not a regression (the code is new), noted as residual coverage.',
];

const RECOMMENDATIONS = [
  'No regression remediation required — merge as-is from a regression standpoint. All five original scenarios (open PR blocks, unmerged branch blocks, squash-merge passes, key-set-unavailable fails closed, unreadable-repo fails closed) are byte-identical in control flow.',
  'Operationally: expect PR_MERGE_VERIFICATION latency on the success path to rise by up to 30s per target repo, and expect completion to block (not falsely pass) during a gh auth/rate-limit outage. Worth a note in the SD changelog so an operator hitting scan_c_unreadable recognizes it as designed behavior rather than a new bug.',
  'Follow-up candidate already self-identified in the diff and NOT closed by this SD: the Scan B `catch (_repoError)` fail-open at current:916-921 is the same class RESUME-FINAL-READ-001 FR-4 closed on the Scan A side. Track it as its own SD rather than widening this one.',
  'If a future change touches Scan B, add an assertion that a squash-merged SD still short-circuits Scan C (mergeEvidence non-empty) — that single property is what keeps the added network dependency off the squash-merge path, and nothing currently pins it as a regression guard.',
];

const results = PARTIAL ? partialResults : finalResults;

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'REGRESSION',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

if (PARTIAL) {
  const stored = await storeSubAgentResults('REGRESSION', SD_ID, { name: 'Regression Validation Specialist' }, results, { phase: PHASE });
  console.log('STORED_ROW_ID=' + (stored?.id || JSON.stringify(stored)));
} else {
  // Update the SAME provisional row written by --partial (crash-insurance contract,
  // SD-FDBK-ENH-REGRESSION-SUB-AGENT-001) rather than inserting a second, duplicate row.
  const ROW_ID = '7d18e34b-997c-4a2d-976e-d92bc974e262';
  const { data: prior, error: readErr } = await supabase
    .from('sub_agent_execution_results').select('metadata').eq('id', ROW_ID).single();
  if (readErr) throw new Error('read failed: ' + readErr.message);
  const { data, error } = await supabase
    .from('sub_agent_execution_results')
    .update({
      verdict: results.verdict,
      confidence: results.confidence,
      summary: results.summary,
      critical_issues: CRITICAL_ISSUES,
      warnings: WARNINGS,
      recommendations: RECOMMENDATIONS,
      execution_time: results.execution_time_ms,
      phase: PHASE,
      executed_from_cwd: results.metadata.executed_from_cwd,
      metadata: { ...prior.metadata, ...results.metadata, partial: false, original_verdict: results.verdict, findings: results.findings },
    })
    .eq('id', ROW_ID)
    .select('id, verdict, confidence, phase, sd_id')
    .single();
  if (error) throw new Error('update failed: ' + error.message);
  console.log('UPDATED_ROW=' + JSON.stringify(data));
  console.log('STORED_ROW_ID=' + data.id);
}
console.log('PARTIAL=' + PARTIAL);
console.log('STORED_VERDICT=' + results.verdict);
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('EXECUTED_FROM_CWD=' + results.metadata.executed_from_cwd);
