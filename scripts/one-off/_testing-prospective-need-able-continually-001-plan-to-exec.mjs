#!/usr/bin/env node
/**
 * TESTING sub-agent PROSPECTIVE evidence writer — SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001,
 * PLAN-TO-EXEC gate, run BEFORE EXEC writes any code (validation_mode='prospective').
 *
 * Adapted from scripts/one-off/_testing-write-result-sd-leo-infra-claim-surface-sync-002-plan-to-exec.mjs
 * (the sanctioned recent pattern): same storeSubAgentResults() call, same metadata.repo_path /
 * executed_from_cwd contract required by v_sub_agent_repo_compliance, same read-back-after-write
 * (a success return is not persistence).
 *
 * Scope of this review: PRD-SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001's 5 FRs / 6 test_scenarios,
 * read directly from product_requirements_v2, verified against the REAL current source of
 * lib/telemetry/funnel-gauge.mjs, lib/marketing/venture-activation-gate.js (+ its existing test
 * suite), database/migrations/20260214_marketing_engine_foundation.sql, and a live DB probe of
 * daily_rollups / marketing_channel_metrics / venture_demand_verdicts row counts.
 */

import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { toCanonicalRepoPath } from '../../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SD_KEY = 'SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001';
const PRD_ID = 'PRD-SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001';

const FINDINGS = [
  'STRUCTURAL GAP (highest priority) — TS-4\'s "byte-identical" regression proof will not run as-is against the REAL existing suite. tests/unit/marketing/venture-activation-gate.test.js:44-53 fakeSupabase().from(table) recognizes only \'venture_telemetry\' and \'ops_payment_events\'; any third table throws `unexpected table ${table}` at line 51. The FR-2 wiring necessarily calls supabase.from(\'daily_rollups\') inside computeActivationVerdict(), so ALL THREE existing computeActivationVerdict()-based tests (the \'FR-6: Image Alt Text Generator\' describe block, lines 172-210) will hit that throw the moment the wiring change lands. EXEC must add a \'daily_rollups\' branch to fakeSupabase() before those tests can even execute, not just before TS-4 can prove non-gating — this is an unstated prerequisite edit to an EXISTING test file, not covered by any of TS-1..TS-6.',

  'STRUCTURAL GAP #2, deeper than #1 and NOT caught by fixing the mock alone — even once fakeSupabase() has a daily_rollups branch (or TR-4\'s required try/catch swallows the mock\'s throw into rungs.cpa), the EXISTING assertion at tests/unit/marketing/venture-activation-gate.test.js:182-185 (`for (const r of Object.values(out.rungs)) { expect(r.state).toBe(RUNG_STATE.UNMEASURABLE); expect(r.value).toBeNull(); }`) iterates GENERICALLY over every key in out.rungs. The PRD\'s own data_contracts section (rungs.cpa shape) specifies cpa uses the funnel-gauge.mjs vocabulary — state: no_writer_yet|live|stale and a `value_cents_per_conversion` field — which is a DIFFERENT vocabulary than the RUNG_STATE.MEASURED/UNMEASURABLE + `value` shape venture-activation-gate.js:85-105 (unmeasurable()/measured() helpers) uses for visitors/signups/activated/paid. Adding rungs.cpa with that shape makes this exact existing assertion FAIL: r.state (\'no_writer_yet\') !== RUNG_STATE.UNMEASURABLE (\'UNMEASURABLE\'), and r.value is undefined (the cpa shape has no `value` key at all), so `expect(r.value).toBeNull()` also fails. TS-4 as PLAN wrote it ("verdict/citation/path_to_pass byte-identical... rungs now additionally contains a cpa key") does not surface that this SPECIFIC pre-existing generic-loop assertion needs to be updated to exclude or special-case the cpa key — a literal reading of TS-4 would let this regression ship.',

  'ARCHITECTURAL GAP, untested by TS-1..TS-6 — TR-2 defines CPA as "grouped by venture_id + platform," but the real computeActivationVerdict() signature (lib/marketing/venture-activation-gate.js:267, `{ supabase, ventureId, floors, now }`) has NO platform parameter; it is venture-scoped only. Neither the PRD nor any test scenario states whether the FR-2 wiring (a) sums daily_rollups across ALL platforms for the venture into one combined rungs.cpa, or (b) requires picking/iterating one platform per rung, or (c) needs a new platform-scoping decision entirely. This is the concrete form of the "venture with data on ONE platform but not another" case the review was asked to check for: the PRD is silent on multi-platform aggregation semantics for a venture whose daily_rollups rows span more than one platform, and no TS pins the answer.',

  'TEST-COVERAGE GAP — none of TS-1..TS-6 forces a genuine multi-row SUM. TS-1\'s given ("daily_rollups rows for venture X/platform Y summing to spend_cents=10000, conversions=20") is satisfiable by a SINGLE row with those exact field values; an implementation that reads rows[0].spend_cents / rows[0].conversions directly (never actually summing an array) would pass TS-1, TS-2, and TS-3 as literally specified. No scenario supplies 2+ daily_rollups rows across different rollup_date values (e.g. {spend:3000,conv:5}+{spend:4000,conv:8}+{spend:3000,conv:7} => 10000/20) to prove SUM(spend_cents)/SUM(conversions) is computed across the array rather than read from one row — TR-2\'s aggregation is the load-bearing part of FR-1 and it is currently untested by the drafted scenarios.',

  'DATA-AVAILABILITY GAP for FR-3/TS-6 as literally worded — live DB probe (2026-08-25) confirms daily_rollups has ZERO rows fleet-wide (`select(...,{count:\'exact\',head:true})` => count 0) and venture_demand_verdicts also has ZERO rows. FR-3\'s AC-1 ("Running the script for a venture/platform with live spend+conversion data prints a real, non-zero CPA number") and TS-6 ("the FR-3 script run against a venture/platform with live daily_rollups data") cannot be demonstrated against genuinely live fleet data today — EXEC will need to seed a synthetic daily_rollups row (as the SD\'s own smoke_test_steps step 1 already anticipates: "Seed daily_rollups + marketing_attribution rows...") to satisfy this AC, and the PR description should say so explicitly rather than implying the check ran against pre-existing live data.',

  'CONFIRMED, NOT A GAP — FR-4\'s premise about marketing_channel_metrics is accurate: a live probe (`supabase.from(\'marketing_channel_metrics\').select(\'id\').limit(1)`) returns PGRST205 "Could not find the table \'public.marketing_channel_metrics\' in the schema cache" — the table does not exist live, confirming lib/marketing/dashboard.js:120 reads a table with no confirmed migration and daily_rollups (database/migrations/20260214_marketing_engine_foundation.sql:128) is correctly identified as the only migration-confirmed spend+conversions substrate.',

  'STALE SD-LEVEL ARTIFACT — strategic_directives_v2.smoke_test_steps for this SD (authored before the LEAD self-correction in scripts/one-off/lead-correct-cpa-gauge-placement-need-able-001.mjs) still says step 1 seeds "daily_rollups + marketing_attribution rows" and step 4 expects "the wired decision-audit surface... cites the new gauge id/value in its rationale or evidence field." Both are now inconsistent with the finalized PRD: TR-2 computes CPA from daily_rollups ALONE (marketing_attribution has no spend column per TR-2\'s own rationale), and TR-3 requires decideActivationVerdict() — the function that produces the `citation`/rationale string — to be BYTE-UNCHANGED, so rungs.cpa can never appear inside that citation text. EXEC running the SD-level smoke_test_steps literally (per implementation_approach Phase 4, "run the SD-level smoke_test_steps") would look for evidence in the wrong field. This drift should be corrected or explicitly annotated before Phase 4, not discovered mid-EXEC.',

  'FR-5 VERIFICATION MECHANISM CONFIRMED, MANUAL NOT CI-ENFORCED — repo-wide grep for outreach-capable/outbound-capable check scripts returns no existing lint/CI rule (unlike, e.g., scripts/lint/require-main-guard-in-one-off-lint.mjs for a different concern). FR-5\'s AC-3 ("grep for new outbound/send/contact-capable function definitions in the diff returns zero matches") is mechanically executable as a one-line command against `git diff` scoped to this SD\'s touched files, but there is no repo mechanism that runs it automatically — it is manual evidence the PR description must paste, the same pattern FR-4 already uses for its own live-schema check. This is a workable, testable design, not a gap, but EXEC should not assume any CI gate enforces it.',

  'POSITIVE — both target test files already exist and EXEC should EXTEND them, not create fresh: tests/unit/marketing/venture-activation-gate.test.js (228 lines, covers resolveTelemetryRungs/resolvePaidRung/decideActivationVerdict/computeActivationVerdict with a chainable+thenable fakeSupabase double) is the correct home for TS-4 and TS-5. tests/unit/telemetry/funnel-gauge.test.js (144 lines) establishes the no_writer_yet/live/stale unit-test idiom cpa-gauge.mjs\'s own new test file should mirror; the PRD\'s own implementation_approach Phase 2 already correctly names that new file as tests/unit/telemetry/cpa-gauge.test.mjs (NEW — no existing file at that path today, confirmed).',

  'POSITIVE — a concrete, working precedent exists for TS-6\'s CLI-script testability concern: scripts/venture-telemetry-pull.mjs exports its pure logic (isContractCompatible, buildOkRow, validateKpis, pullVenture, persistResult, main) and tests/unit/venture-telemetry-pull.test.js unit-tests each by direct import — it does NOT spawn the CLI as a subprocess. scripts/query-cpa-gauge.mjs should follow the same export-and-guard shape (main() exported, only invoked under an isMainModule()-style check) so TS-6 can be pinned the same way, without requiring an end-to-end process spawn or live data.',
];

const RECOMMENDED_CASES = [
  'Before authoring any new test: add a \'daily_rollups\' branch to tests/unit/marketing/venture-activation-gate.test.js:44-53 fakeSupabase() (chainable .select/.eq/.gte/.lte + thenable, matching the existing paymentBuilder() shape) — required for the 3 pre-existing computeActivationVerdict() tests to keep running at all once FR-2 lands.',
  'Update tests/unit/marketing/venture-activation-gate.test.js:182-185\'s generic `for (const r of Object.values(out.rungs))` loop to explicitly exclude (or special-case) the cpa key before asserting RUNG_STATE.UNMEASURABLE + null value uniformly — otherwise this pre-existing assertion breaks the moment rungs.cpa is added, regardless of how TS-4\'s new assertions are written.',
  'TS-4, strengthened: snapshot computeActivationVerdict()\'s FULL return value (not just verdict/citation/path_to_pass) for the 3 existing fixtures BEFORE the FR-2 change, then assert deep-equality on every pre-existing key AFTER the change (excluding the new rungs.cpa key) — a field-by-field diff is a stronger non-gating proof than three top-level string checks.',
  'New: a genuine multi-row SUM test for computeCpaGaugeState() — 3+ daily_rollups-shaped rows across distinct rollup_date values summing to a known spend/conversions total, asserting the returned value_cents_per_conversion reflects the SUM, not any single row\'s fields. TS-1 as drafted does not force this.',
  'New/clarifying: a test (or an explicit PRD/TR-2 amendment) pinning the multi-platform-per-venture behavior — either "computeActivationVerdict sums daily_rollups across ALL platforms for the rungs.cpa venture-level figure" or "rungs.cpa is scoped to a single designated platform," with a case where platform A has rows and platform B does not, asserting the chosen semantics rather than leaving it to whichever behavior EXEC happens to implement.',
  'TS-5 (upstream failure): assert not just that rungs.cpa becomes {state:\'no_writer_yet\', reason:...} but that reason contains the ORIGINAL thrown error message verbatim (mirroring the existing pattern at venture-activation-gate.js:160 resolvePaidRung\'s query-error branch, `per-venture payment probe failed: ${error.message}`), so a substitute/generic message does not silently pass the test.',
  'TS-6: structure scripts/query-cpa-gauge.mjs like scripts/venture-telemetry-pull.mjs — export the argument-parsing + output-formatting logic as named functions, gate `main()` invocation behind an isMainModule() check — and unit-test those exports directly (mirroring tests/unit/venture-telemetry-pull.test.js), rather than requiring a live daily_rollups row or a subprocess spawn.',
  'FR-3 smoke evidence: since daily_rollups has zero live rows fleet-wide today, EXEC\'s PR description should explicitly document seeding one synthetic row (venture_id + platform + spend_cents + conversions) to produce the "real, non-zero CPA number" FR-3\'s AC-1 requires, rather than implying it ran against pre-existing live data.',
  'Before Phase 4, reconcile or annotate strategic_directives_v2.smoke_test_steps for this SD against the finalized TR-2 (daily_rollups only, not +marketing_attribution) and TR-3 (citation field byte-unchanged, so cpa never appears in it) — running the stored steps literally would check the wrong field for the wrong substrate.',
  'FR-5 evidence: paste the actual `git diff` + grep command and its (expected-empty) output into the PR description, the same evidence-in-PR-description pattern already required for FR-4 — no CI rule currently enforces this automatically.',
];

const SUMMARY = [
  'PLAN-TO-EXEC prospective testability assessment: CONDITIONAL_PASS. The PRD\'s core approach (a pure, no-I/O computeCpaGaugeState() mirroring funnel-gauge.mjs\'s computeGaugeState() idiom, wired as a non-gating additive rungs.cpa key that never touches ACTIVATION_RUNGS/RATIFIED_FLOORS/decideActivationVerdict) is sound and matches the real current code exactly as PLAN described it — no FR misrepresents the actual source.',
  'However, TS-4 as drafted ("byte-identical verdict/citation/path_to_pass, plus a cpa key") is INCOMPLETE against the REAL existing test file: tests/unit/marketing/venture-activation-gate.test.js\'s fakeSupabase() double (lines 44-53) throws on any unrecognized table, and its FR-6 describe block (lines 172-210) contains a generic loop over ALL rungs values (lines 182-185) that asserts a MEASURED/UNMEASURABLE vocabulary the cpa rung deliberately does NOT use (no_writer_yet/live/stale + value_cents_per_conversion, per the PRD\'s own data_contracts section). Both the mock and that specific pre-existing assertion need explicit updates BEFORE the FR-2 wiring change can even run green, not merely before TS-4 "proves" non-gating.',
  'A live DB probe surfaced two additional, fixable prospective gaps: daily_rollups and venture_demand_verdicts both have ZERO rows fleet-wide today (FR-3/TS-6\'s "live data" scenario needs a seeded synthetic row), and the SD-level smoke_test_steps (pre-dating LEAD\'s self-correction) references a since-abandoned marketing_attribution substrate and a citation-field mechanism TR-3 explicitly forbids — both should be reconciled before Phase 4. marketing_channel_metrics was independently confirmed absent live (PGRST205), which supports rather than undermines FR-4\'s premise.',
  'None of these findings block the approach; all are concrete, fixable-in-EXEC gaps a prospective review exists to catch before code is written. Test files to EXTEND rather than create: tests/unit/marketing/venture-activation-gate.test.js (TS-4, TS-5) and, for CLI testability precedent, the export-and-guard pattern in scripts/venture-telemetry-pull.mjs + tests/unit/venture-telemetry-pull.test.js (TS-6). tests/unit/telemetry/cpa-gauge.test.mjs is correctly identified by the PRD itself as a NEW file (confirmed: no existing file at that path).',
].join(' ');

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const supabase = await getSupabaseClient();

  const { data: prd, error: prdErr } = await supabase
    .from('product_requirements_v2')
    .select('id, functional_requirements, test_scenarios')
    .eq('id', PRD_ID)
    .maybeSingle();
  if (prdErr || !prd) {
    console.error('PRD_READ_FAILED', prdErr?.message || 'not found');
    process.exit(1);
  }

  const results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 85,
    summary: SUMMARY,
    findings: FINDINGS,
    recommendations: RECOMMENDED_CASES,
    validation_mode: 'prospective',
    metadata: {
      repo_path: toCanonicalRepoPath(repoRoot),
      executed_from_cwd: process.cwd(),
      recorded_by: 'scripts/one-off/_testing-prospective-need-able-continually-001-plan-to-exec.mjs',
      assessment_type: 'read_only_pre_implementation_testability',
      prd_id: PRD_ID,
      prd_fr_count: prd.functional_requirements?.length ?? null,
      prd_ts_count: prd.test_scenarios?.length ?? null,
      files_read: [
        'lib/telemetry/funnel-gauge.mjs',
        'lib/marketing/venture-activation-gate.js',
        'tests/unit/marketing/venture-activation-gate.test.js',
        'tests/unit/telemetry/funnel-gauge.test.js',
        'database/migrations/20260214_marketing_engine_foundation.sql',
        'database/migrations/20260809_venture_demand_verdicts.sql',
        'lib/marketing/dashboard.js',
        'scripts/venture-telemetry-pull.mjs',
        'tests/unit/venture-telemetry-pull.test.js',
      ],
      live_db_probes: {
        daily_rollups_row_count: 0,
        venture_demand_verdicts_row_count: 0,
        marketing_channel_metrics_exists_live: false,
        marketing_channel_metrics_probe_error: "PGRST205 Could not find the table 'public.marketing_channel_metrics' in the schema cache",
        probed_at: new Date().toISOString(),
      },
      fr_accuracy: { 'FR-1': 'confirmed', 'FR-2': 'confirmed_with_gap', 'FR-3': 'confirmed_with_gap', 'FR-4': 'confirmed', 'FR-5': 'confirmed_manual_not_ci' },
      ts_gaps: {
        'TS-1': 'does not force genuine multi-row SUM aggregation',
        'TS-4': 'incomplete against real fakeSupabase() mock and the existing generic rungs-iteration assertion',
        'TS-6': 'assumes live daily_rollups data that does not currently exist fleet-wide',
      },
      test_files_to_extend: [
        'tests/unit/marketing/venture-activation-gate.test.js',
      ],
      test_files_new_confirmed_absent: [
        'tests/unit/telemetry/cpa-gauge.test.mjs',
      ],
      integration_test_required: false,
    },
  };

  const stored = await storeSubAgentResults('TESTING', SD_KEY, null, results, {
    phase: 'PLAN_TO_EXEC',
  });

  // A success return is not persistence — read the row back.
  const { data, error } = await supabase
    .from('sub_agent_execution_results')
    .select('id,sub_agent_code,phase,verdict,confidence,validation_mode,created_at')
    .eq('id', stored.id)
    .maybeSingle();

  if (error || !data) {
    console.error(`WROTE but could not read back id=${stored?.id}: ${error?.message || 'no row'}`);
    process.exit(1);
  }

  console.log('\nTESTING prospective evidence recorded and read back:');
  console.log(`  id              ${data.id}`);
  console.log(`  code            ${data.sub_agent_code}`);
  console.log(`  phase           ${data.phase}`);
  console.log(`  verdict         ${data.verdict}`);
  console.log(`  confidence      ${data.confidence}`);
  console.log(`  validation_mode ${data.validation_mode}`);
  console.log(`  created_at      ${data.created_at}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
