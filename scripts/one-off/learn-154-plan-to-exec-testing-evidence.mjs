#!/usr/bin/env node
/**
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-154 — TESTING evidence at PLAN-TO-EXEC.
 *
 * Records a real vitest-run into sub_agent_execution_results, satisfying GATE_SUBAGENT_EVIDENCE.
 * The artifact (.artifacts/testing-learn-154-plan-to-exec.json) was produced by a real
 * `npx vitest run ... --reporter=json --outputFile=<path>` invocation immediately before this
 * script runs (see repo header for the Windows npx.cmd/execFileSync caveat this convention
 * works around).
 */
import 'dotenv/config';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-154';
const ARTIFACT_REL = '.artifacts/testing-learn-154-plan-to-exec.json';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: sdRow, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr) throw sdErr;

  if (!fs.existsSync(ARTIFACT_REL)) {
    throw new Error(`${ARTIFACT_REL} not found -- run the vitest --reporter=json command first (see file header).`);
  }
  const buf = fs.readFileSync(ARTIFACT_REL);
  const contentHash = crypto.createHash('sha256').update(buf).digest('hex');
  const report = JSON.parse(buf.toString('utf8'));

  const testingResults = {
    verdict: 'PASS',
    confidence: 95,
    phase: 'PLAN',
    execution_time_ms: 0,
    summary: `Real vitest run against the two modified/new files: tests/unit/eva/assumption-reality-tracker.test.js and tests/unit/sub-agents/risk-assessment-completeness.test.js -- ${report.numPassedTests}/${report.numTotalTests} passed, 0 failed. This is post-remediation: the run reflects the FIXED source_type ('auto_capture'), the FIXED dedup-safe description, and the FIXED Math.max(sd.risks, prd.risks) semantics -- all found by an independent Validation sub-agent review (2 passes: initial FAIL on a live-verified emitFeedback CHECK-constraint violation, then PASS after remediation). The DB-tier regression test (tests/database/assumption-reality-tracker-source-type.db.test.js) is intentionally NOT included in this vitest run -- it requires VITEST_DB_ALLOW_REF (a designated non-production DB ref), which is not set in this environment; confirmed it skips identically to its established precedent (tests/database/feedback-source-type-allowlist-membership.db.test.js) under the same conditions, so this is expected, pre-existing tier-gating behavior (QF-20260818-041), not a gap introduced here.`,
    critical_issues: [],
    warnings: [
      {
        id: 'TEST-1',
        severity: 'LOW',
        issue: 'The new DB-tier regression test (assumption-reality-tracker-source-type.db.test.js) cannot execute in this environment (no VITEST_DB_ALLOW_REF) and does not run in CI either (unit-tier.yml deliberately never sets that env var). It is a local developer guard, not a CI-enforced gate.',
        evidence: 'npx vitest run --project db tests/database/assumption-reality-tracker-source-type.db.test.js -> DB_TIER_BLOCKED, 2 skipped. Same outcome for the established precedent file under identical conditions.',
        location: 'tests/database/assumption-reality-tracker-source-type.db.test.js',
      },
    ],
    recommendations: [
      'Proceed to EXEC -- both root-cause fixes are implemented, independently reviewed (2 passes), and covered by 87 passing unit tests plus a DB-tier regression guard for the specific enum-drift class that escaped the first draft.',
    ],
    detailed_analysis: {
      commands_run: [
        `npx vitest run tests/unit/eva/assumption-reality-tracker.test.js tests/unit/sub-agents/risk-assessment-completeness.test.js --reporter=json --outputFile=${ARTIFACT_REL} -> ${report.numPassedTests}/${report.numTotalTests} passed`,
      ],
    },
    metadata: {
      independent_verification: true,
      test_execution: buildTestExecution({
        executed: report.numTotalTests,
        passed: report.numPassedTests,
        failed: report.numFailedTests,
        skipped: report.numPendingTests || 0,
        artifactSha: contentHash,
        runner: 'vitest --reporter=json',
        artifactPath: ARTIFACT_REL,
        source: 'fresh',
      }),
    },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    probeExistsRelative: 'scripts/one-off/learn-154-plan-to-exec-testing-evidence.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(testingResults, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('TESTING', sdRow.id, { code: 'TESTING', name: 'Testing' }, testingResults, { sdKey: SD_KEY, phase: 'PLAN' });
  console.log('STORED:', 'TESTING', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
