import 'dotenv/config';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';

const SD = 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A';
const RESULTS_FILE = '.artifacts/testing-capa-a/vitest-results.json';
const buf = fs.readFileSync(RESULTS_FILE);
const j = JSON.parse(buf);
const sha256 = crypto.createHash('sha256').update(buf).digest('hex');

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,

  timestamp: new Date().toISOString(),
  summary: `${j.numPassedTests}/${j.numTotalTests} tests passed (${j.numPendingTests} skipped, 0 failed) across tests/unit/eva/quality-findings/ + tests/unit/eva/stage-templates/analysis-steps/`,
  execution_time_ms: 8000,
  critical_issues: [],
  recommendations: [
    'BLOCKER-CLASS GAP (FR-1 informational-only invariant is not actually enforced): lib/eva/quality-findings/sd-generator.js selectPendingFindings() reads .eq(status,pending) plus .in(severity, FR_C_REMEDIATION_SEVERITIES), and FR_C_REMEDIATION_SEVERITIES = [critical, high, MEDIUM] at sd-generator.js:262. The baseline runner writes accessibility/responsive/performance findings at severity=medium, and writer.js never sets status, so every row lands at the table default status=pending. Neither isLikelyTestFixture() (needs a fixture venture-id or sig prefix) nor isInformationalSkippedFinding() (regex over evidence_pointer.legacy_detail/legacy_title, which the runner never sets) excludes them. .github/workflows/fr-c-generator-cron.yml schedules scripts/cron/fr-c-generator.mjs against the live DB, so the next cron run after a baseline WILL auto-file DRAFT remediation SDs. The medium/low severity cap defends only the SYNCHRONOUS writeFinding path (SEVERITIES_REQUIRING_SYNC_SD_GENERATION = critical+high); the runner header comment reasons about that path only. Recommended fix: emit every baseline finding at severity=low (low is excluded from FR_C_REMEDIATION_SEVERITIES), or exclude WARN_CAPPED_CATEGORIES inside selectPendingFindings.',
    'DEFENSE-IN-DEPTH GAP: the severity cap is enforced by construction in all four builders (axeImpactToSeverity, buildResponsiveFindings, buildLighthouseFindings, buildLighthouseFailureFinding) but there is no runtime assertion in main() before writeFindingsBatch. main() only logs after the fact when result.sd_generated > 0, which cannot prevent it. Add a pre-write filter or throw on any severity outside medium/low.',
    'TS-2 IS SKIPPED, NOT PASSING: tests/database/venture-quality-findings-capa-baseline-categories-check.test.js reports 2 skipped under vitest run --project db (db-tier refuses a non-designated ref, reason=no_designated_target). This matches repo convention (the reference test it mirrors, tests/database/model-usage-log-phase-check.test.js, also skips), so it is not a defect this SD introduced, but TS-2 supplies zero live verification today. Its primary path is also dead: exec_sql_readonly, exec_sql and execute_sql all return "Could not find the function" against the live DB, so it would always take the probe-insert fallback.',
    'TS-2 FALLBACK NEGATIVE TEST IS NON-DISCRIMINATING: probeInsertAccepts() returns !insertErr, so ANY error (not just 23514) reads as "category rejected". The second test would therefore pass even if the CHECK constraint were dropped entirely, as long as some other error occurred. Mitigating: venture_quality_findings has NO FK on venture_id (20260429 migration declares venture_id UUID NOT NULL with no REFERENCES) and status defaults to pending, so the probe row is insertable. The test should assert error.code === 23514 rather than mere failure.',
    'MIGRATION LAST-WRITER-WINS HAZARD: both 20260828_venture_quality_findings_experience_categories.sql (usability/accessibility/journey_coherence, never applied live) and 20260913_venture_quality_findings_capa_baseline_categories.sql (accessibility/performance/responsive, applied live) DROP and re-ADD the same constraint from a hardcoded full list. Neither list is a superset of the other, so applying the 20260828 migration at any later date silently REVOKES performance and responsive.',
    'IDEMPOTENCY DEFEATED FOR THE performance CATEGORY: all four performance finding_signatures embed runId = `capa-001-a-${Date.now()}` (capa-001-a-baseline-runner.mjs:136, 150, 162, 179), so computeFindingHash() yields a fresh hash on every run. writer.js upserts on (venture_id, finding_hash) precisely to make re-runs a no-op, and finding-shape.js documents that contract. Every re-run of the baseline therefore INSERTS a new set of pending performance rows rather than updating the existing ones. accessibility (rule id + target) and responsive (breakpoint) signatures are correctly stable; only performance is affected. This compounds recommendation 1: each re-run hands the FR-C cron a fresh batch of medium/pending rows. Fix: drop runId from the signature and keep it in evidence_pointer (where it already is), so the run id stays recorded without being part of the identity.',
    'CODE/DB CATEGORY DIVERGENCE (pre-existing, not a regression from this SD): FINDING_CATEGORIES now holds 17 entries while the live CHECK accepts 13. usability, journey_coherence, feedback_widget_present and error_capture_wired pass validateFindingShape() and are then rejected by Postgres at insert. The migration comment acknowledges this. Also stale: the finding-shape.js docblock still reads "The 12 unified Stage 20 finding categories".',
  ],
  metadata: {
    phase: 'EXEC',
    test_execution: buildTestExecution({
      executed: j.numTotalTests,
      passed: j.numPassedTests,
      failed: j.numFailedTests,
      skipped: j.numPendingTests,
      artifactSha: sha256,
      runner: 'vitest@4.1.4 --project unit --reporter=json',
      artifactPath: RESULTS_FILE,
      source: 'fresh',
      mappedCandidates: 45,
      foundFiles: j.numTotalTestSuites,
    }),
    evidence_provenance: {
      producer: 'vitest 4.1.4 --reporter=json',
      results_file: RESULTS_FILE,
      results_sha256: sha256,
      command: 'npx vitest run --project unit tests/unit/eva/quality-findings/ tests/unit/eva/stage-templates/analysis-steps/ --reporter=json',
      runner_success: j.success,
    },
    tests_executed: j.numTotalTests,
    tests_passed: j.numPassedTests,
    tests_failed: j.numFailedTests,
    tests_skipped: j.numPendingTests,
    test_suites: j.numTotalTestSuites,
    targeted_run: {
      command: 'npx vitest run tests/unit/eva/quality-findings/capa-001-a-baseline-runner.test.js tests/unit/eva/quality-findings/finding-shape.test.js tests/unit/eva/quality-findings/vision-detectors.test.js tests/unit/eva/stage-templates/analysis-steps/stage-20-experience-warn-cap.test.js',
      files: 4,
      passed: 61,
      failed: 0,
    },
    ts2_db_run: {
      command: 'npx vitest run --project db tests/database/venture-quality-findings-capa-baseline-categories-check.test.js',
      result: '1 file passed, 2 tests SKIPPED (db-tier no_designated_target)',
      executed_live: false,
    },
    prd_scenario_verdicts: {
      'TS-1': 'SATISFIED. 12 assertions over the 4 pure builders against fixture-shaped axe violations, overflow metrics and LHR JSON. Every finding is round-tripped through validateFindingShape() and the severity cap is asserted per builder. The Lighthouse threshold fixture matches the real lighthouserc.json shape (two-element array, config at index 1).',
      'TS-2': 'PARTIALLY SATISFIED. The test is correctly written as set-containment (10 pre-existing plus 3 new) rather than a count, exactly as the PRD demands. But it does not execute in this environment, its exec_sql_readonly path does not exist on the live DB, and its fallback negative assertion is non-discriminating.',
      'TS-3': 'OUT OF SCOPE for this EXEC pass (deferred pending sibling child -I). Not assessed.',
      'TS-4': 'HOLDS for the gate and threshold surfaces. computeStage20Verdict filters WARN_CAPPED_CATEGORIES (now including performance and responsive) so no baseline finding can drive FAIL or WARN, and stage-20-experience-warn-cap.test.js was updated to pin the 5-element set exactly. Both aggregators (scripts/aggregate-quality-findings.js and scripts/cron/quality-findings-aggregator.mjs) filter on status=open while new rows land at status=pending, so aggregation is unaffected. TIER_MAP caps performance and responsive at Tier 2 even at critical severity. DOES NOT HOLD for the FR-C cron generator, see recommendation 1.',
    },
    files_reviewed: [
      'scripts/eva/capa-001-a-baseline-runner.mjs',
      'tests/unit/eva/quality-findings/capa-001-a-baseline-runner.test.js',
      'tests/database/venture-quality-findings-capa-baseline-categories-check.test.js',
      'database/migrations/20260913_venture_quality_findings_capa_baseline_categories.sql',
      'lib/eva/quality-findings/finding-shape.js',
      'lib/eva/quality-findings/sd-generator.js',
      'lib/eva/quality-findings/writer.js',
      'lib/eva/stage-templates/analysis-steps/stage-20-code-quality.js',
    ],
    severity_cap_audit: 'All 4 finding constructors cap by construction: axeImpactToSeverity (critical/serious/moderate to medium, else low), buildResponsiveFindings (hardcoded medium), buildLighthouseFindings (medium for breaches, low for run-recorded), buildLighthouseFailureFinding (low). No path yields critical or high. The gap is downstream in the FR-C cron medium floor, not in the builders.',
    dependency_check: 'playwright ^1.58.2, @axe-core/playwright ^4.8.0, @lhci/cli ^0.13.0 (node_modules/.bin/lhci present), @supabase/supabase-js ^2.103.0, dotenv ^17.4.1. All resolvable.',
    commits_validated: ['aa3ca9abd10', '42fec777a2a'],
    branch: 'feat/SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A',
  },
};

const { getSupabaseClient } = await import('../../lib/sub-agent-executor/supabase-client.js').catch(() => import('../../lib/sub-agent-executor/results-storage.js'));
const resolution = await resolveSubAgentRepo({
  sdId: SD,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'TESTING',
  fallback: 'EHG_Engineer',
  supabase: typeof getSupabaseClient === 'function' ? await getSupabaseClient() : undefined,
});
console.log('RESOLUTION:', JSON.stringify(resolution));
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('TESTING', SD, null, results, { phase: 'EXEC', sdKey: SD });
console.log('STORED id=', stored?.id, 'verdict=', stored?.verdict, 'phase=', stored?.phase, 'sd_id=', stored?.sd_id);
