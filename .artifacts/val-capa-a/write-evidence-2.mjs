import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_KEY = 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A';
const SD_UUID = '566eb446-0f7c-4fbb-8d39-d0584bdd417f';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const resolution = await resolveSubAgentRepo({
  sdId: SD_UUID,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'VALIDATION',
  fallback: process.cwd(),
  probeExistsRelative: 'scripts/eva/capa-001-a-baseline-runner.mjs',
  supabase,
});

const results = {
  verdict: 'FAIL',
  confidence: 94,
  summary: [
    'Re-validation of SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A @ 5b5e9d9f938 after the VAL-1/VAL-2 fixes.',
    'VAL-1 is CLOSED and verified: the AxeBuilder crash is fixed via browser.newContext() + context.newPage() with correct teardown.',
    'The baseline run was genuinely performed against AltifyAI; the accessibility and responsive legs really executed and are legitimately clean.',
    'VAL-2 is only PARTIALLY closed, and the premise offered for closing FR-2 does not hold.',
    'The claim that the Lighthouse failure is an environment-level limitation was tested directly and DISPROVEN:',
    'Lighthouse scores ARE obtainable on this exact machine (2/2 successful runs via the lighthouse node API),',
    'and feeding the real LHR through the runner OWN buildLighthouseFindings() yields a genuine medium-severity',
    'largest-contentful-paint-above-threshold finding on AltifyAI (3990ms and 5253ms against the 3500ms budget).',
    'The collect-failed degradation therefore masked the single real quality signal this baseline existed to capture.',
    'FR-2 is NOT substantively satisfied; the remaining defect is in-scope and small.',
  ].join(' '),
  critical_issues: [
    {
      id: 'VAL-3',
      severity: 'HIGH',
      issue: 'FR-2 is not satisfied and the "environment blocks it" premise is disproven. Root cause, traced end to end: the lighthouse CLI saves the LHR (lighthouse/cli/run.js calls saveResults() BEFORE potentiallyKillChrome()), then potentiallyKillChrome() -> Launcher.destroyTmp() -> rmSync() throws EPERM on the %TEMP%\\lighthouse.* profile dir using the NEWER chrome-launcher nested under lighthouse/node_modules. The CLI exits non-zero, and @lhci/cli/src/collect/node-runner.js discards an LHR that was already written. The failure is confined to the lhci CLI wrapper exit-code handling, NOT to this machine ability to run Lighthouse. PROOF: I ran the lighthouse node API directly (lighthouse 11.4.0 + top-level chrome-launcher 0.13.4) against https://altifyai.app/ twice, 2/2 success, no teardown throw: performance 0.85 / 0.77, best-practices 0.74, accessibility 1, seo 0.83, pwa 0.38. Passing those real LHRs through the runner OWN buildLighthouseFindings() with the repo-root lighthouserc.json thresholds produces 2 findings each time, including a medium-severity performance:largest-contentful-paint-above-threshold (3990.23ms then 5253.45ms vs the 3500ms budget). The persisted collect-failed row therefore replaced a real, material, reproducible quality defect on the venture with an error record. FR-2 acceptance criterion 1 requires persisting performance/best-practice SCORES; zero scores were persisted.',
      recommendation: 'Invoke Lighthouse via the node API instead of the lhci collect subprocess, wrapping chrome.kill() in try/catch. FR-2 mandates the lighthouserc.json THRESHOLDS as the source of truth, not the invocation mechanism, so this stays inside FR-2 scope. It also strictly improves the SEC-1 posture (no subprocess and no argv at all). Requires declaring lighthouse (and chrome-launcher) as direct dependencies -- both are currently only transitive via @lhci/cli, though both already resolve.',
    },
  ],
  warnings: [
    {
      severity: 'MEDIUM',
      issue: 'Live-data pollution: a stray probe row is sitting in venture_quality_findings. id b8ffac8b-703a-42d0-a20e-1bf3ef1d8718, finding_category=accessibility, severity=low, status=pending, venture_id=00000000-0000-0000-0000-000000000000, finding_hash=probe3-1789325311738, evidence_pointer={} , created 2026-09-13T18:48:31Z (after the 18:42 baseline run). It is NOT one of mine -- my probe rows used a real venture_id and valprb-prefixed hashes and I verified the table returned to its pre-probe count of 66. isLikelyTestFixture() does not catch it (that discriminator keys on the fc000000- venture prefix or a t- evidence_pointer.sig; this row matches neither), so it reads as a genuine production accessibility finding to the aggregator and would surface in the FR-4 sitting packet. The table is now 68 rows: 66 pre-existing + the legitimate collect-failed finding + this stray.',
      recommendation: 'Delete row b8ffac8b-703a-42d0-a20e-1bf3ef1d8718 before PLAN-TO-LEAD.',
    },
    {
      severity: 'MEDIUM',
      issue: 'Zero-yield coverage, now demonstrated rather than predicted. The completed run persisted exactly one row (the collect-failed finding). Accessibility and responsive both executed and found nothing, so the database holds no evidence that either dimension was ever checked, no surface, and no breakpoint names. The FR-3 acceptance criterion ("layout-break findings persisted for all three breakpoints, tagged with the breakpoint name as part of the finding surface/evidence") has no corresponding row, and once FR-4 lands the sitting packet will have nothing to render for two of the three dimensions.',
      recommendation: 'Mirror the FR-2 run-recorded precedent: emit a low-severity accessibility:run-recorded finding and a responsive:<breakpoint>:checked finding per breakpoint.',
    },
    {
      severity: 'LOW',
      issue: 'Single-surface coverage versus FR-1/FR-3 wording. FR-1 says "scan every built AltifyAI surface"; the run covered only the deployment_url root, a 38-node marketing landing page. /register and the D2/D3 journey surfaces (Account Settings, Subscription and Billing, registration/login/logout) are unscanned. The clean accessibility and responsive result is therefore a statement about the landing page only, not about AltifyAI.',
      recommendation: 'Either enumerate surfaces (at minimum / and /register) or record the single-surface limitation as an accepted PLAN scope reduction, so the clean result is not read as venture-wide.',
    },
    {
      severity: 'LOW',
      issue: 'Evidence-provenance hygiene: commit 5b5e9d9f938 swept my VALIDATION scratch scripts (.artifacts/val-capa-a/*.mjs, 9 files, 298 of the 315 added lines) into the SD EXEC fix commit. Validator-authored files are now part of the product branch and would read as EXEC deliverables in a diff review.',
      recommendation: 'Drop .artifacts/val-capa-a/ from the branch, or keep it but do not count it as EXEC output.',
    },
    {
      severity: 'LOW',
      issue: 'The new PRD risk-register entry and the in-code comment both state the Lighthouse failure means "on an environment without this Windows-specific chrome-launcher issue, the same code persists real performance/best-practice scores per FR-2". That is true but incomplete, and as written it justifies shipping: the scores are obtainable on THIS environment too, via a different invocation. The comment should not stand as the resolution of FR-2.',
      recommendation: 'Amend the comment and the risk entry once VAL-3 is fixed, so the record does not preserve a disproven premise.',
    },
  ],
  recommendations: [
    { priority: 'HIGH', title: 'Switch the Lighthouse leg to the node API with a guarded kill', description: 'Proven working 2/2 on this machine. Keeps lighthouserc.json as the threshold source, removes the subprocess entirely, and recovers the real LCP finding the current path discards.' },
    { priority: 'MEDIUM', title: 'Delete the stray probe row b8ffac8b and re-run the baseline after the FR-2 fix', description: 'The re-run is idempotent -- findings UPSERT on (venture_id, finding_hash) -- so the existing collect-failed row will simply be superseded once a real LHR is obtained.' },
    { priority: 'MEDIUM', title: 'Emit coverage findings for the clean dimensions', description: 'Otherwise a passing baseline and a baseline that never ran are indistinguishable in the data, which is the exact failure mode this SD exists to prevent.' },
  ],
  detailed_analysis: {
    scope: 'Re-validation at PLAN_VERIFICATION of branch feat/SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A @ 5b5e9d9f938, following the coordinator VAL-1/VAL-2 fixes. Supersedes row 28ffd80f-afc7-4bdd-ae06-fc83413a76b6.',
    val_1_closure: 'CLOSED AND VERIFIED. main() now creates an explicit context (browser.newContext() -> context.newPage()) and closes it in a finally block nested inside the browser finally. Teardown ordering is correct. The live run confirms the accessibility leg executed rather than crashed.',
    val_2_closure: 'PARTIALLY CLOSED. The run genuinely happened -- I confirmed the persisted row 86d4e5a9-dfe5-4b95-acdd-0b56689d10cd (venture 50763b6a, performance, low, run_id capa-001-a-1789324914336, real error text captured) and confirmed no remediation SD was auto-filed, so the severity cap held end to end. The accessibility and responsive legs executed and are legitimately clean (independently corroborated: my own read-only scan of https://altifyai.app found 0 axe violations and 0px overflow at all three breakpoints, against a properly hydrated page). The performance leg persisted no scores, which is the basis for VAL-3.',
    lighthouse_root_cause: {
      mechanism: 'lighthouse/cli/run.js runs saveResults(runnerResult, flags) BEFORE potentiallyKillChrome(launchedChrome). The EPERM is thrown afterwards by Launcher.destroyTmp() -> rmSync() on the %TEMP%\\lighthouse.* dir, inside lighthouse/node_modules/chrome-launcher (a newer nested copy than the top-level chrome-launcher 0.13.4). The non-zero CLI exit makes @lhci/cli/src/collect/node-runner.js:120 throw "Lighthouse failed with exit code 1", discarding an LHR that had already been written.',
      reproduced_by_validator: 'Yes -- I ran the identical lhci invocation directly and observed the full audit complete ("Generating results..."), then the EPERM at chrome-launcher.js:367 via run.js:194, leaving .lighthouseci created but empty. The coordinator diagnosis of WHERE it fails is accurate.',
      capability_claim_settled: 'The conclusion drawn from it is not. Two consecutive lighthouse node API runs succeeded on this machine with no teardown throw, producing full LHRs (lighthouse 11.4.0). Scores: performance 0.85 then 0.77, best-practices 0.74, accessibility 1, seo 0.83, pwa 0.38. FCP 2255ms then 2255ms; LCP 3990.23ms then 5253.45ms.',
      masked_defect: 'buildLighthouseFindings() over those real LHRs produces 2 findings per run, including a medium-severity performance:largest-contentful-paint-above-threshold (LCP exceeds the 3500ms lighthouserc.json budget on both runs). The degradation path replaced a real, reproducible, material quality signal with an error record -- the precise outcome an informational baseline exists to avoid.',
    },
    fr_verdicts: {
      FR_1_accessibility: 'SATISFIED as to mechanism (VAL-1 closed, scan executes, severity cap and enforceSeverityCap guard intact). Residual: zero-yield coverage and single-surface scope, both advisory.',
      FR_2_performance: 'NOT SATISFIED. Acceptance criterion 1 requires persisting performance/best-practice scores with a run id; zero scores persisted, and the obtainability of those scores on this machine is demonstrated. In-scope fix identified.',
      FR_3_responsive: 'SATISFIED as to mechanism (all three breakpoints measured live, VIEWPORTS match screenshot-generator.js exactly). Residual: no persisted row evidences the three breakpoints were checked.',
      FR_4_sitting_packet: 'CORRECTLY DEFERRED -- chairman-product-review.js still untouched. Not counted as a gap.',
    },
    test_scenarios_recheck: 'TS-1, TS-2 and TS-4 were fully re-run at the prior commit and all passed (24 tests; 2 live-DB tests with VITEST_DB_ALLOW_REF designated; 226 tests across the 16-file blast radius). The only code change since is the browser-context fix in main() and comments, which is outside every assertion those suites make, so their verdicts carry forward. TS-3 remains deferred with FR-4.',
    answer_to_coordinator_question: 'Asked directly whether FR-2 is substantively satisfied by correct code plus a collect-failed finding as evidence of a real attempt: no, and the deciding factor is not strictness about the acceptance-criteria wording. It is that the environment-limitation premise is empirically false -- the scores are obtainable here, 2/2, and obtaining them surfaces a genuine medium-severity LCP defect on the venture. Accepting the degradation would ship a baseline whose one persisted performance row is an error message, while the real finding it was built to capture stays invisible. Per the standing root-cause-never-work-around order, the graceful-degradation path is the correct behavior for a genuine tool outage and should stay, but it is not the resolution here because there is no outage to degrade around.',
    method: 'Fetched and checked out 5b5e9d9f938; read the full diff; verified the persisted findings and the absence of auto-filed SDs directly in the database; reproduced the lhci failure independently; read lighthouse/cli/run.js to establish the save-then-kill ordering; ran the lighthouse node API twice against the live venture URL and passed the resulting LHRs through the runner own builder. All probes were READ-ONLY with respect to venture_quality_findings -- per the gate-evidence provenance rule I did not write the baseline data this gate exists to check.',
  },
  conditions: [
    { action: 'Fix VAL-3: obtain the Lighthouse LHR via the node API with a guarded chrome.kill() (declaring lighthouse/chrome-launcher as direct dependencies), then re-run the baseline so real performance/best-practice scores and the LCP finding persist.', priority: 'high', blocking: true },
    { action: 'Delete the stray probe row b8ffac8b-703a-42d0-a20e-1bf3ef1d8718 from venture_quality_findings.', priority: 'medium', blocking: false },
    { action: 'Emit coverage findings for clean accessibility and per-breakpoint responsive results so a clean baseline is distinguishable from a baseline that never ran.', priority: 'medium', blocking: false },
    { action: 'Amend the in-code comment and the new PRD risk entry once VAL-3 lands, so a disproven premise is not preserved in the record. Remove .artifacts/val-capa-a/ from the branch.', priority: 'low', blocking: false },
  ],
  justification: 'FAIL, narrowed to a single blocking issue. VAL-1 is closed and verified, the baseline run genuinely executed, and the accessibility and responsive results are legitimately clean. FR-2 remains unsatisfied: no performance or best-practice scores were persisted, and the environment-limitation premise offered for accepting that was tested directly and disproven -- Lighthouse scores are obtainable on this machine (2/2 via the node API), and obtaining them surfaces a real medium-severity LCP-over-budget finding on AltifyAI that the current path discards. The remediation is confined to how this runner invokes Lighthouse and does not touch the migration, the category widening, or any passing test.',
  metadata: {
    phase: 'PLAN_VERIFICATION',
    commit: '5b5e9d9f938',
    branch: 'feat/SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A',
    validator_model: 'claude-opus-5[1m]',
    supersedes: '28ffd80f-afc7-4bdd-ae06-fc83413a76b6',
  },
  execution_time_ms: 0,
};

applySubAgentRepoVerdict(results, resolution);

const { data: sa } = await supabase.from('leo_sub_agents').select('*').eq('code', 'VALIDATION').maybeSingle();
const stored = await storeSubAgentResults('VALIDATION', SD_UUID, sa, results, {
  phase: 'PLAN_VERIFICATION',
  sdKey: SD_KEY,
});
console.log('STORED id=', stored?.id, 'verdict=', stored?.verdict, 'phase=', stored?.phase);
