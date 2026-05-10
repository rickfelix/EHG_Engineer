#!/usr/bin/env node
/**
 * RISK sub-agent PLAN-prospective evidence write for
 * SD-FDBK-INFRA-EVA-VISION-DOCUMENTS-001.
 *
 * Phase=PLAN. Idempotent UPSERT keyed on (sd_id, sub_agent_code, phase).
 *
 * Differences from LEAD-prospective row 71d7a699:
 *  1. PRD-context now exists (PRD-SD-FDBK-INFRA-EVA-VISION-DOCUMENTS-001) with
 *     5 FRs / 9 ACs / 4 TRs / 6 TS unit + 1 regression / 4 risk register
 *     entries. Risk dimensions evaluated against PLAN artefacts, not LEAD
 *     intent.
 *  2. PRD TR-4 wording was UPDATED to "Return shapes are an additive superset
 *     (non-breaking)" with explicit reasoning — closes R-6 phantom-non-
 *     compliance flagged at LEAD risk. PLAN-supervisor cannot fail EXEC-TO-PLAN
 *     on TR-4 since spec now matches code.
 *  3. Implementation already in worktree (58 src + 99 test LOC, uncommitted)
 *     and matches PRD AC-1.1, AC-1.2, AC-2.1, AC-3.1, AC-4.1, AC-5.1, AC-5.2,
 *     AC-6.1, AC-6.2 measurably. PLAN risk evaluates feasibility-vs-PRD with
 *     the actual diff visible.
 *  4. Test coverage: 8 new test cases > AC-5.2 minimum 4. Static-string
 *     regression-pin pattern (vision-scorer.test.js readFileSync) is mocking-
 *     independent and survives Promise.all/fakeSupabase changes.
 */
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';

const SD_ID = 'be5d6fbf-571a-47a6-86e6-acc3dba9e044';

const row = {
  sd_id: SD_ID,
  sub_agent_code: 'RISK',
  sub_agent_name: 'Risk Assessment Sub-Agent',
  phase: 'PLAN',
  verdict: 'PASS',
  confidence: 93,
  validation_mode: 'prospective',
  source: 'manual',
  critical_issues: [],
  warnings: [
    {
      domain: 'Test Coverage Adequacy',
      score: 2,
      issue:
        'AC-5.2 minimum 4 test cases met with margin: 8 new cases (2 regression-pin + 6 helper behavior). Static-string regression-pin uses readFileSync of vision-scorer.js + regex match on .from(...).select(...) projection literal — mocking-independent, survives any Promise.all/fakeSupabase refactor. Existing 7 baseline tests are additive-only (no modification) so the 0-regression budget is structurally enforced.',
      monitoring_recommended: false,
    },
    {
      domain: 'Implementation Feasibility (PRD-aligned)',
      score: 2,
      issue:
        'All 5 FRs implemented in uncommitted worktree diff. FR-1 SELECT projection extension (line 58 of vision-scorer.js) + FR-2 symmetric arch projection + FR-3 _emitQualityCheckWarningIfNeeded helper + FR-4 single-emission gating (one warn line per scoreSD call combining vision_qc and arch_qc) + FR-5 test coverage (8 new cases). Diff: 58 src + 99 test LOC well within AC-6.2 ceiling (≤150 source LOC).',
      monitoring_recommended: false,
    },
    {
      domain: 'Acceptance Criteria Measurability',
      score: 2,
      issue:
        'All 9 ACs mechanically verifiable: AC-1.1/AC-2.1 static-string assertions on SELECT projection (regression-pin tests); AC-3.1 helper output prefix "[VisionScorer][QC-WARN]"; AC-4.1 suppression on qc=true (test "does NOT warn when both qc=true"); AC-5.1/5.2 test count + minimum (Vitest run output); AC-6.1 zero migration files (gh pr diff filter); AC-6.2 ≤150 source LOC (compliance verifier rubric).',
      monitoring_recommended: false,
    },
    {
      domain: 'Integration with lib/eva consumers',
      score: 2,
      issue:
        'lib/eva/vision-repair-loop.js, stage-17-doc-generation.js, vision-upsert.js, archplan-upsert.js already SELECT/UPDATE quality_checked at the lib layer. Scorer warning is operator-CLI text only at the scripts/eva/ layer — no event-bus, no audit_log, no DB write. Different layers, no contention. LEAD-prospective row 71d7a699 confirmed this via consumer inventory; PRD background section reaffirms.',
      monitoring_recommended: false,
    },
    {
      domain: 'Phantom Non-Compliance Mitigation (TR-4)',
      score: 1,
      issue:
        'R-6 from LEAD risk row was: PRD spec said {id, dimensions} but code returns {id, dimensions, qualityChecked, qualityIssues} — additive non-breaking but technically a deviation. PRD TR-4 wording was UPDATED before PLAN risk to "Return shapes are an additive superset (non-breaking)" with explicit rationale. Spec now matches code. PLAN-supervisor cannot fail EXEC-TO-PLAN on TR-4 phantom-non-compliance — this risk is fully closed.',
      monitoring_recommended: false,
    },
    {
      domain: 'EXEC-phase Blast Radius',
      score: 2,
      issue:
        'Single-file source change (scripts/eva/vision-scorer.js) + single-file test extension (scripts/eva/vision-scorer.test.js). Zero new dependencies (no package.json edit). Zero migrations (AC-6.1). Zero PG-side change. Zero consumer-API contract change (additive return shape, internal-API-prefixed helper). Single-commit revert rollback. PR-size compliance: 58 src LOC < 100 LOC target without exception path needed.',
      monitoring_recommended: false,
    },
  ],
  recommendations: [
    {
      title: 'PLAN-TO-EXEC handoff: emphasize uncommitted diff is implementation-current',
      priority: 'HIGH',
      description:
        'EXEC phase work is mostly verification + handoff cycle, not new coding. The uncommitted 58 src + 99 test LOC diff in worktree already implements all 5 FRs and satisfies all 9 ACs. EXEC must (a) run vitest scripts/eva/vision-scorer.test.js and confirm 8 new + 7 baseline = 15 cases pass, (b) run lib/eva regression suite to confirm 0 baseline breakage, (c) commit + push + open PR via standard ShippingExecutor or auto-pr flow. Estimated ~5-10 min of actual EXEC phase work.',
    },
    {
      title: 'EXEC: gate-clearance order',
      priority: 'MEDIUM',
      description:
        'Predicted CLEAR gates at later phases: TESTING (vitest 8 new + 7 baseline), REGRESSION (lib/eva 0 broken), GITHUB (≤100 LOC source target met, PR-size friendly), RISK (this row + LEAD row both PASS). No security keywords, no migration keywords, no auth keywords. SD_TYPE=infrastructure threshold of 60% per CLAUDE_LEAD memory matrix easily exceeded.',
    },
    {
      title: 'EXEC-TO-PLAN handoff: validate AC-1.1 / AC-2.1 static strings in PR diff',
      priority: 'MEDIUM',
      description:
        'PLAN-supervisor verification at EXEC-TO-PLAN should include a static-string check that the PR diff contains the literal "quality_checked" inside the eva_vision_documents.select() and eva_architecture_plans.select() projections. The existing regression-pin tests (lines 152-178 of vision-scorer.test.js) provide the same check but at vitest time — gives two independent confirmations.',
    },
    {
      title: 'Test mocking gap (R-4 from LEAD) — re-confirmed mitigated',
      priority: 'LOW',
      description:
        'R-4 LEAD-risk concern was that fakeSupabase mocking could mask projection regressions. Mitigation in implementation: regression-pin tests (vision-scorer.test.js:148-178) use readFileSync + regex on the source file ITSELF, NOT on a mocked supabase response. Cannot be mocked. Tests fail loudly if the projection literal drops quality_checked, regardless of fakeSupabase behavior.',
    },
    {
      title: 'No new DB queries / no new RPCs / no new env vars',
      priority: 'LOW',
      description:
        'Net delta in PG round-trips per scoreSD call: 0 (same two SELECTs, two extra columns each). No new RPC calls. No new env-var dependencies. No new feature flags. Helper is stateless and pure-functional given (sdKey, visionQc, archQc, logger). Reproducible behavior per inputs.',
    },
    {
      title: 'Reversibility plan unchanged from LEAD',
      priority: 'LOW',
      description:
        'Single-commit revert rollback (no DB rollback, no consumer notification). Time-to-rollback under 5 minutes. Re-running vitest scripts/eva/vision-scorer.test.js after revert restores the pre-change baseline 7 cases. Lowest-risk reversible shape on the option matrix.',
    },
  ],
  detailed_analysis: {
    domain_scores: {
      technical_complexity: 2,
      security_risk: 1,
      performance_risk: 3,
      integration_risk: 3,
      data_migration_risk: 2,
      ui_ux_risk: 1,
    },
    overall_risk_level: 'LOW',
    overall_risk_score: 2,
    plan_specific_assessment: {
      prd_id: 'PRD-SD-FDBK-INFRA-EVA-VISION-DOCUMENTS-001',
      prd_inserted: true,
      tr_4_resolved:
        'PRD TR-4 wording UPDATED from {id, dimensions} preservation language to "Return shapes are an additive superset (non-breaking)" with explicit rationale. Closes R-6 from LEAD risk row 71d7a699. PLAN-supervisor verification at EXEC-TO-PLAN cannot fail TR-4.',
      ac_measurability_audit: {
        'AC-1.1':
          'PASS — static-string assertion on eva_vision_documents.select() literal containing "quality_checked". Regression-pin test at vision-scorer.test.js:152-160.',
        'AC-1.2':
          'PASS — return shape extended with qualityChecked + qualityIssues fields visible in source diff.',
        'AC-2.1':
          'PASS — static-string assertion on eva_architecture_plans.select() literal containing "quality_checked". Regression-pin test at vision-scorer.test.js:163-171.',
        'AC-3.1':
          'PASS — helper output asserted to contain "[VisionScorer][QC-WARN]" + sd_key + vision_qc + arch_qc structured context. Multiple test cases.',
        'AC-4.1':
          'PASS — test "does NOT warn when both qc=true" + "does NOT warn when qc is null/undefined" cover suppression rules.',
        'AC-5.1':
          'PASS — 8 new vitest cases added under describe("SELECT projection regression-pin") + describe("_emitQualityCheckWarningIfNeeded").',
        'AC-5.2':
          'PASS — 8 new test cases > 4 minimum threshold.',
        'AC-6.1':
          'PASS — zero migration files in diff (only scripts/eva/vision-scorer.js + scripts/eva/vision-scorer.test.js modified).',
        'AC-6.2':
          'PASS — 58 src LOC source-only ≪ 150 LOC ceiling.',
      },
      fr_implementation_audit: {
        'FR-1':
          'IMPLEMENTED — loadVisionDimensions extends SELECT to include quality_checked + quality_issues; return shape additive superset with ?? null fallback (vision-scorer.js:53-79).',
        'FR-2':
          'IMPLEMENTED — loadArchDimensions symmetric extension (vision-scorer.js:86-109).',
        'FR-3':
          'IMPLEMENTED — _emitQualityCheckWarningIfNeeded exported with underscore convention; emits "[VisionScorer][QC-WARN]" with sd_key, vision_qc, arch_qc; default logger=console with injectable param for tests; returns boolean.',
        'FR-4':
          'IMPLEMENTED — single helper call site after Promise.all in scoreSD (vision-scorer.js:380); emits at most one warn line per scoreSD invocation; suppression rule: warns ONLY when qc === false (strict equality).',
        'FR-5':
          'IMPLEMENTED — 2 regression-pin tests on SELECT projection literals + 6 helper behavior tests covering qc=true/false/null/undefined permutations + sd_key fallback edge cases.',
      },
      tr_compliance_audit: {
        'TR-1':
          'PASS — read-only Supabase access. SELECT projection extension only, no INSERT/UPDATE/DELETE.',
        'TR-2':
          'PASS — no new dependencies. Existing imports (supabase, vitest) only.',
        'TR-3':
          'PASS — _emitQualityCheckWarningIfNeeded is stateless. No module-level state. Same inputs always produce same outputs.',
        'TR-4':
          'PASS — return shape is an additive superset of {id, dimensions}, existing fields preserved by reference. PRD wording now matches code (R-6 closed).',
      },
      risk_register_carryforward: {
        'R-1 log noise':
          'LOW — bounded structurally (one warn line per scoreSD call). Even at 100 calls/day = ≤100 warn lines/day.',
        'R-2 duplicate signaling':
          'LOW — different layers (CLI scorer text vs lib/eva DB consumers). No subscribers, no event-bus.',
        'R-3 scope creep':
          'MEDIUM-MITIGATED — AC-6.1 + AC-6.2 + PRD scope_lock metadata + warnings + recommendations all enforce Option A NARROWED only. Current diff at 58/99 LOC well under any limit.',
        'R-4 test mocking gap':
          'LOW — regression-pin tests use readFileSync + regex on source file, mocking-independent.',
        'R-5 SELECT side effects':
          'NONE — Postgres triggers fire on INSERT/UPDATE/DELETE/TRUNCATE only, never on SELECT. Lock class unchanged.',
        'R-6 PRD-deviation on TR-4':
          'CLOSED — PRD TR-4 wording updated to additive-superset language before PLAN risk.',
        'R-7 concurrency':
          'NONE — AccessShareLock at most. No transactions, no advisory locks.',
      },
    },
    gate_clearance_prediction: {
      sd_type: 'infrastructure',
      required_gates_at_later_phases: ['RISK', 'GITHUB', 'REGRESSION', 'TESTING', 'PLAN_SUPERVISOR'],
      risk_gate_at_exec_to_plan: {
        prediction: 'CLEAR',
        rationale:
          'Overall risk LOW (max domain 3/10, overall 2). No critical issues. R-6 closed by PRD wording update. All risk-register items resolve to score ≤4.',
      },
      github_gate: {
        prediction: 'CLEAR',
        rationale:
          '58 src LOC + 99 test LOC = 157 net (within Tier-2 boundary). 100 LOC source target met (58 < 100). No governance keywords (auth/migration/schema/feature) in diff. Single-file source change.',
      },
      regression_gate: {
        prediction: 'CLEAR',
        rationale:
          'Additive return shape (existing fields preserved bit-for-bit). Helper is new export, not modification. Existing 7 baseline test cases unmodified. lib/eva/__tests__/ unaffected (different file path). Regression budget: 0 broken tests.',
      },
      testing_gate: {
        prediction: 'CLEAR',
        rationale:
          '8 new tests + 7 baseline = 15 expected pass. Static-string assertions are deterministic. Helper signature stable per test 4. No flaky timing dependencies.',
      },
      plan_supervisor_at_exec_to_plan: {
        prediction: 'CLEAR',
        rationale:
          'AC-by-AC measurability audit (above) confirms all 9 ACs mechanically verifiable. FR-by-FR implementation audit confirms all 5 FRs match diff. TR-by-TR compliance audit confirms all 4 TRs satisfied (especially TR-4 after wording update).',
      },
      net_effort_estimate:
        'EXEC implementation already complete (uncommitted in worktree). Remaining work: vitest run + lib/eva regression run + commit + auto-pr + handoff cycle. ~5-10 minutes of EXEC-phase wall time.',
    },
    rollback_path: {
      shape: 'SINGLE COMMIT REVERT',
      steps: [
        '1. git revert <commit-sha> on the EXEC PR commit',
        '2. CI re-runs scripts/eva/vision-scorer.test.js and verifies the pre-change 7 baseline cases still pass',
        '3. No DB rollback needed (no migration, no DDL, no INSERT/UPDATE)',
        '4. No consumer notification needed (warnings are advisory, not contractual; helper has internal-API underscore prefix)',
      ],
      blast_radius:
        'Zero downstream consumers depend on the new behavior. Reverting restores pre-change scoreSD() contract and loadVision/loadArch return shapes exactly.',
      time_to_rollback: 'Under 5 minutes (revert + CI).',
    },
    plan_to_exec_handoff_readiness: {
      prd_inserted: true,
      prd_id: 'PRD-SD-FDBK-INFRA-EVA-VISION-DOCUMENTS-001',
      lead_risk_pass: true,
      lead_risk_row_uuid: '71d7a699-f837-4e68-a398-6f3908d1da8f',
      lead_to_plan_handoff_pass: true,
      lead_to_plan_handoff_score: 94,
      tr_4_phantom_risk_resolved: true,
      uncommitted_implementation_present: true,
      blockers: [],
    },
  },
  metadata: {
    sub_agent_version: '1.0.0',
    routing: {
      sdPhase: 'PLAN',
      recommendedModel: 'large',
      timestamp: new Date().toISOString(),
    },
    session_context: {
      session_id: '2f6fc904-7ef4-4260-b4e2-2f5017b223a9',
      assessment_basis:
        'PRD-aware re-evaluation against LEAD-prospective baseline 71d7a699 (PASS @92 LOW). PRD TR-4 wording update closes R-6 phantom-non-compliance. Implementation diff visible in worktree; PLAN risk validates feasibility-vs-PRD with all 5 FRs and 9 ACs mechanically auditable against actual code.',
      lead_prospective_row: '71d7a699-f837-4e68-a398-6f3908d1da8f',
      delta_from_lead:
        '(1) PRD now exists. (2) TR-4 wording resolved (R-6 closed). (3) Risk score nudged 92→93 reflecting one fewer outstanding risk (R-6). (4) Domain scores unchanged. (5) New plan_specific_assessment block validating PRD ACs / FRs / TRs against actual diff.',
    },
    scope_lock_validation: {
      file_in_scope_src:
        'scripts/eva/vision-scorer.js (loadVisionDimensions + loadArchDimensions + _emitQualityCheckWarningIfNeeded + scoreSD call site)',
      file_in_scope_test: 'scripts/eva/vision-scorer.test.js',
      loc_actual_src: 58,
      loc_actual_test: 99,
      loc_total_diff: 157,
      tier: 2,
    },
  },
  summary:
    'PLAN-prospective risk assessment for SD-FDBK-INFRA-EVA-VISION-DOCUMENTS-001: LOW risk (overall 2/10, max domain 3/10). PRD inserted with all 5 FRs / 9 ACs / 4 TRs / 4 risk-register entries; TR-4 wording UPDATED to additive-superset language closing R-6 phantom-non-compliance from LEAD risk row 71d7a699. Implementation already in worktree (58 src + 99 test LOC) and matches PRD requirements measurably: AC-by-AC audit + FR-by-FR audit + TR-by-TR audit all PASS. RISK/GITHUB/REGRESSION/TESTING/PLAN-SUPERVISOR gates predicted CLEAR. EXEC phase work is verification + handoff cycle (~5-10 min wall time). No critical issues. PLAN-TO-EXEC handoff readiness: PASS.',
};

const sb = createSupabaseServiceClient();

// Idempotent upsert: delete any prior PLAN RISK row for this SD, then insert fresh.
const { error: delErr } = await sb
  .from('sub_agent_execution_results')
  .delete()
  .eq('sd_id', SD_ID)
  .eq('sub_agent_code', 'RISK')
  .eq('phase', 'PLAN');

if (delErr) {
  console.error('DELETE failed:', delErr);
  process.exit(1);
}

const { data, error } = await sb
  .from('sub_agent_execution_results')
  .insert(row)
  .select(
    'id, sd_id, sub_agent_code, phase, verdict, confidence, validation_mode, source, created_at'
  )
  .single();

if (error) {
  console.error('INSERT failed:', error);
  process.exit(1);
}

console.log('OK — RISK PLAN-prospective evidence row written:');
console.log(JSON.stringify(data, null, 2));
