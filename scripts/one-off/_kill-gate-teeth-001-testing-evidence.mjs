/**
 * TESTING sub-agent evidence writer — SD-LEO-INFRA-KILL-GATE-TEETH-001, phase PLAN_TO_EXEC.
 * One-off. Records the measured outcome of the ALPHA-leg test verification.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-KILL-GATE-TEETH-001';

async function main() {
  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence_score: 88,
    findings: [
      'UNIT: `npx vitest run tests/unit/eva/kill-gate-teeth/` => 2 files / 16 tests PASSED, 0 failed (vitest 4.1.4, 210ms). Matches the claimed 16/16.',
      'UNIT SUBSTANCE: 36 assertions total (firing-fence.test.js 14 expects across 7 its; firing-verification.test.js 22 expects across 9 its). Test names map 1:1 onto FR-2 and FR-3 acceptance criteria (matched_prediction true/false/null, no-attestation refusal, ApexNiche unconditional refusal, both read-error fail-closed paths, flag_mode passthrough, gate_type=none outside live kill set). Not vacuous.',
      'INTEGRATION: `npx vitest run tests/integration/kill-gate-teeth/` => 1 file / 3 tests SKIPPED, 0 failed. Runner emitted the db-tier guard explicitly: "SKIPPED at runtime -- no designated non-production target (reason: no_designated_target)"; all network refused (DB_TIER_BLOCKED). This is the EXPECTED and correct outcome absent VITEST_DB_ALLOW_REF, not a failure.',
      'FR-3 BINDING CITATION VERIFIED VERBATIM: lib/eva/kill-gate-teeth/firing-fence.js lines 10-12 contain "W3 packet ruling, coordination corr 5c4528b0" co-cited with chairman_decisions rows beca4a47 and d580dac7, plus a do-not-remove instruction. Satisfies FR-3 AC-5 exactly as worded in the PRD.',
      'FR-4 HARDCODE CENSUS (independent, my own grep): searched \\b(3|5|13|24)\\b across all 3 lib files + the migration. 12 hits, ALL inside comments/docblocks (distribution prose, "3 candidates", "BETA\'s 3 armed criteria", section header "3.", spec refs §3.4, and the e.g. [3,5,13,24] JSDoc example). ZERO literals on any executable path. Separate grep for array/IN/includes set-literal shapes found only the JSDoc @returns example. Confirmed no hardcoded kill set.',
      'FR-4 SINGLE READ SITE CONFIRMED: `gate_type = \'kill\'` appears exactly once in this SD\'s code (kill-stage-set.js:34). firing-verification.js imports deriveLiveKillStages rather than re-deriving (lines 28, 142, 209). No second read site introduced.',
      'MIGRATION SQL STRUCTURE: parenthesis balance 0 (min 0, never negative); 1 explicit BEGIN/COMMIT transaction pair (second BEGIN is the DO-block\'s); DO $$ / END $$ paired; AS $$ function body correctly terminated; 21 statements; 2 CREATE TABLE, 1 CREATE OR REPLACE FUNCTION, 1 guarded CREATE ROLE; no trailing-comma-before-paren. All CHECK constraints well-formed. No syntax defect found on careful read.',
      'MIGRATION NOT APPLIED — VERIFIED READ-ONLY: body-returning `select(*).limit(1)` on both kill_gate_sealed_predictions and kill_gate_teeth_proof_records returns PGRST205 (table not found), byte-identical to a known-nonexistent control table. RPC kill_gate_teeth_discharged_predictions returns PGRST202. Confirms the migration has not been applied to the configured target. No object was created by this check.',
      'FR-1 design coherence: the migration rejects RLS-based blindness with a correct stated reason (service_role carries BYPASSRLS, so an RLS-only guard would be a no-op fixture) and uses privilege-based blindness instead (zero grants on base table + EXECUTE-only on a SECURITY DEFINER function with SET search_path hygiene). The GRANT kill_gate_traversal_ro TO postgres, service_role is a membership grant enabling SET ROLE, not a privilege grant on the table — it does not defeat the boundary.',
    ],
    warnings: [
      'FR-1 IS NOT EMPIRICALLY VERIFIED BY THIS RUN. The two-sided blindness test is the ONLY evidence for FR-1 AC-1 (real 42501) and AC-2 (discharged-only RPC filtering), and it executed 0 assertions here (correctly skipped, no designated non-prod target). The 16/16 unit pass covers FR-2/FR-3/FR-4 only. FR-1 currently rests on the author\'s rolled-back-transaction verification during authoring, which left no durable artifact. Before FR-1 can be called proven, this suite must run once against a designated non-prod ref (VITEST_DB_ALLOW_REF) with its output retained. Recommend PLAN treat FR-1 as design-verified, not test-verified, at EXEC entry.',
      'DOC DRIFT in the migration header: line 84 directs the reader to "lib/eva/kill-gate-teeth/firing-verification.js `deriveLiveKillStages()` for the single authorized read site", but that function lives in kill-stage-set.js. The pointer that FR-4 depends on for future-maintainer guidance is misdirected by one file. Cosmetic, but it is exactly the comment meant to stop a future cleanup from widening the kill set — worth a one-line fix.',
      'The integration test always ROLLBACKs ("must leave zero trace regardless of pass/fail/skip"). Correct DB-tier safety, and assertions are made inside the transaction before rollback so the verdict is observed live — but when it does eventually run, the test report is the only surviving evidence it ran. Retain that output rather than re-deriving it later.',
      'Instrument note for future checks on this SD: a Supabase `select(..., { head: true, count: \'exact\' })` returns NO error and count=null on a missing table. My first existence probe used that shape and produced a false "EXISTS" for both tables. Only the body-returning select discriminates. Do not use head-count to prove table existence here.',
      'Pre-existing and out of scope: database/migrations/20260722_DOWN_...sql:56 hardcodes stages IN (3, 5, 13, 23) — note 23, not 24 — against gate_type=\'kill\'. Outside this SD\'s FR-4 census scope (which covers lib/eva/kill-gate-teeth/** and the 20260829 migration), but it is a stale hardcoded kill set in the repo and disagrees with the live set.',
    ],
    recommendations: [
      'Fix migration header line 84 to point at kill-stage-set.js (one-word change, protects FR-4\'s intent).',
      'Schedule one authorized run of tests/integration/kill-gate-teeth/ against a designated non-prod ref before FR-1 is claimed proven; capture the 42501 and the filtered-RPC output as durable evidence.',
      'Do not apply the migration as part of PLAN_TO_EXEC — it is correctly unapplied, and applying it is a separate, explicitly gated step.',
      'Consider a follow-up item for the stale (3,5,13,23) literal in the 20260722_DOWN migration.',
    ],
    summary:
      'PASS with scope caveat. Unit suite 16/16 green with 36 real assertions mapping onto FR-2/FR-3/FR-4 acceptance criteria; integration suite correctly SKIPPED (3 skipped, 0 failed) under the db-tier no-designated-target guard. FR-3\'s binding SC3 citation "W3 packet ruling, coordination corr 5c4528b0" co-citing beca4a47 and d580dac7 is present verbatim in firing-fence.js. Independent grep census confirms zero hardcoded kill-stage literals on any executable path in the 3 lib modules or the migration, and exactly one gate_type=\'kill\' read site. Migration is structurally valid SQL and verified (read-only, body-returning select vs. a control) to be NOT applied to the configured target. Principal caveat: FR-1\'s two-sided privilege-blindness claim is design-verified only — the sole test that would prove it executed zero assertions in this run, so 16/16 must not be read as covering FR-1.',
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'PLAN_TO_EXEC',
      unit_tests: { command: 'npx vitest run tests/unit/eva/kill-gate-teeth/', files: 2, passed: 16, failed: 0, assertions: 36 },
      integration_tests: {
        command: 'npx vitest run tests/integration/kill-gate-teeth/',
        files_skipped: 1,
        tests_skipped: 3,
        failed: 0,
        skip_reason: 'no_designated_target (DB_TIER_BLOCKED, VITEST_DB_ALLOW_REF unset)',
        expected: true,
      },
      fr_coverage: {
        'FR-1': 'DESIGN-VERIFIED ONLY — sole proving test skipped; migration reviewed and coherent',
        'FR-2': 'TEST-VERIFIED — matched true/false/null, RPC-not-base-table, flag_mode, cross-check gating',
        'FR-3': 'TEST-VERIFIED + citation present verbatim (firing-fence.js:10-12)',
        'FR-4': 'TEST-VERIFIED + independent grep census clean, single read site',
        'FR-5': 'NOT IN TESTING SCOPE — read-only stamp assertion, no deliverable script writes roadmap_wave_items',
      },
      migration_status: {
        file: 'database/migrations/20260829_kill_gate_sealed_predictions.sql',
        applied: false,
        evidence: 'PGRST205 on body-returning select for both tables (identical to nonexistent control); PGRST202 on the RPC',
        structural_check: 'paren balance 0, BEGIN/COMMIT paired, DO $$/END $$ paired, function body terminated, 21 statements',
      },
    },
    phase: 'PLAN_TO_EXEC',
  };

  results = applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults('TESTING', SD_KEY, { name: 'TESTING' }, results, {
    sdKey: SD_KEY,
    phase: 'PLAN_TO_EXEC',
    source: 'manual',
  });
  console.log('TESTING EVIDENCE WRITTEN:', stored.id, stored.verdict, stored.confidence);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message, e.stack);
    process.exit(1);
  });
}
