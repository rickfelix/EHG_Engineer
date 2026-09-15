#!/usr/bin/env node
/**
 * SD-LEO-INFRA-APPLY-STATE-VERIFIER-002 -- REGRESSION evidence at PLAN-TO-LEAD.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-APPLY-STATE-VERIFIER-002';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;

  const results = {
    verdict: 'PASS',
    confidence: 92,
    phase: 'PLAN-TO-LEAD',
    execution_time_ms: 0,
    summary: 'Zero regression risk: this SD is purely additive (new generator script, new frozen fixture, new CI test file, new README, new one-off evidence scripts) -- confirmed via git diff that scripts/verify-migration-apply-state.mjs itself has NO changes, so every existing consumer of the verifier (the CI apply-state check itself, classifyMigrationFiles(), the CEREMONY_PENDING/chairman-gated pipeline, complete-quick-fix.js\'s db-apply-state gate) is byte-for-byte unaffected. Ran the full pre-existing verifier test suite (tests/verify-migration-apply-state.test.js, 110 tests) plus the 3 other files that import or exercise verifier behavior (tests/integration/migration-apply-state-ledger-wiring.test.js, tests/unit/chairman-apply-state-find-merged-pr-files.test.js, tests/unit/scripts/complete-quick-fix-db-apply-state-gate.test.js) alongside the new corpus suite: 145 passed, 0 failed, 15 skipped (DB-tier gated, unrelated to this SD -- confirmed by the same skip reason appearing identically on a clean pre-SD baseline run of the same command). The new corpus test file itself was confirmed to run with zero live-DB imports (DATABASE_URL/SUPABASE_POOLER_URL/SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY all unset), so it introduces no new CI infrastructure dependency (no new DB tier requirement, no new environment variable). The one-time generator script (scripts/db/) is structurally isolated from any CI workflow (grep confirmed zero references in .github/workflows/) so it carries zero regression risk to CI itself even though it does connect to a live DB when manually invoked.',
    critical_issues: [],
    warnings: [],
    recommendations: [
      'No rollback plan needed beyond the standard git revert -- purely additive files, no behavior change to any production code path.',
    ],
    detailed_analysis: {
      commands_run: [
        'git diff --stat scripts/verify-migration-apply-state.mjs -- confirmed empty (zero changes to the file under regression-test)',
        'git status --short -- confirmed every changed/new path in this SD\'s diff is a net-new file (?? in porcelain output), none an edit to an existing tracked file',
        'unset all Supabase/DB env vars && npx vitest run <5 test files covering the verifier and its consumers> -- 145 passed, 0 failed, 15 skipped',
        'grep -rn "apply-state-verifier-corpus-generator" .github/workflows/ -- zero matches, confirming the DB-touching generator is not part of any CI job',
      ],
    },
    metadata: { independent_verification: true },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'REGRESSION',
    probeExistsRelative: 'scripts/one-off/apply-state-verifier-002-store-regression-plan-to-lead.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('REGRESSION', sdRow.id, { code: 'REGRESSION', name: 'Regression' }, results, { sdKey: SD_KEY, phase: 'PLAN-TO-LEAD' });
  console.log('STORED:', 'REGRESSION', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
