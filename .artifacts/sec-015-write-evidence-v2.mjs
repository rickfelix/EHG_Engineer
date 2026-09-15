import dotenv from 'dotenv';
dotenv.config();
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { createClient } from '@supabase/supabase-js';

const SD = 'SD-LEARN-FIX-ADDRESS-PAT-LES-015';
const COMMIT = '4d00b8e4a924b6fec554324119d59ad1c45ee8c5';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const findings = [
  {
    area: 'PRIOR LOW FINDING -- CLOSED, verified minimal and non-invasive',
    severity: 'INFO',
    issue: 'My prior EXEC SECURITY row (91602645) raised that await orchestratorFactory() at line 171 sat outside any try/catch, so a construction/import throw would propagate and let ValidationOrchestrator.js:213-225 substitute {passed:false, score:0}, with that 0 entering the weighted aggregate at full weight. Commit 4d00b8e4a92 wraps the whole validator body in an outer try/catch returning {passed:true, score:85, findings:[{type:AUDIT_INCOMPLETE, phase:ALL, error}]}. I verified the change is surgical rather than trusting the summary: git diff -w --ignore-blank-lines against the parent shows the ONLY additions are the literal "try {" line and the catch block -- ZERO lines removed and ZERO pre-existing logic altered. The 90-line churn in the raw diff is pure reindentation of the moved block. Gap is genuinely closed.'
  },
  {
    area: 'Catch scope vs genuinely fatal conditions -- EMPIRICALLY SETTLED, coordinator concern unfounded',
    severity: 'INFO',
    issue: 'The coordinator asked whether catch (err) swallows literally everything, including a fatal environment issue like OOM. I settled this by EXECUTION, not reasoning: ran each class in an isolated child process (.artifacts/sec-015-catch-scope-probe.mjs). RESULTS -- V8 heap exhaustion under --max-old-space-size=24: exit=134 (SIGABRT), no output, NOT swallowed (heap OOM is a process abort, not a catchable JS exception, so it still propagates past any catch); process.exit(42) from inside the try: exit=42, NOT swallowed; self-delivered SIGTERM: NOT swallowed; stack-overflow RangeError: IS swallowed; TypeError: IS swallowed. So the actual scope is "every catchable JS-level error, but no process-fatal condition." For an advisory gate that must architecturally never crash the pipeline it runs inside, that is precisely the correct boundary: it contains everything it CAN contain, while real environment death still reaches the runtime. No security impact.'
  },
  {
    area: 'Residual: the outer try is WIDER than the reported defect -- accepted, but worth recording',
    severity: 'LOW',
    issue: 'The outer try does not wrap only orchestratorFactory(); it now also covers computeNearMissFindings(), scoreFindings(), findingsToWarnings() and the success-path return construction. Consequence: an ordinary programming bug in those pure helpers (e.g. a TypeError on a malformed row) is now converted into score:85 with the warning text "registry audit could not run at all", which MISATTRIBUTES a logic defect as an availability failure. Two things keep this acceptable rather than a masking defect: (1) the thrown message is preserved verbatim in BOTH findings[0].error and the warnings string, so it surfaces in handoff output -- degraded, not silent; (2) the alternative (propagation) is strictly worse on every axis, since ValidationOrchestrator substitutes a generic "Validation error" AND scores 0 at full weight, hiding the bug just as much while also penalising the handoff. Net improvement. Recorded as a known trade-off, not a blocker, and NOT a security issue (this gate enforces nothing, so a swallowed error can never cause a security control to pass).'
  },
  {
    area: 'Hardcoded 85 in the catch instead of scoreFindings() -- consistent today, latent drift',
    severity: 'INFO',
    issue: 'The outer catch hardcodes score: 85 rather than calling scoreFindings(findings). Behaviourally identical today -- scoreFindings returns 85 for any findings set containing an AUDIT_INCOMPLETE (line 92), which this path always constructs. But the two would silently diverge if the AUDIT_INCOMPLETE floor is ever retuned in scoreFindings, since this literal would not follow. Cosmetic/maintainability only; no security or correctness impact at present.'
  },
  {
    area: 'New phase:ALL sentinel -- no consumer breaks',
    severity: 'INFO',
    issue: 'The catch introduces phase: "ALL", a value outside the 5 real AUDITED_PHASES. Checked for consumers that read findings[].phase or validate it against AUDITED_PHASES: none exist outside the gate itself across scripts/modules/handoff/. The gate own findingsToWarnings() is not invoked on this path (the catch builds its warnings array inline), so there is no double-processing and no format assumption to violate. Safe.'
  },
  {
    area: 'No new security surface introduced by the fix',
    severity: 'INFO',
    issue: 'Re-ran the full security grep battery against the POST-FIX file: write operations (.insert/.update/.delete/.upsert/.rpc) = 0; dynamic imports = 1 (the same pre-existing hardcoded literal specifier); eval/new Function/child_process/execSync = 0; process.env / fs. / readFile / fetch( / http(s) URLs = 0. Import list unchanged (single fetchAllPaginated import). The fix commit touches package.json / package-lock.json not at all, so no new dependencies. Every conclusion from my prior review of commit 581d3606f19 still holds unchanged.'
  },
  {
    area: 'The new test genuinely proves the property',
    severity: 'INFO',
    issue: 'The added test injects orchestratorFactory = async () => { throw new Error("cannot construct orchestrator"); } and asserts passed:true, score:85, maxScore:100 and the exact findings array. This is a real proof rather than a tautology: had the exception propagated, the awaited gate.validator() call would reject and the test would fail outright. Verified by running it -- 29/29 pass in the gate file (28 before the fix + this one).'
  },
  {
    area: 'Cherry-pick integrity and PR state -- independently confirmed',
    severity: 'INFO',
    issue: 'Confirmed ece2adb3f2c (original branch) and 4d00b8e4a92 (follow-up branch) carry byte-identical diffs via diff of git show output for both -- the cherry-pick introduced no drift. Base gate landed separately as squash-merge 7d1f9c89cda (PR #9001). Verified PR #9002 directly via gh: auto-merge ARMED (SQUASH, enabled 2026-09-15T01:45:36Z), and the local branch is in sync with origin/fix/SD-LEARN-FIX-ADDRESS-PAT-LES-015-failsafe at 4d00b8e4a92. Coordinator report matches reality on every checkable claim.'
  },
  {
    area: 'Regression check -- exceeded the reported scope',
    severity: 'INFO',
    issue: 'Coordinator reported 213/213. I ran a deliberately broader scope: npx vitest run scripts/modules/handoff/executors/ tests/factories/ -> 53 test files, 683/683 tests passing, zero failures. This covers all 11 sibling suites that share the mutated validator-context-factory as well as every handoff executor gate, so the additive range() mock and the reindentation are both confirmed regression-free at a wider radius than claimed.'
  },
  {
    area: 'CARRIED FORWARD from the automated scan -- pre-existing, repo-wide, OUT OF SCOPE for this diff',
    severity: 'MEDIUM',
    issue: 'Unchanged and still open from my prior row: the automated SECURITY scan (row ec0c3ce4-bab4-4a93-830c-c27a42b12729) reported (1) the RLS table census could NOT run -- "Could not find the function public.get_tables_without_rls" -- and an unrun census is not a clean census; (2) 60 SECURITY DEFINER functions run as a BYPASSRLS owner and are EXECUTE-able by anon or authenticated. Both predate this branch and are untouched by this fix. Repeated here so the signal is not lost across evidence rows; I did not independently verify the 60 functions and have not minted work for them.'
  },
];

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 95,
  execution_time_ms: 0,
  phase: 'EXEC',
  summary: 'EXEC-phase SECURITY RE-REVIEW of fix commit 4d00b8e4a92 (cherry-pick of ece2adb3f2c; PR #9002, auto-merge armed), superseding my row 91602645 on commit 581d3606f19. DIFF VERDICT: PASS -- the fix genuinely closes my prior LOW finding and introduces nothing new. Verified by reading the actual diff, not the summary: git diff -w --ignore-blank-lines shows the ONLY additions are "try {" and the catch block, with ZERO lines removed and ZERO pre-existing logic altered (the 90-line raw churn is pure reindentation). On the coordinator specific question -- whether catch (err) swallows literally everything, including a fatal issue like OOM -- I settled it by EXECUTION in isolated child processes rather than by reasoning: V8 heap exhaustion exits 134/SIGABRT and is NOT swallowed (heap OOM is a process abort, not a catchable JS exception), process.exit() is NOT swallowed, a self-delivered SIGTERM is NOT swallowed, while TypeError and stack-overflow RangeError ARE. So the real scope is every catchable JS-level error but no process-fatal condition -- exactly the right boundary for an advisory gate that must architecturally never crash the pipeline it runs inside. ONE residual LOW recorded honestly: the outer try is WIDER than the reported defect, also covering computeNearMissFindings/scoreFindings/findingsToWarnings, so a logic bug in those pure helpers is now misattributed as "registry audit could not run at all" -- accepted because the thrown message is preserved verbatim in both findings[].error and the warning (degraded, never silent) and because propagation is strictly worse (generic error text AND score:0 at full weight). No security impact either way: this gate enforces nothing, so a swallowed error can never make a security control pass. Post-fix security greps unchanged (0 writes, 1 static dynamic import, no env/fs/net, no new deps); new phase:ALL sentinel has no external consumer; the new test is a real proof (a propagated throw would fail it). Regression scope exceeded the reported 213 -- I ran 53 files / 683 tests, all passing. Row verdict remains CONDITIONAL_PASS solely to preserve the two PRE-EXISTING repo-wide posture items (unrunnable RLS census; 60 anon/authenticated-EXECUTE-able SECURITY DEFINER functions), which this fix neither introduces nor touches.',
  critical_issues: [],
  warnings: findings.filter((f) => f.severity !== 'INFO'),
  recommendations: [
    'OPTIONAL (INFO, cosmetic): have the outer catch call scoreFindings(findings) instead of the hardcoded 85, so the fail-safe floor cannot drift from the function that defines it.',
    'OPTIONAL (LOW, non-blocking): if distinguishing a logic defect from an availability failure ever matters, the outer catch could narrow to orchestratorFactory() alone, or tag the finding with an error_class. Current wide scope is the safer default for an advisory gate and is the right call today.',
    'OUT OF SCOPE for this SD: restore the public.get_tables_without_rls catalog function so the RLS census can actually run.',
    'OUT OF SCOPE for this SD: review the 60 SECURITY DEFINER functions that are anon/authenticated-EXECUTE-able while running as a BYPASSRLS owner.',
  ],
  detailed_analysis: {
    diff_verdict: 'PASS',
    prior_low_finding_status: 'CLOSED',
    repo_posture_verdict: 'CONDITIONAL_PASS (pre-existing, out of diff scope)',
    supersedes_row: '91602645-d80c-4739-a21e-dcc1bc88e69a',
    catch_scope_probe: {
      method: 'isolated child processes, .artifacts/sec-015-catch-scope-probe.mjs',
      oom_heap_exhaustion: 'NOT swallowed (exit 134 / SIGABRT)',
      process_exit: 'NOT swallowed (exit 42)',
      sigterm: 'NOT swallowed',
      stack_overflow_rangeerror: 'SWALLOWED',
      typeerror: 'SWALLOWED',
      conclusion: 'Catches every catchable JS-level error; no process-fatal condition is masked. Correct boundary for an advisory gate.',
    },
    regression: { test_files: 53, tests_passed: 683, tests_failed: 0, scope: 'scripts/modules/handoff/executors/ + tests/factories/' },
    gate_file_tests: { before: 28, after: 29, passed: 29 },
    findings,
  },
  metadata: {
    phase: 'EXEC',
    handoff_type: 'EXEC-TO-PLAN',
    analysis_mode: 'manual_diff_review',
    review_type: 'fix_verification_re_review',
    analyst: 'security-agent (Chief Security Architect)',
    model: 'claude-opus-5[1m]',
    evaluated_commit_sha: COMMIT,
    cherry_pick_source: 'ece2adb3f2c',
    base_gate_squash_merge: '7d1f9c89cda (PR #9001)',
    pr: 9002,
    branch: 'fix/SD-LEARN-FIX-ADDRESS-PAT-LES-015-failsafe',
    diff_range: '4d00b8e4a92~1..4d00b8e4a92',
    supersedes_row: '91602645-d80c-4739-a21e-dcc1bc88e69a',
    diff_verdict: 'PASS',
    prior_low_finding_status: 'CLOSED',
    security_review_findings: findings,
    metrics: {
      lines_of_logic_removed_or_altered: 0,
      lines_added_semantic: 2,
      new_dependencies: 0,
      db_write_calls_in_gate: 0,
      dynamic_imports_static_verified: 1,
      secrets_found: 0,
      sql_injection_sinks: 0,
      critical_findings: 0,
      high_findings: 0,
      medium_findings_preexisting_out_of_scope: 1,
      low_findings: 1,
      prior_findings_closed: 1,
      fatal_conditions_probed: 5,
      fatal_conditions_correctly_propagating: 3,
      regression_test_files: 53,
      regression_tests_passed: 683,
      gate_file_tests_passed: 29,
    },
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: SD,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'SECURITY',
  supabase: sb,
});
applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: true });

const stored = await storeSubAgentResults(
  'SECURITY',
  SD,
  { code: 'SECURITY', name: 'Chief Security Architect' },
  results,
  { phase: 'EXEC', sdKey: SD }
);
console.log('\nSTORED ID:', stored?.id || JSON.stringify(stored)?.slice(0, 300));
