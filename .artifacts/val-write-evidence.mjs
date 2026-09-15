import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv'; dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD = 'SD-LEARN-FIX-ADDRESS-PAT-LES-015';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence_score: 88,
  execution_time_ms: 0,
  summary: 'LEAD-phase validation of SD-LEARN-FIX-ADDRESS-PAT-LES-015. SD scope CONFIRMED correct (systemic, not a one-off backfill). Planned GATE_REGISTRY_AUDIT mechanism EMPIRICALLY VERIFIED to construct and enumerate without throwing, but its "unaudited = no registry row" premise is INVERTED and must be narrowed before EXEC: it yields 85 of 93 gates (91%) as warnings for this SD. Recommended narrowing yields 8. Two independent latent defects found in the registry itself.',
  findings: {
    claim_1_fail_open_semantics: {
      status: 'CONFIRMED',
      how: 'Read scripts/modules/handoff/gate-policy-resolver.js in full (250 lines).',
      evidence: 'Header comment line 12 "No match -> gate included by default (fail-open)"; applyGatePolicies lines 213-216 else-branch pushes the gate when resolveGatePolicy returns null; only applicability===DISABLED (line 205) causes a skip via continue.',
      nuance_not_in_plan: 'REQUIRED, OPTIONAL and OPTIONAL_OVERRIDE are all behaviourally IDENTICAL to having no row at all -- the resolver only ever acts on DISABLED. 59 of 113 live rows (23 REQUIRED + 32 OPTIONAL + 4 OPTIONAL_OVERRIDE) therefore have ZERO effect on gate selection. This materially weakens the value of auditing for row PRESENCE rather than for DISABLED-ness.'
    },
    claim_2_historical_row_exists: {
      status: 'CONFIRMED',
      how: 'SELECT * FROM validation_gate_registry via service-role client.',
      evidence: 'Row id=46d341c4-8131-489d-a900-59f27078c60d gate_key=GATE6_BRANCH_ENFORCEMENT sd_type=infrastructure applicability=DISABLED created_at=2026-02-19T03:44:17Z, reason cites cmd.exe/MSYS2 spawn ENOENT plus worktree isolation. Two sibling rows exist for sd_type=feature and sd_type=bugfix.',
      conclusion: 'SD is CORRECTLY scoped as a durable/systemic fix, NOT a registry backfill. Confirmed.'
    },
    claim_3_getrequiredgates_shapes: {
      status: 'CONFIRMED_ALL_FOUR',
      lead_to_plan: 'sync getRequiredGates(sd, _options) at index.js:103',
      plan_to_exec: 'ASYNC getRequiredGates(sd, options) at index.js:122',
      exec_to_plan: 'ASYNC getRequiredGates(sd, _options) at index.js:224',
      plan_to_lead: 'sync getRequiredGates(sd, options) at index.js:243',
      lead_final_approval: 'plain exported function getRequiredGates(supabase, prdRepo, sd=null) at lead-final-approval/gates.js:2102',
      note: 'All async-ness claims in the plan are accurate.'
    },
    claim_4_gate_census_precedent: {
      status: 'CONFIRMED_BUT_A_STRONGER_PRECEDENT_EXISTS',
      gate_census: 'buildGateCensus() at lead-final-approval/gate-census.js:83 does call getRequiredGates(supabase, prdRepo, sd) purely to read g.name/g.required, with no validator invocation. Precedent is real.',
      stronger_precedent_the_plan_missed: 'HandoffOrchestrator.precheckHandoff() (HandoffOrchestrator.js:514-560) and HandoffOrchestrator.dryRunHandoff() (698-790) ALREADY perform the exact operation the plan proposes: _getExecutor(type) -> await executor.getRequiredGates(sd, options) -> applyGatePolicies(supabase, gates, {sdType, validationProfile, sdId}). dryRunHandoff additionally builds a per-gate MANIFEST that already tags each gate source=registry vs source=executor and carries policyReason -- which IS the audited/unaudited discriminator the new gate wants to compute.',
      duplicate_detection_verdict: 'Do NOT hand-roll executor construction. Reuse _getExecutor() and the dryRunHandoff manifest step. Estimated saving 3-5 hours and removes the entire dependency-bag risk class.'
    },
    risk_4_executor_construction: {
      status: 'EMPIRICALLY_TESTED_NO_THROW_BUT_REAL_HAZARD_IDENTIFIED',
      test_performed: 'Constructed PlanToExec, ExecToPlan, PlanToLead with new Cls({supabase}) only (no prdRepo/sdRepo/validationOrchestrator/contentBuilder) and awaited getRequiredGates(realSD, {}); plus called lead-final-approval getRequiredGates(supabase, null, realSD).',
      result: 'ALL FOUR SUCCEEDED: plan-to-exec 27 gates, exec-to-plan 33, plan-to-lead 23, lead-final-approval 26. 93 distinct gate names. No synchronous throw. BaseExecutor constructor (lines 63-68) only assigns dependencies, never validates them.',
      hazard_found: 'plan-to-exec/index.js:133 and plan-to-lead/index.js:245 both call this.determineTargetRepository(sd) AT LIST-CONSTRUCTION TIME (not inside a gate closure), and BaseExecutor.determineTargetRepository (line 1583) dereferences sd.target_application WITHOUT optional chaining. In my first run with an undefined SD BOTH phases threw TypeError: Cannot read properties of undefined (reading target_application). plan-to-exec also runs await this._loadValidators() (dynamic import side effect) at line 124.',
      implication: 'The per-phase try/catch in the plan DOES absorb this correctly. But two consequences must be designed for: (a) a silently-caught phase yields an INCOMPLETE gate list, so the audit would under-report unaudited gates while still printing a confident-looking warning block -- the catch must record which phases failed and say so in the output; (b) the gate list is SD-STATE-DEPENDENT (branches on sd.metadata.parent_orchestrator, sd.parent_sd_id, target_application, venture-leaf status), so a list computed at LEAD time can legitimately differ from what actually runs at PLAN/EXEC once those fields change. This is an inherent approximation and must be stated in the warning text, not hidden.'
    },
    finding_signal_to_noise_BLOCKING_DESIGN_ISSUE: {
      severity: 'HIGH',
      measured: 'For this very SD (sd_type=infrastructure): 93 distinct downstream gates; only 10 registry rows match sd_type=infrastructure with validation_profile NULL; therefore 85 of 93 gates (91%) would be reported as unaudited on EVERY LEAD-TO-PLAN handoff.',
      why_the_premise_is_inverted: 'validation_gate_registry is by design a SPARSE EXCEPTION LIST (113 rows / 34 distinct gate_keys covering 19 sd_types). Absence of a row is the CORRECT, INTENDED default for the overwhelming majority of gate x sd_type pairs. Full coverage would require roughly 93 gates x 19 sd_types = ~1,767 rows. Treating absence as a gap to review makes the warning list unreadable, and an 85-line advisory block on every handoff will be ignored within one sprint -- the exact "too weak to surface anything useful" failure mode named in the review request.',
      recommended_narrowing: 'Report only gates that are DISABLED for at least one OTHER sd_type but have no row for THIS sd_type, intersected with this SD actual downstream gate set. MEASURED OUTPUT FOR THIS SD: 8 entries -- GATE5_GIT_COMMIT_ENFORCEMENT (disabled for feature), GATE_ARCHITECTURE_VERIFICATION (uat/documentation/docs/process/orchestrator), GATE_CONTRACT_COMPLIANCE (bugfix), GATE_INTEGRATION_SECTION_VALIDATION (fix/bugfix), GATE_MIGRATION_DATA_VERIFICATION (documentation/orchestrator/uat), GATE_PLANNING_COMPLETENESS (quick_fix/uat/ux_debt), GATE_PRD_EXISTS (uat), HEAL_BEFORE_COMPLETE (bugfix).',
      why_this_encodes_the_original_defect: 'The originating pattern was GATE6_BRANCH_ENFORCEMENT needing an infrastructure exemption. Its direct sibling GATE5_GIT_COMMIT_ENFORCEMENT is disabled for feature but has NO infrastructure row and IS in this SD downstream gate set -- the narrowed audit surfaces exactly that near-miss class, at reviewable volume.'
    },
    finding_registry_lock_never_applied: {
      severity: 'HIGH',
      independent_of_this_sd_scope: true,
      what: 'database/migrations/20260428_validation_gate_registry_lock.sql (SD-LEO-INFRA-PHANTOM-COMPLETION-PROOF-001 FR-3/US-003) was NEVER APPLIED, and is dead by construction even if it were.',
      evidence: 'Live pg catalog: SELECT proname FROM pg_proc WHERE proname=validation_gate_registry_lock_trigger returns ZERO rows. The only trigger on the table is trg_gate_registry_updated_at. Additionally the migration body references NEW.gate_name, OLD.enabled, NEW.enabled and NEW.metadata, but information_schema.columns shows the live table has only id, gate_key, sd_type, validation_profile, applicability, reason, created_at, updated_at -- no gate_name, no enabled, no metadata column exists. Finally its two protected gate_keys (PR_MERGE_VERIFICATION, SHIP_REVIEW_FINDINGS_PROOF) have ZERO rows in the registry.',
      impact: 'The advertised protection against silent disabling of phantom-completion gates does not exist at any layer. This is a printed-discriminator-is-not-an-enforced-gate instance sitting inside the very table this SD is about.',
      routing: 'Report to LEAD. Do NOT silently fold into this SD -- it is a separate defect and expanding scope here would breach this SD own OUT OF SCOPE clause on refactoring unrelated code paths.'
    },
    finding_dead_all_sd_type_rows: {
      severity: 'MEDIUM',
      what: 'Two registry rows use sd_type=all (FR_DELIVERY_VERIFICATION and DECOMPOSITION_CHECK, both REQUIRED, citing CONST-012 / CONST-014).',
      why_dead: 'resolveGatePolicy matches sd_type by EXACT string equality (p.sd_type === sdType, line 122) and the profile-only branch requires !p.sd_type (line 136). The literal string all matches neither, so these rows can never resolve for any SD.',
      currently_harmless_but_a_trap: 'Both are REQUIRED, which is behaviourally identical to no row, so there is no live impact today. But the authoring convention is a live trap: anyone writing sd_type=all with applicability=DISABLED would get a row that silently does nothing. A registry audit is the natural home for detecting this.'
    },
    finding_scoring_side_effect: {
      severity: 'MEDIUM',
      what: 'The plan passed:true always gate WILL move the LEAD-TO-PLAN score, which brushes against this SD declared OUT OF SCOPE clause on changing gate thresholds or scoring algorithms.',
      evidence: 'ValidationOrchestrator.js:470-480 -- every gate contributes: results.totalScore += gateResult.score; totalMaxScore += maxScore; gateCount++; and weightedScoreSum += gatePercentage * (gate.weight || 1.0). required:false only exempts a gate from BLOCKING (line 488 gate.required !== false), NOT from scoring. An always-100/100 gate therefore raises normalizedScore and makes the threshold marginally easier to clear.',
      correction: 'Declare the gate with weight: 0 AND required: false so it contributes nothing to the weighted average and can never block. Confirm against the threshold comparator (normalizedScore) in review.'
    },
    finding_gate_result_schema: {
      severity: 'LOW',
      what: 'Return { passed: true, score, maxScore } exactly. GATE_RESULT_SCHEMA.required = [passed, score, maxScore] (validation/gate-result-schema.js:13-14); a missing passed field defaults to false and the gate reads as FAILED.',
      observed_drift: 'The nearest advisory precedent, lead-to-plan/gates/placeholder-content.js:253-261, returns { pass, score, max_score } -- snake_case max_score and pass rather than passed. Do NOT copy that shape verbatim.'
    },
    enumeration_completeness_caveat: {
      what: 'My enumeration covered only the 4 downstream phases, matching the plan. That is incomplete for a correct audit.',
      evidence: '15 registry gate_keys matched NO enumerated gate name, including GATE_VISION_SCORE and GATE1_DESIGN_DATABASE (both LEAD-TO-PLAN gates -- see lead-to-plan/gates/vision-score.js), the orchestrator_completion-profile set (GATE_WIRE_CHECK, GATE_AUTOMATED_UAT, ACCEPTANCE_CRITERIA_TRACE, GATE_INTEGRATION_SMOKE_TEST, UAT_GATE, SMOKE_TEST_GATE) and the DB-rule namespace (1:prdQualityValidation, 2A:uiComponentsImplemented, 2B:migrationsCreatedAndExecuted, 2C:databaseQueriesIntegrated).',
      correction: 'The audit must (a) include LEAD-TO-PLAN own gate list, (b) merge buildGatesFromRules (leo_validation_rules) as precheck/execute/dryRun all do, and (c) account for validation_profile-scoped rows rather than only profile IS NULL. Otherwise it will emit false unaudited/orphan entries.'
    }
  },
  recommendations: [
    'PROCEED to PLAN, with the design corrections below applied as PRD requirements. Do not proceed with the warning set as currently specified.',
    'CORRECTION 1 (blocking): invert the premise. Do not warn on absence of a registry row (85/93 = noise). Warn on gates DISABLED for another sd_type but undecided for this one (measured 8/93 for this SD).',
    'CORRECTION 2 (blocking): reuse HandoffOrchestrator._getExecutor() and the dryRunHandoff manifest (source=registry|executor, policyReason) instead of hand-constructing executors with {supabase}. The machinery already exists and is already registry-aware.',
    'CORRECTION 3: declare the gate weight: 0 and required: false so it cannot move normalizedScore (SD out-of-scope protection).',
    'CORRECTION 4: include LEAD-TO-PLAN gates and buildGatesFromRules DB rules in the enumeration, and handle validation_profile-scoped rows; otherwise false positives.',
    'CORRECTION 5: when a phase try/catch fires, name the failed phase in the output. A silently-truncated gate list that still prints a confident warning block is worse than no audit.',
    'CORRECTION 6: state in the warning text that the list is computed from the SD LEAD-time state and can drift as metadata/parent/target_application change.',
    'ROUTE SEPARATELY to LEAD: the 20260428 registry lock migration is unapplied AND schema-mismatched AND protects gate_keys absent from the registry. Distinct defect; out of this SD scope.',
    'Non-blocking advisory gate is the RIGHT enforcement level -- a blocking gate here would fail 91% of SDs under the current premise and is explicitly out of scope.'
  ],
  metadata: {
    phase: 'LEAD',
    handoff_type: 'LEAD-TO-PLAN',
    sd_key: SD,
    sd_type: 'infrastructure',
    validation_method: 'independent file reads + live DB reads (supabase + direct pg catalog) + executable enumeration harness',
    files_read: [
      'scripts/modules/handoff/gate-policy-resolver.js',
      'scripts/modules/handoff/HandoffOrchestrator.js (precheckHandoff 500-600, dryRunHandoff 698-790, _getExecutor 940)',
      'scripts/modules/handoff/executors/BaseExecutor.js (constructor 63-68, determineTargetRepository 1583)',
      'scripts/modules/handoff/executors/lead-to-plan/index.js (103-140)',
      'scripts/modules/handoff/executors/plan-to-exec/index.js (118-175)',
      'scripts/modules/handoff/executors/plan-to-lead/index.js (240-275)',
      'scripts/modules/handoff/executors/exec-to-plan/index.js (224)',
      'scripts/modules/handoff/executors/lead-final-approval/gates.js (2102)',
      'scripts/modules/handoff/executors/lead-final-approval/gate-census.js',
      'scripts/modules/handoff/executors/lead-to-plan/gates/placeholder-content.js (250-290)',
      'scripts/modules/handoff/validation/gate-result-schema.js',
      'scripts/modules/handoff/validation/ValidationOrchestrator.js (450-495)',
      'database/migrations/20260428_validation_gate_registry_lock.sql'
    ],
    measurements: {
      registry_rows_total: 113,
      registry_distinct_gate_keys: 34,
      registry_by_applicability: { DISABLED: 54, REQUIRED: 23, OPTIONAL: 32, OPTIONAL_OVERRIDE: 4 },
      gates_plan_to_exec: 27,
      gates_exec_to_plan: 33,
      gates_plan_to_lead: 23,
      gates_lead_final_approval: 26,
      distinct_downstream_gate_names: 93,
      registry_rows_for_infrastructure_profile_null: 10,
      unaudited_under_planned_premise: 85,
      unaudited_under_recommended_narrowing: 8,
      orphan_registry_gate_keys: 15,
      dead_sd_type_all_rows: 2
    },
    gates_assessed: {
      GATE1_lead_preapproval: 'CONDITIONAL_PASS -- no duplicate feature, but dryRunHandoff manifest is substantially overlapping infrastructure that must be reused rather than reimplemented.',
      scope_boundary_check: 'PASS -- advisory-only gate respects OUT OF SCOPE (no threshold/scoring algorithm change, no modification of already-passed SDs), provided the weight:0 correction is applied.'
    }
  }
};

const resolution = await resolveSubAgentRepo({
  sdId: SD,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'VALIDATION',
  supabase,
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('VALIDATION', SD, { name: 'Principal Systems Analyst' }, results, { sdKey: SD });
console.log('\nSTORED_RESULT:', JSON.stringify(stored, null, 2).slice(0, 1500));
