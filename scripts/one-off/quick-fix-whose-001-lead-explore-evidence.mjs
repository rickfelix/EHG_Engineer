#!/usr/bin/env node
/**
 * One-off: Explore sub-agent evidence for SD-LEO-FIX-QUICK-FIX-WHOSE-001, LEAD-TO-PLAN phase.
 *
 * Records the discovery work confirming the already-merged fix (escalated from
 * QF-20260912-758, PR #8877, commit 68512894fbe0) matches the SD's stated scope.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-FIX-QUICK-FIX-WHOSE-001';

const findings = [
  {
    id: 'fix-already-merged-to-main',
    severity: 'HIGH',
    summary: 'This SD was escalated from QF-20260912-758 (leo-create-sd.js --from-qf) AFTER its PR #8877 had already merged to main (commit 68512894fbe0) -- the escalation fired on the LOC cap (133 source LOC > 75), not on unmerged/unfinished work. This SD\'s own feat/SD-LEO-FIX-QUICK-FIX-WHOSE-001 branch, cut from origin/main post-merge, already contains the fix by inheritance -- no new commits are expected on this branch.',
  },
  {
    id: 'fix-content-verified',
    severity: 'HIGH',
    summary: 'Confirmed on main: scripts/verify-migration-apply-state.mjs exports resolveLive and a new classifyMigrationFiles(files) convenience function (classifies an explicit file set against the live DB, reusing the existing fold/resolve/classify pipeline, fails open on no credential/unreadable file/unreachable DB). scripts/modules/complete-quick-fix/db-apply-state-gate.js holds the pure decision logic (filterDatabaseFiles, findApplyStateBlockers, describeApplyPath). orchestrator.js wires the gate in right after the merge witness is verified; cli.js carries the new --park-until-applied flag. 10 new unit tests in tests/unit/scripts/complete-quick-fix-db-apply-state-gate.test.js, all passing alongside the 173 pre-existing complete-quick-fix + verify-migration-apply-state tests.',
  },
  {
    id: 'dedup-false-positive-checked',
    severity: 'INFO',
    summary: 'leo-create-sd.js\'s dedup pass flagged SD-MAN-INFRA-TRIAGE-APPLY-UNAPPLIED-001 (status=completed) as a possible duplicate on keyword overlap (migration/apply/database). Read its description directly: it is a one-time triage-and-apply exercise over 96 already-missing tables, not a completion-time GATE MECHANISM in complete-quick-fix.js. Confirmed false positive -- different scope, already completed, no action needed.',
  },
];

const warnings = [
  'No backlog items and no existing-infrastructure semantic-search matches (VALIDATION sub-agent, CONDITIONAL_PASS) -- expected for a QF-escalation SD whose scope is fully defined by the QF\'s own description plus the already-merged diff, not by a backlog entry.',
];

const recommendations = [
  'PLAN should author a PRD narrowly scoped to the already-implemented gate (the exact FRs from the merged diff), with smoke_test_steps naming the real verification commands (the 10 new unit tests; a manual read of orchestrator.js\'s insertion point).',
  'PLAN-TO-EXEC / EXEC-TO-PLAN should verify the existing diff on main against the PRD rather than expecting new implementation -- there is nothing to commit on this SD\'s own branch.',
];

const summary = 'Explore-phase discovery for SD-LEO-FIX-QUICK-FIX-WHOSE-001 confirmed the escalated fix (QF-20260912-758, PR #8877, commit 68512894fbe0) is already on main and matches the SD\'s stated scope exactly: classifyMigrationFiles() in the verifier, the new db-apply-state-gate.js module, and orchestrator.js/cli.js wiring, all backed by 10 passing unit tests. One dedup flag was checked and confirmed a false positive (different scope, already-completed SD).';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'Explore',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence_score: 95,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      artifacts_read: [
        'scripts/verify-migration-apply-state.mjs',
        'scripts/modules/complete-quick-fix/db-apply-state-gate.js',
        'scripts/modules/complete-quick-fix/orchestrator.js',
        'scripts/modules/complete-quick-fix/cli.js',
        'tests/unit/scripts/complete-quick-fix-db-apply-state-gate.test.js',
      ],
      quick_fixes_reviewed: ['QF-20260912-758'],
      prs_reviewed: ['https://github.com/rickfelix/EHG_Engineer/pull/8877'],
    },
    phase: 'LEAD_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'Explore',
    SD_KEY,
    { name: 'Explore' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD_TO_PLAN', source: 'manual' },
  );

  console.log('EXPLORE EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
