#!/usr/bin/env node
/**
 * TESTING sub-agent evidence for SD-LEO-INFRA-CHRONIC-RED-GUARD-001, PLAN-TO-EXEC phase.
 *
 * A dispatched testing-agent performed a prospective review of the round-1 PRD (no code written
 * yet) and found 6 real problems, most severely an execution-proven contradiction between FR-1
 * and FR-4, a wrong-file diagnosis for FR-1b that would have had EXEC corrupt a working safety
 * mechanism, and a real silent-production-break risk in FR-2's RLS remediation path. Every
 * load-bearing claim was independently re-verified against live source/execution before being
 * accepted (seeder directory-scope bug, chairman-gate markers on 2 of 3 FR-4 migrations, the
 * sentinel's policy-agnostic RLS check, the Monday-not-Sunday cron). The PRD was then revised
 * (round 2) to correct all 6 findings. This evidence row records the FINDINGS as discovered,
 * not a rubber-stamped PASS -- the corrected PRD is what unblocks EXEC, not this row alone.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-CHRONIC-RED-GUARD-001';

const findings = [
  {
    id: 'fr1-fr4-mechanical-contradiction-execution-proven',
    severity: 'CRITICAL',
    summary: "FR-1's prescribed action (re-seed the disposition ledger) would classify 2 of the 3 migrations FR-4 called 'must stay blocking' as DEFERRED (a suppressing disposition), via Rule A's inline @chairman-gated marker match -- confirmed by dry-running scripts/seed-migration-dispositions.mjs against the live gap set (seeded: 2, both DEFERRED via rule A) and by independently reading database/migrations/20260821_worker_wind_down_events.sql:3-14 and .../20260821_purge_killed_venture_scheduler_queue.sql:3-11, both carrying '-- @chairman-gated' with no '@approved-by' line. FR-1 and FR-4 as submitted could not both be satisfied. CORRECTED in round-2 PRD: FR-4 now names only the one genuinely ordinary migration (20260819_eva_scheduler_metrics_created_at_index.sql) and explicitly cross-references FR-1's DEFERRED outcome for the other two as the intended, correct resolution.",
  },
  {
    id: 'fr1b-wrong-file-diagnosis-would-corrupt-working-safety-mechanism',
    severity: 'CRITICAL',
    summary: "FR-1b as submitted instructed EXEC to fix verify-migration-apply-state.mjs's ledger-vs-schema contradiction detection. Independently confirmed via source read that this mechanism is correct and wired (scripts/lib/migration-disposition-ledger.mjs:296-305 contradictoryBasenames(); verify-migration-apply-state.mjs:690,746-748). The real defect is tests/integration/migration-apply-state-ledger-wiring.test.js:89's hardcoded stale fixture basename (20260713_quick_fixes_factory_lane.sql, now APPLIED and no longer a gap) -- confirmed by reproducing the failure directly (npx vitest run ... -t 'an APPLIED ledger entry cannot suppress' fails at :100 because the forged entry targets a basename that isn't in the live gap set). Fixing the TOOL as originally instructed would require it to false-positive on a genuinely-applied migration. CORRECTED in round-2 PRD: FR-1b now targets the test's fixture-selection logic and explicitly states the detection tool must NOT be modified.",
  },
  {
    id: 'fr2-rls-remediation-silent-break-risk-policy-agnostic-guard',
    severity: 'HIGH',
    summary: "The sentinel's RLS check (audit-security-linter.mjs:125) tests ONLY c.relrowsecurity=false -- it never checks for an actual policy. Enabling RLS with zero policies fully satisfies FR-2's original 'strict exits 0' acceptance criterion while producing a silent deny-all for anon/authenticated. Live-verified all 12 candidate tables currently grant anon full SELECT/INSERT/UPDATE/DELETE, and confirmed a REAL live anon-client consumer of north_star (ehg repo's src/hooks/useNorthStar.ts:45, built from a VITE_SUPABASE_ANON_KEY client), whose own error handling silently swallows an RLS denial and renders 'UNSET' with no surfaced error -- exactly the '42501 hides schema'/'guard cannot observe its subject' failure class. CORRECTED in round-2 PRD: FR-2 rescoped to producing a full disposition plan first, remediating only the zero-consumer-verified subset in this SD, explicitly naming north_star and any other live-consumer table as requiring a verified POLICY (not a bare RLS-enable) or deferring to a follow-up SD; new TR-4 makes this a standing technical requirement.",
  },
  {
    id: 'fr2-double-counted-finding',
    severity: 'MEDIUM',
    summary: "FR-2's 'all 15 live findings' figure double-counts claim_rejects, which appears in both the rls_disabled_in_public set (12 tables) and the sensitive_columns_exposed set (1 row) -- confirmed the sensitive-columns check (audit-security-linter.mjs:129-135) is a strict subset of the RLS-disabled check joined on a session_id column, and claim_rejects is the sole sensitive-columns hit. CORRECTED in round-2 PRD: FR-2 now states 14 distinct objects.",
  },
  {
    id: 'fr4-wrong-cron-day',
    severity: 'LOW',
    summary: "FR-4 AC referenced the sentinel's 'next Sunday scheduled run'. The actual cron (.github/workflows/security-linter-sentinel.yml:20) is '0 14 * * 1' = Monday 14:00 UTC. CORRECTED in round-2 PRD: FR-4 now cites Monday and names workflow_dispatch with strict=true as an acceptable earlier verification trigger.",
  },
  {
    id: 'unfalsifiable-escape-hatch-acceptance-criteria',
    severity: 'LOW',
    summary: "FR-1b's original AC#2 ('the fix is either landed, or split into a companion SD with the reason recorded') was satisfiable with zero code change, nullifying AC#1. CORRECTED in round-2 PRD: FR-1b's AC now requires the dynamic-fixture fix directly, with the companion-SD path reserved for the risk register rather than a literal acceptance criterion an EXEC session could satisfy without shipping the fix.",
  },
];

const recommendations = [
  'During EXEC, treat FR-2 as plan-then-remediate: produce the full 14-object disposition table before enabling RLS on any table, and run a real consumer search (grep .from(<table>) across both EHG_Engineer and ehg repos) before any remediate-now entry.',
  'Watch TR-4 closely for north_star specifically -- verify the EHG cockpit dashboard still receives real data (not the silent UNSET fallback) after any policy change.',
  'If FR-2 remediation volume (beyond the zero-consumer subset) proves too large for this PR during EXEC, split into a follow-up SD per the round-2 PRD risk register rather than force-fitting it.',
];

const summary = 'Prospective PLAN-TO-EXEC review of SD-LEO-INFRA-CHRONIC-RED-GUARD-001\'s round-1 PRD (no code written yet). Found 6 real problems: an execution-proven mechanical contradiction between FR-1 and FR-4 (dry-running the seeder confirmed 2 of FR-4\'s 3 \'must stay blocking\' migrations would be DEFERRED by FR-1\'s own prescribed action); a wrong-file diagnosis in FR-1b that would have had EXEC modify a confirmed-correct safety mechanism instead of a stale test fixture; a real silent-production-break risk in FR-2\'s RLS remediation path (the sentinel\'s check is policy-agnostic, and north_star has a confirmed live anon consumer whose error handling would silently swallow the resulting denial); a double-counted finding (claim_rejects, 15 vs the true 14 distinct objects); a wrong cron-day citation (Monday, not Sunday); and an unfalsifiable escape-hatch acceptance criterion. Every load-bearing claim was independently re-verified against live source and live execution (not accepted on the sub-agent\'s word) before the PRD was revised: the seeder\'s directory-scope bug (database/migrations/ only, never database/chairman-gated/) was confirmed by direct source read; the chairman-gate markers on 2 of the 3 FR-4 migrations were confirmed by direct file read; the RLS check\'s policy-agnosticism and the north_star consumer were confirmed by direct source/code read; the Monday cron was confirmed from the workflow YAML. The PRD was revised (round 2) to correct all 6 findings before this evidence was recorded.';

const justification = 'CONDITIONAL_PASS rather than FAIL because every finding was addressed in the same PLAN cycle before EXEC began -- the round-1 PRD would have shipped a real, execution-proven bug (the FR-1/FR-4 contradiction) and a real security regression (RLS-enable-with-no-policy on a table with a live consumer), but the round-2 PRD closes both. CONDITIONAL_PASS rather than unconditional PASS because FR-2\'s actual code-level remediation work (beyond plan production and the zero-consumer subset) remains EXEC\'s job and carries genuine residual risk (TR-4\'s policy-authoring requirement) that this review could verify was correctly SCOPED but not yet verify was correctly EXECUTED, since no code has been written.';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence_score: 92,
    findings,
    recommendations,
    summary,
    justification,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'PLAN_TO_EXEC',
      review_type: 'prospective (no code written yet)',
      verification_commands: [
        'node scripts/sentinels/audit-security-linter.mjs (live finding count/names)',
        'node scripts/seed-migration-dispositions.mjs --gaps=<verifier --json output> (dry-run seeding)',
        "npx vitest run tests/integration/migration-apply-state-ledger-wiring.test.js --project migration-gate -t 'an APPLIED ledger entry cannot suppress' (reproduced the failure)",
        'grep -n "@chairman-gated" database/migrations/20260821_*.sql',
        'grep -n "cron" .github/workflows/security-linter-sentinel.yml',
      ],
      prd_revision: 'round 2 -- all 6 findings addressed before this evidence was recorded',
    },
    phase: 'PLAN_TO_EXEC',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_KEY,
    { name: 'TESTING' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN_TO_EXEC', source: 'manual' },
  );

  console.log('TESTING EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
