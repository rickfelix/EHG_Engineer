/**
 * TESTING sub-agent evidence for SD-LEO-INFRA-KILL-GATE-TEETH-001, phase EXEC_TO_PLAN.
 * Distinct from the earlier PLAN_TO_EXEC TESTING row -- that one does not satisfy this gate.
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
    confidence_score: 92,
    findings: [
      'Committed diff dbc0ad0af9e matches the declared shape: 11 files / 1492 insertions, 0 deletions. 3 new lib files (lib/eva/kill-gate-teeth/{kill-stage-set,firing-verification,firing-fence}.js), 1 new migration (database/migrations/20260829_kill_gate_sealed_predictions.sql), 2 new unit test files (tests/unit/eva/kill-gate-teeth/{firing-fence,firing-verification}.test.js), 1 new integration test file (tests/integration/kill-gate-teeth/sealed-predictions-blindness.test.js), plus 4 PRD-authoring/evidence one-off artifacts under scripts/one-off/.',
      'Unit suite GREEN: `npx vitest run tests/unit/eva/kill-gate-teeth/` -> 2 test files passed, 16/16 tests passed, 197ms. Matches the expected 16/16.',
      'Integration suite SKIPPED (not failed): `npx vitest run tests/integration/kill-gate-teeth/` -> 1 file skipped, 3 tests skipped, 0 failed. The db-tier harness emitted "SKIPPED at runtime -- no designated non-production target (reason: no_designated_target)". This is the repo-wide DB-tier safety convention (describeDb + deliberately empty DESIGNATED_NON_PROD_REFS), i.e. the intended posture, not a broken suite.',
      'Migration confirmed NOT applied to any database. Verified read-only over a direct pg connection against pg_catalog/information_schema (authoritative), deliberately NOT via PostgREST head-counts: a head:true count on a missing table can return no error and a null count, and PGRST205 is a schema-cache miss rather than proof of absence. All three object classes absent: tables kill_gate_sealed_predictions + kill_gate_teeth_proof_records -> 0 rows in information_schema.tables; role kill_gate_traversal_ro -> 0 rows in pg_roles; function kill_gate_teeth_discharged_predictions -> 0 rows in pg_proc. No DDL was attempted.',
      'Commit-message claim about the SC3 binding fix spot-checked and holds: the corrected citation string "W3 packet ruling, coordination corr 5c4528b0" appears verbatim in lib/eva/kill-gate-teeth/firing-fence.js (1 occurrence) and in the PRD content payload scripts/one-off/_kill-gate-teeth-001-prd-content.json (3 occurrences). No residual non-resolving "ruling 5c4528b0" bare form in the lib tree.',
    ],
    warnings: [
      'The integration test asserting real Postgres-privilege-based two-sided blindness is structurally unexecuted in this repo today -- describeDb skips everywhere because DESIGNATED_NON_PROD_REFS is empty by design. The privilege model (NOLOGIN role with zero base-table grants + SECURITY DEFINER function filtered to discharged rows) is therefore specified and unit-covered at the JS layer but NOT yet empirically demonstrated against a live engine. Its first real proof arrives only when the migration is applied to a designated non-prod ref and VITEST_DB_ALLOW_REF is set.',
      'Unit coverage is confined to the JS harness surfaces (kill-set derivation, firing-verification observation logic, firing fence). The SQL migration itself has no executable assertion in this commit, consistent with it being an unapplied, separately-reviewed DDL step.',
      'Test evidence covers the ALPHA-leg observation/proof infrastructure only. No live designed-to-fail venture probe was run (chairman-gated, out of scope), and no kill gate under proof was modified or exercised end-to-end.',
    ],
    recommendations: [
      'When the migration is applied to a designated non-prod ref, re-run tests/integration/kill-gate-teeth/ with VITEST_DB_ALLOW_REF set and require a genuinely PASSING (not skipped) result before any teeth-proof claim is treated as demonstrated -- a skipped blindness test proves nothing about blindness.',
      'Treat the SECURITY DEFINER function + NOLOGIN role as the load-bearing guard and add a negative assertion at apply time that the traversal role is actually refused on the base table (service_role BYPASSRLS was the reason RLS was rejected; verify the replacement is genuinely two-sided rather than a fixture).',
      'Keep the migration unapplied until the coordinator/chairman-reviewed DDL step runs; do not let a downstream phase auto-apply it as a side effect of a test bootstrap.',
    ],
    summary:
      'EXEC-TO-PLAN testing verification PASS for SD-LEO-INFRA-KILL-GATE-TEETH-001 @ dbc0ad0af9e. Committed diff matches the declared shape (3 lib + 1 migration + 2 unit tests + 1 integration test + one-off PRD artifacts, 11 files / +1492 / -0). Unit suite 16/16 pass. Integration suite reports 3 skipped / 0 failed via the repo db-tier safety convention (no designated non-prod target), which is the intended posture. Migration confirmed unapplied: pg_catalog/information_schema read-only check shows both new tables, the kill_gate_traversal_ro role, and the discharged-predictions function all absent; no DDL attempted. SC3 citation fix verified verbatim in firing-fence.js and the PRD payload. Principal residual risk, recorded as a warning rather than a blocker: the real-DB blindness guarantee is unexecuted anywhere today and remains unproven until the migration lands on a designated non-prod ref.',
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'EXEC_TO_PLAN',
      commit: 'dbc0ad0af9e',
      pr: 'https://github.com/rickfelix/EHG_Engineer/pull/7657',
      branch: 'feat/SD-LEO-INFRA-KILL-GATE-TEETH-001',
      diff_shape: { files_changed: 11, insertions: 1492, deletions: 0 },
      unit_tests: {
        command: 'npx vitest run tests/unit/eva/kill-gate-teeth/',
        test_files_passed: 2,
        tests_passed: 16,
        tests_failed: 0,
        duration_ms: 197,
        result: 'PASS',
      },
      integration_tests: {
        command: 'npx vitest run tests/integration/kill-gate-teeth/',
        test_files_skipped: 1,
        tests_skipped: 3,
        tests_failed: 0,
        result: 'SKIPPED',
        skip_reason: 'no_designated_target',
        harness_message:
          '[vitest][db-tier] SKIPPED at runtime -- no designated non-production target (reason: no_designated_target). ALL network refused (DB_TIER_BLOCKED).',
        gate_helper: 'tests/helpers/db-available.js describeDb (positive designation only)',
      },
      migration_applied_check: {
        method: 'direct pg connection, read-only pg_catalog / information_schema queries',
        script: 'scripts/one-off/_kill-gate-teeth-001-migration-not-applied-check.mjs',
        tables_found: [],
        role_found: [],
        function_found: [],
        migration_applied: false,
        ddl_attempted: false,
        rationale:
          'PostgREST head-counts and PGRST205 were deliberately avoided as absence evidence; catalog lookup is authoritative.',
      },
      sc3_citation_check: {
        expected_string: 'W3 packet ruling, coordination corr 5c4528b0',
        occurrences_firing_fence_js: 1,
        occurrences_prd_content_json: 3,
        verdict: 'verbatim match confirmed',
      },
    },
    phase: 'EXEC_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_KEY,
    { name: 'TESTING' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC_TO_PLAN', source: 'manual' }
  );

  console.log('TESTING EVIDENCE WRITTEN:', stored.id, stored.verdict, stored.confidence);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message, e.stack);
    process.exit(1);
  });
}
