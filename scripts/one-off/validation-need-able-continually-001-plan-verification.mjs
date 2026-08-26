#!/usr/bin/env node
/**
 * VALIDATION sub-agent evidence writer — SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001, PLAN_VERIFICATION
 * phase (post-EXEC, pre-LEAD-FINAL-APPROVAL).
 *
 * Independent re-verification of the delivered CPA-gauge implementation against:
 *   - strategic_directives_v2 row d654f5ff-f6f3-43ee-9d4d-5e8c6bd9284e (live query, not a cached
 *     one-off script) -- description/scope/key_changes/success_criteria/metadata (lead_rescope +
 *     lead_self_correction).
 *   - product_requirements_v2 row PRD-SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001 (live query) --
 *     functional_requirements, technical_requirements, test_scenarios, acceptance_criteria,
 *     integration_operationalization.
 *   - The actual committed diff across commits 766363821538e0 (implementation) and 348877f72cc6
 *     (evidence writers) on feat/SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001: lib/telemetry/cpa-gauge.mjs,
 *     lib/marketing/venture-activation-gate.js, scripts/cpa-gauge-cli.mjs, and their tests.
 *   - lib/marketing/venture-honesty-audit.js and lib/marketing/autonomy-gate.js (both consumers of
 *     venture_demand_verdicts), read in full to check for adverse interaction with the new
 *     rungs.cpa key.
 *   - Live DB probes of venture_demand_verdicts, daily_rollups, venture_consent_events,
 *     marketing_channel_metrics, channel_budgets to confirm which substrates actually exist/are
 *     populated (not trusting PLAN/EXEC's prior "confirmed live" prose without re-running it).
 *   - `npx vitest run` on the three target test files (37/37 pass, independently re-run here, not
 *     assumed from the retrospective TESTING sub-agent's claim).
 * Prior TESTING (prospective 4b88bb44 CONDITIONAL_PASS 85, retrospective c147ce19 PASS 92) and
 * SECURITY (8d29a1e4 PASS 90) evidence rows were read for cross-reference only, AFTER independently
 * forming the findings below from the live SD/PRD rows and the actual code.
 *
 * VERDICT: CONDITIONAL_PASS. The delivered code is correct, honest, well-tested, and matches the
 * FINAL (post-correction) architecture. The conditions are SD/PRD documentation-hygiene gaps, not
 * functional defects -- see FINDINGS below. None require touching lib/telemetry/cpa-gauge.mjs,
 * lib/marketing/venture-activation-gate.js, or scripts/cpa-gauge-cli.mjs.
 */

import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { toCanonicalRepoPath } from '../../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SD_KEY = 'SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001';
const PRD_ID = 'PRD-SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001';
const IMPL_COMMIT_SHA = '766363821538e041e36cc3c29f1be246ac44f897';
const EVIDENCE_COMMIT_SHA = '348877f72cc616c8b26a78149928415bd852fce4';

const FINDINGS = [
  // ---- Independently CONFIRMED holding true ----
  'CONFIRMED — computeCpaGaugeState() (lib/telemetry/cpa-gauge.mjs:31-59) returns a real, '
    + 'non-fabricated SUM(spend_cents)/SUM(conversions) number when conversions > 0 (lines 54-58), '
    + 'and explicitly returns state="no_writer_yet"/value=null when zero daily_rollups rows are '
    + 'supplied (lines 32-38) or (a distinct case, still state="live" but value=null, never 0 or '
    + 'Infinity) when spend>0 with zero conversions (lines 43-51). All three cases pass their unit '
    + 'tests (tests/unit/telemetry/cpa-gauge.test.js TS-1/TS-2/TS-3/TS-7) — re-ran `npx vitest run` '
    + 'on this file plus tests/unit/marketing/venture-activation-gate.test.js and '
    + 'tests/unit/query-cpa-gauge.test.js directly: 37/37 pass.',

  'CONFIRMED — rungs.cpa is additive and non-gating exactly as TR-3 requires. '
    + 'computeActivationVerdict() (venture-activation-gate.js:305-358) computes '
    + 'decideActivationVerdict()/buildPathToPass() from the ORIGINAL 4-rung array BEFORE calling '
    + 'resolveCpaRung() and attaching its result to rungsObject.cpa (lines 339-349), on both the '
    + 'normal path and the venture_telemetry-read-error early-return path (lines 316-331). The '
    + 'existing test suite\'s own source-text-scan (venture-activation-gate.test.js:296-307) pins '
    + 'that decideActivationVerdict/buildPathToPass never reference "cpa" at all. ACTIVATION_RUNGS '
    + '(line 59) and RATIFIED_FLOORS (line 92) are unmodified — confirmed by direct read and by '
    + 'the "never adds cpa to ACTIVATION_RUNGS or RATIFIED_FLOORS" test (line 291-294).',

  'CONFIRMED — zero new migrations/A-B-testing/outreach code. `git diff` for both commits '
    + '(766363821538e0, 348877f72cc6) touches only lib/telemetry/cpa-gauge.mjs (new), '
    + 'lib/marketing/venture-activation-gate.js (additive), scripts/cpa-gauge-cli.mjs (new), 3 test '
    + 'files, and PLAN/LEAD/EXEC evidence one-off scripts under scripts/one-off/ (process artifacts, '
    + 'not app code). No database/migrations/*.sql file is added. Independently re-ran the grep for '
    + 'send/contact/webhook/fetch/http/smtp/twilio/sendgrid/axios/mailto/child_process/exec/eval '
    + 'against the diff — zero matches, matching both the retrospective TESTING and SECURITY rows\' '
    + 'independent findings.',

  'CONFIRMED — no adverse interaction with lib/marketing/autonomy-gate.js: its venture_demand_'
    + 'verdicts read (line 509-516) SELECTs only `verdict, citation, computed_at` — it never reads '
    + '`rungs` at all, so the new rungs.cpa key is completely inert to it.',

  // ---- Gaps found by this independent pass (conditions) ----
  'GAP (condition, non-blocking to runtime) — strategic_directives_v2.success_criteria (5 items, '
    + 'live-queried) was never updated by metadata.lead_self_correction (2026-08-26T00:38:28Z), '
    + 'which corrected description/scope/key_changes to drop the gauge-registry.js integration '
    + 'point but left success_criteria untouched. Criterion 1 still reads "...is registered in '
    + 'gauge-registry.js..." (false: the delivered gauge is a plain module import, exactly as the '
    + 'self-correction itself argues gauge-registry.js is the WRONG home for a venture metric). '
    + 'Criterion 3 describes citing the gauge into "an existing venture_demand_verdicts OR '
    + 'chairman_decisions row" with a "gauge id" concept — no chairman_decisions wiring or gauge-id '
    + 'concept exists anywhere in the delivered code; only the rungs.cpa JSONB key was built. '
    + 'Criterion 4\'s measure field says "PR diff...touches only lib/governance/gauge-registry.js" '
    + '-- the actual (correct) PR deliberately does NOT touch gauge-registry.js, so a literal read '
    + 'of this stale measure would misjudge a correct PR as non-compliant. The PRD\'s own '
    + 'acceptance_criteria (4 items) are internally consistent with the delivered code and are NOT '
    + 'affected -- this finding is scoped to the SD row\'s success_criteria field specifically, '
    + 'which is what a future LEAD-FINAL-APPROVAL read would consult.',

  'GAP (condition, non-blocking) — the SD\'s own (corrected) scope field states the module '
    + '"consumes channel_budgets + daily_rollups + marketing_attribution" via '
    + '"computeCpaGaugeState({ dailyRollupRows, attributionRows, now })" -- but the delivered '
    + 'signature is computeCpaGaugeState({ dailyRollupRows }) only (cpa-gauge.mjs:31): no '
    + 'attributionRows or now parameter, and resolveCpaRung/queryCpaGaugeForChannel query ONLY '
    + 'daily_rollups, never channel_budgets or marketing_attribution. This narrowing is CORRECTLY '
    + 'justified in the PRD\'s own TR-2 rationale (daily_rollups is the only migration-confirmed '
    + 'table carrying spend_cents AND conversions together) and matches what was actually built and '
    + 'tested -- but the SD\'s scope text was never updated to reflect this second, PLAN-phase '
    + 'narrowing, leaving the SD row describing a wider surface than what shipped.',

  'GAP (condition, non-blocking) — PRD FR-1 acceptance criteria, TR-5, TS-1/TS-2/TS-3, and '
    + 'integration_operationalization.data_contracts (live-queried) all document the gauge\'s '
    + 'vocabulary as state: \'no_writer_yet\'|\'live\'|\'stale\'. The delivered cpa-gauge.mjs '
    + 'explicitly and deliberately never returns \'stale\' (module header, lines 8-13: no ratified '
    + 'cadence contract exists for daily_rollups the way DEFAULT_CADENCE_HOURS exists for '
    + 'venture_telemetry, so inventing a staleness heuristic would itself be a fabrication -- sound '
    + 'reasoning). No test in tests/unit/telemetry/cpa-gauge.test.js exercises or documents this '
    + 'narrowing, and the PRD text was never corrected to drop \'stale\' from the documented '
    + 'contract. Harmless functionally (a documented three-state union where only two states are '
    + 'ever actually produced is a safe subset), but the PRD and the code now disagree about the '
    + 'gauge\'s contract.',

  'GAP (self-disclosed, low risk) — PRD FR-3\'s acceptance criterion ("Running the script against a '
    + 'test venture seeded with synthetic daily_rollups rows...prints a real, non-zero CPA number") '
    + 'was not actually executed against a live seeded row. metadata.real_callee_attestation (live-'
    + 'queried) admits this directly for scripts/cpa-gauge-cli.mjs\'s queryCpaGaugeForChannel(): '
    + '"Never run against production with real argv (no synthetic daily_rollups test data has been '
    + 'seeded live...) -- this is a code-review + mocked-unit-test-only verification, not a live-run '
    + 'one." Independently re-confirmed live: daily_rollups and venture_demand_verdicts both return '
    + '0 rows fleet-wide today. The equivalent behavior IS proven by tests/unit/query-cpa-gauge.test.'
    + 'js\'s mocked TS-6 case, and the function is a thin, fully-covered pass-through, so the risk is '
    + 'low -- but FR-3\'s AC-1 as literally worded is unmet.',

  'GAP (overlooked interaction, benign) — lib/marketing/venture-honesty-audit.js (read in full) '
    + 'reads the same venture_demand_verdicts.rungs JSONB (line 57) and builds '
    + 'audit.activation.unmeasurable_rungs via `Object.values(v.rungs).filter(r => r.state === '
    + '"UNMEASURABLE")` (lines 90-92). Because rungs.cpa uses the funnel-gauge vocabulary '
    + '(state: "no_writer_yet"|"live") rather than RUNG_STATE ("MEASURED"|"UNMEASURABLE"), this '
    + 'filter never crashes and never misreports cpa -- it silently excludes it. But this also means '
    + 'the honesty audit, whose entire purpose is surfacing per-rung measurability gaps to the '
    + 'chairman, will NEVER surface a cpa="no_writer_yet" state even when true. The PRD\'s own '
    + 'integration_operationalization.consumers list (live-queried) does not mention '
    + 'venture-honesty-audit.js at all, indicating this interaction was not analyzed during PRD '
    + 'authoring. Not a defect (nothing lies, nothing throws) but a real, unaddressed gap between '
    + 'this SD\'s "honest measurement" intent and one of the two live consumers of the object it '
    + 'writes into.',

  'ASSESSED — scope_reduction_percentage=75 is a fair, non-fabricated characterization. It reflects '
    + '"1 of the 4 originally-proposed deliverables is a genuine gap" (A/B testing, demand-loop '
    + 'decision audit, and outreach-safety were each independently confirmed already-shipped by two '
    + 'separate reviews -- Explore, sub_agent_execution_results 14437c3d, and VALIDATION, row '
    + '26599db9-2234-426a-9607-1d2bb00f0adf, CONDITIONAL_PASS 92 -- via direct file/table reads cited '
    + 'in both rows\' evidence). It is a count-of-items heuristic, not an effort/LOC-weighted metric, '
    + 'and is consistently and transparently used across the SD, Explore, and VALIDATION evidence '
    + 'rather than being asserted without support.',
];

const SUMMARY = 'VALIDATION PLAN_VERIFICATION verdict: CONDITIONAL_PASS. Independently re-verified '
  + 'the delivered CPA-gauge implementation (commits 766363821538e0 + 348877f72cc6) against live-'
  + 'queried strategic_directives_v2 and product_requirements_v2 rows, the actual code, both live '
  + 'consumers of venture_demand_verdicts (autonomy-gate.js, venture-honesty-audit.js), and a live '
  + 'DB probe of the relevant tables -- not the prior sub-agent evidence, which was consulted only '
  + 'for cross-reference after independent findings were formed. The core functional contract holds: '
  + 'computeCpaGaugeState() never fabricates a number (live SUM or explicit no_writer_yet/zero-'
  + 'conversions, all covered by 37/37 passing tests, independently re-run), rungs.cpa is provably '
  + 'additive and never threads into decideActivationVerdict/buildPathToPass, ACTIVATION_RUNGS/'
  + 'RATIFIED_FLOORS are untouched, autonomy-gate.js cannot be affected (it never reads `rungs`), and '
  + 'zero new migrations/A-B-testing/outreach code was introduced. TR-5/TR-6\'s prospective-TESTING-'
  + 'driven fixes (mock extension + assertion narrowing) are correctly and completely reflected in '
  + 'the delivered test file. scope_reduction_percentage=75 is a fair, evidence-backed '
  + 'characterization. Five non-blocking conditions are recorded: (1) strategic_directives_v2.'
  + 'success_criteria was never updated after lead_self_correction reversed the gauge-registry.js '
  + 'decision and now contradicts the SD\'s own corrected description/scope/key_changes and the '
  + 'PRD; (2) the SD\'s corrected scope text still names channel_budgets/marketing_attribution/'
  + 'attributionRows inputs the delivered code never implements (the PRD\'s own TR-2 correctly '
  + 'narrowed to daily_rollups-only, but the SD text was not reconciled); (3) the PRD documents a '
  + "'stale' gauge state the delivered code deliberately never returns, with the PRD never corrected "
  + 'to match; (4) FR-3\'s "prints a real, non-zero CPA number" acceptance criterion was verified '
  + 'only via mocked unit test, never against a live seeded row (self-disclosed in metadata.'
  + 'real_callee_attestation); (5) venture-honesty-audit.js silently omits rungs.cpa from its '
  + 'chairman-facing unmeasurable_rungs report because cpa uses a different state vocabulary than '
  + 'RUNG_STATE -- benign (no crash, no false claim) but unanalyzed at PRD-authoring time. None of '
  + 'the five conditions require any change to the shipped library/CLI code; they are SD/PRD '
  + 'documentation-accuracy fixes, most naturally closed by updating strategic_directives_v2.'
  + 'success_criteria (and optionally .scope) before or as part of LEAD-FINAL-APPROVAL.';

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const supabase = await getSupabaseClient();

  const { data: sd, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, success_criteria, scope_reduction_percentage')
    .eq('sd_key', SD_KEY)
    .maybeSingle();
  if (sdErr || !sd) {
    console.error('SD_READ_FAILED', sdErr?.message || 'not found');
    process.exit(1);
  }

  const { data: prd, error: prdErr } = await supabase
    .from('product_requirements_v2')
    .select('id')
    .eq('id', PRD_ID)
    .maybeSingle();
  if (prdErr) {
    console.error('PRD_READ_FAILED', prdErr.message);
    process.exit(1);
  }

  const results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 88,
    summary: SUMMARY,
    findings: FINDINGS,
    conditions: [
      {
        action: 'Update strategic_directives_v2.success_criteria to match the corrected (post lead_self_correction) architecture: remove the "registered in gauge-registry.js" language from criterion 1, remove or correct the "chairman_decisions row citing the gauge id" mechanism from criterion 3 (no gauge-id concept was built), and fix criterion 4\'s measure field, which currently says the PR diff should touch gauge-registry.js when it correctly does not.',
        priority: 'medium',
        blocking: false,
      },
      {
        action: "Reconcile the SD's scope field (channel_budgets/marketing_attribution/attributionRows) with the PRD's TR-2-narrowed, delivered daily_rollups-only implementation, or explicitly note the narrowing in the SD row the way TR-2's rationale already does in the PRD.",
        priority: 'low',
        blocking: false,
      },
      {
        action: "Correct the PRD's FR-1/TR-5/TS-1-3/data_contracts vocabulary to drop the 'stale' state, matching the delivered cpa-gauge.mjs contract (or, if a future SD later adds 'stale' once a cadence is ratified, leave a forward-reference note rather than an unreconciled three-state union).",
        priority: 'low',
        blocking: false,
      },
      {
        action: "Either run scripts/cpa-gauge-cli.mjs once against a seeded synthetic daily_rollups row to close FR-3's AC-1 literally, or downgrade AC-1's wording to match what was actually verified (mocked unit test only), consistent with metadata.real_callee_attestation's own disclosure.",
        priority: 'low',
        blocking: false,
      },
      {
        action: "Consider whether lib/marketing/venture-honesty-audit.js should surface rungs.cpa's own no_writer_yet/live state to the chairman (a small, additive audit change) -- not required by this SD's scope, but worth a follow-up ticket given the audit's stated purpose.",
        priority: 'low',
        blocking: false,
      },
    ],
    justification: 'CONDITIONAL_PASS rather than PASS because the SD row\'s own success_criteria field is stale and self-contradictory relative to the SD\'s own corrected description/scope/key_changes and the PRD, which is exactly the kind of artifact a future LEAD-FINAL-APPROVAL or audit would consult to judge whether this SD met its bar. The underlying implementation is functionally correct, well-tested (37/37 passing, independently re-run), non-gating, secure, and introduces zero new migrations/A-B-testing/outreach code, matching the PRD\'s own (internally consistent, modulo the stale-state vocabulary) acceptance criteria. All five conditions are documentation/spec-accuracy fixes with zero required code changes.',
    validation_mode: 'retrospective',
    metadata: {
      repo_path: toCanonicalRepoPath(repoRoot),
      executed_from_cwd: process.cwd(),
      recorded_by: 'scripts/one-off/validation-need-able-continually-001-plan-verification.mjs',
      assessment_type: 'independent_plan_verification_validation',
      sd_id: sd.id,
      prd_id: prd?.id ?? PRD_ID,
      commits_verified: [IMPL_COMMIT_SHA, EVIDENCE_COMMIT_SHA],
      sd_success_criteria_item_count_live: Array.isArray(sd.success_criteria) ? sd.success_criteria.length : null,
      scope_reduction_percentage_live: sd.scope_reduction_percentage,
      test_run_result: '37/37 passing (tests/unit/telemetry/cpa-gauge.test.js, tests/unit/marketing/venture-activation-gate.test.js, tests/unit/query-cpa-gauge.test.js) -- independently re-run via `npx vitest run`, not assumed from prior evidence',
      live_db_probe: {
        venture_demand_verdicts: '0 rows (table exists, RLS-readable)',
        daily_rollups: '0 rows (table exists, RLS-readable)',
        venture_consent_events: '0 rows (table exists, RLS-readable)',
        marketing_channel_metrics: 'PGRST205 -- table does not exist live, confirming FR-4\'s finding',
        channel_budgets: '4 rows exist -- NOT read by the delivered gauge, despite being named in the SD\'s (corrected) scope text',
      },
      cross_referenced_prior_evidence: [
        '26599db9-2234-426a-9607-1d2bb00f0adf (VALIDATION, LEAD, CONDITIONAL_PASS 92)',
        '14437c3d-6953-40fd-a0e0-397deab517b5 (Explore, LEAD_TO_PLAN, PASS 93)',
        '4b88bb44-51de-47ad-9321-b78e92a3bfa0 (TESTING, PLAN_TO_EXEC, CONDITIONAL_PASS 85, prospective)',
        'c147ce19-dc45-415b-8a9d-62ce96fa48c3 (TESTING, EXEC_TO_PLAN, PASS 92, retrospective)',
        '8d29a1e4-ae25-4bbe-bbfb-03ce75c7436b (SECURITY, EXEC_TO_PLAN, PASS 90, retrospective)',
      ],
      files_read: [
        'lib/telemetry/cpa-gauge.mjs',
        'lib/marketing/venture-activation-gate.js',
        'scripts/cpa-gauge-cli.mjs',
        'lib/marketing/venture-honesty-audit.js',
        'lib/marketing/autonomy-gate.js (lines ~480-540)',
        'tests/unit/telemetry/cpa-gauge.test.js',
        'tests/unit/marketing/venture-activation-gate.test.js',
        'tests/unit/query-cpa-gauge.test.js',
        'database/migrations/20260809_venture_demand_verdicts.sql (rungs_is_object constraint)',
        'scripts/one-off/lead-rescope-need-able-continually-001.mjs',
        'scripts/one-off/lead-correct-cpa-gauge-placement-need-able-001.mjs',
        'scripts/one-off/insert-prd-need-able-continually-001.mjs',
        'scripts/one-off/plan-fix-prd-testing-findings-need-able-001.mjs',
        'strategic_directives_v2 (live query, sd_key=SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001)',
        'product_requirements_v2 (live query, id=PRD-SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001)',
      ],
    },
  };

  const stored = await storeSubAgentResults('VALIDATION', SD_KEY, null, results, {
    phase: 'PLAN_VERIFICATION',
  });

  // A success return is not persistence -- read the row back.
  const { data, error } = await supabase
    .from('sub_agent_execution_results')
    .select('id,sub_agent_code,phase,verdict,confidence,validation_mode,created_at')
    .eq('id', stored.id)
    .maybeSingle();

  if (error || !data) {
    console.error(`WROTE but could not read back id=${stored?.id}: ${error?.message || 'no row'}`);
    process.exit(1);
  }

  console.log('\nVALIDATION evidence recorded and read back:');
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
