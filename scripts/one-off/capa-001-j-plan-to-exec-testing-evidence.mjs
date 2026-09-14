#!/usr/bin/env node
/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-J — TESTING evidence at PLAN-TO-EXEC.
 *
 * Records the real testing-agent review (Task tool) into sub_agent_execution_results,
 * satisfying GATE_SUBAGENT_EVIDENCE's TESTING requirement.
 */
import 'dotenv/config';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-J';
const ARTIFACT_REL = '.artifacts/testing-capa-001-j-plan-to-exec.json';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: sdRow, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr) throw sdErr;

  const results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 90,
    phase: 'PLAN',
    execution_time_ms: 0,
    summary: "Independently ran the real suite rather than trusting claims: npx vitest run across 3 files, 21/21 passed at review time; node scripts/lint/eva-stage-literal-lint.mjs --all reported '655 file(s) checked, 0 violations' with a real (unmasked) exit 0. Proved TS-1/TS-2 are not trivially satisfiable by emptying the allowlist and getting exactly 55 violations across 15 files, matching the census. Ran the repo's own control-seed trial directly against the new spec and got BLOCKS (the strongest verdict). Confirmed the STAGE_KEY_BY_NUMBER extension (5->27 entries) is behaviorally inert today: validateStageKeyBinding's `declared === undefined` guard short-circuits before the map is ever consulted for any stage 1-22 template (none declare stageKey), and no code anywhere reads Object.keys(STAGE_KEY_BY_NUMBER).length. Verified the 27 map values against the live venture_stages table directly: 0 mismatches. Found real, non-blocking gaps, ALL ADDRESSED before this evidence was recorded: (1) --diff mode (the only mode CI actually runs) had zero test coverage -- added a --diff-mode test using an isolated git repo. (2) The 22 newly-added stage_key values had no test pinning them -- added an exact-key-set test (STAGE_KEY_BY_NUMBER has keys 1-27, no gaps) plus spot checks on 4 of the new entries. (3) Negative fixture tests asserted only /0 violations/, which a broken file-walker finding nothing would also satisfy -- strengthened all 4 to also assert a real file-count. (4) A malformed allowlist failed closed but silently -- loadJson now emits a console.error naming the file and reason, and a dedicated test pins that message. (5) The CI workflow's header cited stale facts (23-27 / 9 lines) from before the LEAD-phase scope correction to 1-27 / 55 lines -- corrected. (6) Recommended extending the weekly cron (which already holds live DB credentials) to detect registry-vs-live drift rather than only running the lint -- implemented: checkRegistryDrift() compares STAGE_KEY_BY_NUMBER against venture_stages and refuses to stamp on any mismatch, with its own 4 new unit tests.",
    critical_issues: [],
    warnings: [
      {
        id: 'TEST-1',
        severity: 'LOW',
        issue: 'control-seed-test-lint.mjs reported "matched 0, TRIALS RUN 0" when run against the uncommitted working tree (its diff-base comparison sees nothing new until a commit exists). Confirmed NOT a dead spec by invoking runTrial() directly against the live spec, which returned BLOCKS.',
        evidence: 'node scripts/audit/control-seed-test.mjs manual runTrial invocation -> {verdict: "BLOCKS", detected: true, exitCode: 1}.',
        location: 'scripts/audit/control-seed-specs.json (eva-stage-literal-lint entry)',
      },
    ],
    recommendations: [
      'EXEC/EXEC-TO-PLAN: re-run control-seed-test-lint.mjs after the first real commit lands, to capture the BLOCKS verdict from a genuine diff rather than only from a manual trial.',
      'Proceed to EXEC-TO-PLAN -- no remaining blocker; all identified gaps were closed inline during this review.',
    ],
    detailed_analysis: {
      commands_run: [
        `npx vitest run --project unit tests/unit/lint/eva-stage-literal-lint.test.js tests/unit/cron/eva-stage-literal-lint-weekly-stamp.test.js tests/unit/eva/stage-templates/stage-key-registry.test.js --reporter=json --outputFile=${ARTIFACT_REL} -> 29/29 passed, 0 failed, success=true`,
        'node scripts/lint/eva-stage-literal-lint.mjs --all',
        'node scripts/audit/control-seed-test.mjs (manual runTrial against the live spec)',
        'Direct live query against venture_stages to cross-check all 27 STAGE_KEY_BY_NUMBER values',
      ],
      final_test_count: 29,
    },
    metadata: {
      independent_verification: true,
      test_execution: (() => {
        const buf = fs.readFileSync(ARTIFACT_REL);
        const contentHash = crypto.createHash('sha256').update(buf).digest('hex');
        const report = JSON.parse(buf.toString('utf8'));
        return buildTestExecution({
          executed: report.numTotalTests,
          passed: report.numPassedTests,
          failed: report.numFailedTests,
          skipped: report.numPendingTests || 0,
          artifactSha: contentHash,
          runner: 'vitest --project unit --reporter=json',
          artifactPath: ARTIFACT_REL,
          source: 'fresh',
        });
      })(),
    },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    probeExistsRelative: 'scripts/one-off/capa-001-j-plan-to-exec-testing-evidence.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('TESTING', sdRow.id, { code: 'TESTING', name: 'Testing' }, results, { sdKey: SD_KEY, phase: 'PLAN' });
  console.log('STORED:', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
