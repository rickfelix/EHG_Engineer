#!/usr/bin/env node
/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-F — PLAN-phase TESTING sub-agent evidence.
 *
 * Test-STRATEGY review of PRD-SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-F (no implementation
 * exists yet, so this is an adequacy review of test_scenarios/acceptance_criteria against
 * the real current code shape, not an execution run).
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Runner-produced evidence: vitest JSON report from the PLAN-phase baseline run.
// Counts are READ from the artifact, never hand-authored.
const ARTIFACT_PATH = '.artifacts/capa-001-f-plan-baseline.json';
const rawArtifact = readFileSync(ARTIFACT_PATH);
const artifactSha = createHash('sha256').update(rawArtifact).digest('hex');
const report = JSON.parse(rawArtifact.toString('utf8'));
const testExecution = buildTestExecution({
  executed: report.numTotalTests,
  passed: report.numPassedTests,
  failed: report.numFailedTests,
  skipped: report.numPendingTests,
  artifactSha,
  artifactPath: ARTIFACT_PATH,
  runner: 'vitest run --project unit --reporter=json',
  source: 'fresh',
  foundFiles: (report.testResults || []).length,
});

const SD_KEY = 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-F';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sdRow, error: sdErr } = await supabase
  .from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
if (sdErr) throw sdErr;

const results = {
  verdict: 'CONCERNS',
  confidence: 88,
  phase: 'PLAN',
  execution_time_ms: 0,
  summary: [
    'PLAN-phase test-STRATEGY review of PRD-SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-F (5 FRs, 5 test scenarios; nothing implemented yet).',
    'The PRD is well-grounded and testable: I independently re-verified BOTH live-DB grounding claims -- chairman_decisions.resolved_at returns PostgREST 42703 (column does not exist), so stage-17 lines 510-513 are provably inert; and venture_stages shows stage_number=24 "Launch Readiness" gate_type=kill is_high_consequence=FALSE while siblings 3/19/25 are all TRUE.',
    'I also verified FR-4 AC5 (no test asserts the literal "chairman attestation suffices" -- it occurs only at source lines 11/335/342, zero test matches) and checkReachability line 51 (statusCode>=200 && <500, so 404 IS reachable), which correctly motivates FR-4 honest-detail-text constraint.',
    'BOTH edge cases explicitly asked about ARE covered: TS-2 covers the CI predicate stage-22 true-negative, and TS-3 covers the multi-row venture_deployments aggregation.',
    'CONCERNS (not FAIL) is driven by 3 HIGH gaps that would each produce a GREEN-BUT-DEAD test -- the exact zero-yield failure mode this SD exists to eliminate.',
    'GAP-1 MULTILINE PREDICATE: the self-approval shape spans 3 lines in real source (510 "await supabase" / 511 ".from(chairman_decisions)" / 512 ".update({ status: approved ..."), so the line-oriented "grep-style" predicate FR-2 specifies matches ZERO lines and passes forever; TS-2 synthetic fixture must reproduce the MULTI-LINE chain.',
    'GAP-2 FIXTURE STRICT-THROW: buildMockSupabase ends from(table) with a throw on unexpected tables (fr1-4-6 line 99, fr7-category-coverage line 60); the instant FR-4 reads venture_deployments every existing stage-23 suite throws unless checkVentureUptimeWired try/catches -- making that try/catch LOAD-BEARING for regression safety (no AC states it), while simultaneously letting all existing suites silently take the degraded no-probe-data path and still go green, masking whether the wiring works at all.',
    'GAP-3 TEST-FILE UNDERCOUNT: FR-4 AC5 says "three existing stage-23 test files"; FOUR unit suites import stage-23-launch-readiness.js -- the missed fourth is tests/unit/eva/stage-templates/analysis-steps/stage-23-growth-categories.test.js (different directory, different mock shape with NO strict throw) -- plus 2 integration suites and 2 downstream stage-24 importers. The undercount was inherited verbatim from the LEAD-phase EXPLORE evidence row.',
    'MEDIUM: no existing harness invokes analyzeStage17 at all (TS-1 is new-harness work, not an extension; FR-1 "existing tests pass unmodified" AC is vacuously true); TS-3 omits the most-likely-real states (metadata.probe absent/null on rows seeded with metadata:{}, and null/malformed last_checked_at as sort key); FR-3 "@approved-by: <email> placeholder" wording would fail migration-guard #3 (approver must match git config user.email at apply time).',
    'All gaps are closeable at EXEC via added acceptance criteria -- no re-planning needed.',
  ].join(' '),
  critical_issues: [],
  warnings: [
    'GAP-1 (HIGH, FR-2/TS-2): The self-approval shape spans THREE lines in real source (stage-17-blueprint-review.js:510 "await supabase" / :511 ".from(\'chairman_decisions\')" / :512 ".update({ status: \'approved\', decision: \'approve\', ... })"). FR-2 specifies a "grep-style" predicate; a line-oriented grep matches ZERO lines and yields a permanently-passing dead gate. The predicate MUST read whole-file text and match across lines (readFileSync + a [\\s\\S]-spanning regex between .from(chairman_decisions) and .update() ) or parse an AST. TS-2 synthetic true-positive fixture must reproduce the multi-line chain, not a single-line convenience form, or the test passes while the predicate is blind to the only shape it exists to catch.',
    'GAP-2 (HIGH, FR-4/FR-5): buildMockSupabase from(table) ends in a throw on unexpected tables in stage-23-launch-readiness-fr1-4-6.test.js:99 and -fr7-category-coverage.test.js:60. Adding a venture_deployments read into analyzeStage23LaunchReadiness throws inside every existing fixture. Two consequences, neither covered by an AC: (a) the try/catch in checkVentureUptimeWired is load-bearing for regression safety, not stylistic; (b) with it, all existing suites silently take the degraded "no probe data" branch and still go green, so a completely non-functional wiring would pass regression. Each of the four fixtures needs an explicit venture_deployments branch so the degraded path is selected deliberately.',
    'GAP-3 (HIGH, FR-4 AC5): The "three existing stage-23 test files" count is wrong. FOUR unit suites import stage-23-launch-readiness.js -- the three named PLUS tests/unit/eva/stage-templates/analysis-steps/stage-23-growth-categories.test.js (different directory; makeSupabase auto-chainable vi.fn proxy with NO strict throw; asserts total_categories arithmetic at line 111). Also in regression scope: tests/integration/eva/analysis-steps.test.js, tests/integration/legal-doc-producer-activation.test.js, and downstream importers lib/eva/stage-templates/analysis-steps/stage-24-go-live.js and lib/eva/stage-templates/stage-24.js. The undercount was inherited from the LEAD EXPLORE evidence row verbatim.',
    'GAP-4 (MEDIUM, FR-1/TS-1): NO existing test invokes analyzeStage17. The only stage-17-adjacent suites are lib/eva/__tests__/stage-17-analysis-step-wiring.test.js (47 lines, template-wiring only, zero chairman_decisions assertions) and tests/unit/eva/stage-templates/stage-17-build-brief.test.js (imports only synthesizeBuildBrief). TS-1 therefore requires a NEW harness mocking four module deps (artifact-types, eva-orchestrator-helpers.fetchSripSummary, artifact-persistence-service.recordGateResult/recordGateAttempt, chairman-decision-watcher.createOrReusePendingDecision), not an extension. FR-1 AC "existing stage-17 unit tests pass unmodified except for any assertion tied to the removed log line" is vacuously satisfiable -- no such assertion exists.',
    'GAP-5 (MEDIUM, TS-3): getLatestProbeStatus scenarios omit the two most-likely-real states. ensureDeploymentRows inserts rows with metadata: {} (venture-uptime-probe.js:145), so metadata.probe ABSENT/null is the dominant real-world case, and the PRD own note says venture_deployments was an empty table. Also untested: a null/malformed last_checked_at used as the sort key across multiple rows. A naive max-by-last_checked_at breaks on both. Add both to TS-3.',
    'GAP-6 (MEDIUM, FR-3/TS-5): FR-3 specifies an "-- @approved-by: <email> placeholder". database/chairman-gated/README.md guard #3 requires that header to MATCH git config user.email at apply time (and guard #2 requires the file git-tracked and clean). A literal placeholder token aborts the chairman ceremony. Use a real ceremony-valid approver email as sibling files do (20260913_claim_sd_parent_child_single_pointer.sql carries codestreetlabs@gmail.com), and have TS-5 assert the header parses under scripts/lib/migration-guards.js approver check. Separately, every other file in database/chairman-gated/ has a README ceremony entry; FR-3 has no AC requiring one.',
    'GAP-7 (LOW, FR-5): New test files MUST use the .test.js extension. vitest.config.js unit project includes **/__tests__/**/*.test.js and **/*.test.js but admits .test.mjs only via two narrow allowlists (tests/unit/org, tests/unit/venture-email). A new .test.mjs would be silently uncollected -- a zero-yield test that reports no failures because it never runs.',
    'GAP-8 (LOW, coherence/naming): venture_stages.stage_number=24 IS "Launch Readiness" -- the same gate the module named stage-23-launch-readiness.js implements (venture_stages stage 23 is "Dedicated Venture UAT"). FR-3 and FR-4 therefore harden the SAME kill gate from two directions, which is coherent and a strength, but tests and prose must state explicitly which numbering they mean (module filename vs venture_stages.stage_number) or a later reader will "correct" the apparent mismatch. This is parent-programme root cause E (stage identity drift) surfacing inside the SD itself.',
  ],
  recommendations: [
    'FR-2: reword "grep-style" to "whole-file multiline text or AST predicate" and add an AC: the predicate must flag the verbatim pre-fix stage-17 source (or a fixture copied from it line-for-line) as its true-positive anchor, proving it is not zero-yield. Keep the existing stage-22 true-negative AC.',
    'FR-4: add an AC that checkVentureUptimeWired never throws into the synchronous checklist .map() (mirroring checkTelemetryAnalyticsWired try/catch at stage-23-launch-readiness.js:184-188), AND that the probe read is precomputed BEFORE the map alongside telemetryAnalyticsCheck at line 258 -- the .map() at line 261 is synchronous, so an un-precomputed await cannot work.',
    'FR-4 AC5: correct "three existing stage-23 test files" to four unit suites (add tests/unit/eva/stage-templates/analysis-steps/stage-23-growth-categories.test.js) plus the two integration suites, and require each of the four fixtures to gain an explicit venture_deployments branch rather than relying on the strict-throw/try-catch interaction.',
    'TS-3: add two scenarios -- rows whose metadata.probe is absent/null (the dominant real state, since ensureDeploymentRows seeds metadata:{}), and multiple rows where last_checked_at is null/malformed on at least one.',
    'TS-1: scope to a focused vi.mock-ed harness for analyzeStage17, and make the FR-2 CI predicate the PRIMARY durable regression anchor for FR-1 (it is a static check needing no harness, so it cannot rot the way a heavily-mocked behavioural test can).',
    'FR-3: replace the "<email> placeholder" instruction with a real ceremony-valid approver email, and extend TS-5 to assert the header satisfies migration-guards approver/path/git-tracked preconditions plus add a README ceremony entry.',
    'FR-5: state explicitly that all new test files use the .test.js extension (vitest unit-tier collects .test.mjs only under tests/unit/org and tests/unit/venture-email).',
  ],
  detailed_analysis: {
    review_type: 'PLAN-phase test strategy adequacy review (pre-implementation; no code written yet)',
    prd_id: 'PRD-SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-F',
    prd_internally_consistent: true,
    smoke_test_steps_note: 'product_requirements_v2 has NO smoke_test_steps column; coverage lives in test_scenarios (TS-1..TS-5) + acceptance_criteria. Not a defect.',
    grounding_claims_independently_reverified: {
      'chairman_decisions.resolved_at': 'CONFIRMED ABSENT -- PostgREST 42703 "column chairman_decisions.resolved_at does not exist". The stage-17 UPDATE is provably inert.',
      'venture_stages stage 24': 'CONFIRMED -- stage 24 "Launch Readiness" gate_type=kill is_high_consequence=FALSE; siblings 3 (kill), 19 (promotion), 25 (promotion) all TRUE.',
      'no test asserts chairman attestation suffices': 'CONFIRMED -- string occurs only at stage-23-launch-readiness.js lines 11 (doc comment), 335 (analytics fallback), 342 (default branch). Zero matches under tests/.',
      'checkReachability 404-is-reachable': 'CONFIRMED -- venture-uptime-probe.js:51 reachable: statusCode >= 200 && statusCode < 500. FR-4 honest-detail constraint correctly motivated.',
      ADVISORY_CATEGORIES: 'CONFIRMED -- line 52 [analytics, monitoring]; monitoring stays advisory so FR-4 changes detail text only, not verdict logic. Low blast radius.',
    },
    asked_edge_cases_both_covered: {
      'CI predicate true-negative vs stage-22': 'COVERED by TS-2 explicitly. stage-22 uses .select() only (findApprovedSkipDecision:429, findPendingBlockDecision:453) -- no .update(). A shape-scoped predicate is safe; the real risk is GAP-1 (line-based matching), not false positives.',
      'multi-row venture_deployments aggregation': 'COVERED by TS-3 explicitly, and mirrored by a PRD risk entry. Incomplete only in the two sub-cases noted in GAP-5.',
    },
    regression_scope_actual: [
      'tests/unit/eva/stage-templates/stage-23-launch-readiness-fr1-4-6.test.js (strict-throw fixture, line 99)',
      'tests/unit/eva/stage-templates/stage-23-launch-readiness-fr7-category-coverage.test.js (strict-throw fixture, line 60)',
      'tests/unit/eva/stage-templates/stage-23-launch-readiness-telemetry-analytics.test.js (strict-throw fixture)',
      'tests/unit/eva/stage-templates/analysis-steps/stage-23-growth-categories.test.js (MISSED BY PRD; different mock shape, no strict throw)',
      'tests/integration/eva/analysis-steps.test.js',
      'tests/integration/legal-doc-producer-activation.test.js',
      'tests/unit/ops/venture-uptime-probe.test.js (extension point for TS-3)',
      'lib/eva/__tests__/stage-17-analysis-step-wiring.test.js (collected via **/__tests__/**/*.test.js)',
    ],
    coverage_matrix: {
      'FR-1': 'TS-1 -- adequate in intent; harness does not exist yet (GAP-4)',
      'FR-2': 'TS-2 -- true-positive AND true-negative both present; multiline blindness unaddressed (GAP-1)',
      'FR-3': 'TS-5 (manual) -- well-formedness covered; ceremony-validity of @approved-by unaddressed (GAP-6)',
      'FR-4': 'TS-4 -- three states covered (reachable/unreachable/no-data); fixture strict-throw interaction unaddressed (GAP-2), file count wrong (GAP-3)',
      'FR-5': 'meta-requirement over TS-1..TS-4; extension convention correct, .test.js constraint unstated (GAP-7)',
    },
    verdict_rationale: 'CONCERNS not FAIL: every FR is testable against the real code shape, the plan is structurally sound, and all gaps are closeable by adding acceptance criteria at EXEC without re-planning. CONCERNS not PASS: GAP-1 and GAP-2 would each ship a test that reports green while verifying nothing -- the precise zero-yield/printed-discriminator failure mode this CAPA SD exists to eliminate, so allowing them through unflagged would reproduce the defect class inside the fix itself.',
  },
  metadata: {
    test_execution: testExecution,
    measured: true,
    baseline_note: 'PLAN-phase PRE-IMPLEMENTATION baseline. All 7 in-tier regression-scope unit suites are GREEN at 61/61 before any FR-1..FR-5 code is written, so any post-EXEC failure in these files is attributable to this SD and not to inherited debt. EXTENT: this run covers the unit tier only (vitest --project unit); the 2 integration suites in regression scope (tests/integration/eva/analysis-steps.test.js, tests/integration/legal-doc-producer-activation.test.js) were NOT run here -- they need live DB credentials and belong to a different tier.',
    baseline_suites_green: [
      'stage-23-launch-readiness-fr1-4-6.test.js (16)',
      'stage-23-launch-readiness-fr7-category-coverage.test.js (8)',
      'stage-23-launch-readiness-telemetry-analytics.test.js (4)',
      'stage-23-growth-categories.test.js (7)',
      'venture-uptime-probe.test.js (14)',
      'stage-17-build-brief.test.js (5)',
      'stage-17-analysis-step-wiring.test.js (7)',
    ],
    activation_invariant_verified: false,
    activation_invariant_note: 'Not applicable at PLAN phase; this is a strategy review, not a LEAD-FINAL-APPROVAL chain assertion.',
    implementation_under_test_exists: false,
    scope_note: 'Pre-implementation PLAN-phase review -- none of FR-1..FR-5 is implemented, so the measured run above is a BASELINE of the suites this SD will touch, not a verification of the SD deliverables. Findings derive from reading the PRD row, the three target source files, all eight regression-scope test files, vitest.config.js collection globs, and two independent live-DB grounding probes.',
    files_reviewed: [
      'lib/eva/stage-templates/analysis-steps/stage-17-blueprint-review.js (lines 445-540)',
      'lib/eva/stage-templates/analysis-steps/stage-22-distribution-setup.js (lines 420-470)',
      'lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js (lines 165-195, 258-355)',
      'lib/ops/venture-uptime-probe.js (full, 219 lines)',
      'vitest.config.js (unit project include/exclude, lines 284-312)',
      'database/chairman-gated/README.md + 20260913_claim_sd_parent_child_single_pointer.sql',
    ],
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: sdRow.id,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'TESTING',
  probeExistsRelative: 'scripts/one-off/capa-001-f-testing-plan-strategy-review.mjs',
  supabase,
});
applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });

const stored = await storeSubAgentResults('TESTING', sdRow.id, { code: 'TESTING', name: 'QA Engineering Director' }, results, {
  sdKey: SD_KEY,
  phase: 'PLAN',
});
console.log('STORED:', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }, null, 2));
