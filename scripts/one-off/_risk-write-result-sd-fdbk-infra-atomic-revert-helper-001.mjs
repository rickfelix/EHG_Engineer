#!/usr/bin/env node
/**
 * One-off: persist LEAD-phase risk-agent verdict for SD-FDBK-INFRA-ATOMIC-REVERT-HELPER-001
 *
 * Writes a single row to sub_agent_execution_results so the LEAD-TO-PLAN handoff
 * gate (SUBAGENT_EVIDENCE_MISSING) can locate fresh risk evidence for this SD/phase.
 *
 * Schema (live, verified 2026-05-10 via _inspect-sub-agent-results-schema.mjs):
 *   id, sd_id, sub_agent_code, sub_agent_name, source, phase, verdict, confidence,
 *   summary, justification, conditions, critical_issues[], warnings[], recommendations[],
 *   metadata jsonb, detailed_analysis jsonb, retro_contribution jsonb, raw_output,
 *   execution_time, invocation_id, risk_assessment_id, validation_mode,
 *   created_at, updated_at
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_ID = '5de33889-820f-4758-a96f-363f17908e97';
const SD_KEY = 'SD-FDBK-INFRA-ATOMIC-REVERT-HELPER-001';
const PHASE = 'LEAD';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

// Findings grounded in code-read evidence (see evidence_paths below)
const risks = [
  {
    id: 'R-1',
    severity: 'HIGH',
    description:
      'BEFORE UPDATE trigger on strategic_directives_v2 — the most-written table in the DB. Twelve+ triggers already attached (validate_sd_completeness_trigger, enforce_progress_trigger, trg_doctrine_constraint_sd, trg_enforce_parent_orchestrator_type, trg_inherit_contracts_on_insert/update, enforce_sd_phase_prerequisites, trg_check_contract_requirements, trg_auto_complete_parent_orchestrator, trg_enforce_child_creation_timing, tr_check_intensity_required, validate_child_sd_phase). Cumulative per-update latency compounds, and a thrown EXCEPTION in this new trigger blocks the entire UPDATE transaction (including non-completion field writes that happen to be in the same UPDATE).',
    mitigation:
      'STRICT predicate scope: fire ONLY when NEW.status=completed AND OLD.status<>completed AND (TG_OP=UPDATE). Use IF/RETURN NEW early-exit at function top to make trigger near-free for the 99% of UPDATEs that do not touch status. Rollback plan: DROP TRIGGER IF EXISTS trg_validate_sd_completion ON strategic_directives_v2; precedent established in temp_bypass_completion_validation.sql (ALTER TABLE ... DISABLE TRIGGER). Add EXCEPTION WHEN OTHERS THEN RAISE WARNING ... RETURN NEW only if the SD has metadata.allow_completion_validation_bypass=true (NEVER catch-all suppress, which would defeat the trigger).',
  },
  {
    id: 'R-2',
    severity: 'HIGH',
    description:
      'Predicate-design landmine: the LEAD-FINAL-APPROVAL row in sd_phase_handoffs does NOT yet exist when the SD status UPDATE fires. Per lead-final-approval/index.js:328-339, the executor pre-inserts into leo_handoff_executions BEFORE the SD UPDATE specifically because HandoffRecorder runs AFTER executeSpecific (chicken-and-egg comment in source). A trigger that queries sd_phase_handoffs WHERE handoff_type=LEAD-FINAL-APPROVAL AND status=accepted will REJECT 100% of legitimate completions. Independently, three writer paths legitimately flip status=completed: (a) LeadFinalApprovalExecutor.executeSpecific, (b) reconcileSDStateAfterHandoff drift-fix, (c) complete_orchestrator_sd() PL/pgSQL function which inserts PLAN-TO-LEAD (not LEAD-FINAL-APPROVAL) before the UPDATE. handoff.js --bypass-validation --bypass-reason path is a 4th case: it produces audit-log rows in validation_audit_log but the bypass-completed SD still needs status=completed without a matching accepted handoff. EMERGENCY_PUSH is the 5th.',
    mitigation:
      'Predicate MUST query leo_handoff_executions (not sd_phase_handoffs) since that table is pre-inserted before the UPDATE. Predicate MUST accept handoff_type IN (LEAD-FINAL-APPROVAL, PLAN-TO-LEAD) — the latter is how orchestrator-auto-complete signs off. Add explicit alternate predicates: (1) EXISTS accepted leo_handoff_executions row for this SD with one of those types, OR (2) NEW.metadata->>bypass_reason IS NOT NULL, OR (3) NEW.governance_metadata->>emergency_push = true, OR (4) created_by IN (ORCHESTRATOR_AUTO_COMPLETE, SYSTEM_MIGRATION, ADMIN_OVERRIDE) — mirror the v_allowed_creators allowlist already established in enforce_handoff_system() (20251204_handoff_enforcement_trigger.sql). PLAN phase MUST RCA the witness SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A to determine which writer path produced the ghost — that finding constrains FR-2 design.',
  },
  {
    id: 'R-3',
    severity: 'HIGH',
    description:
      'Potential redundancy / overlap with existing enforce_progress_on_completion() trigger function (20251207_sd_type_validation_profiles.sql:403-446) which already uses the predicate "NEW.status=completed AND OLD.status<>completed" and validates via calculate_sd_progress() against sd_type_validation_profiles. If the ghost-completed witness slipped past THAT trigger, FR-2 must explain HOW (was the trigger DISABLEd? did a direct SQL UPDATE bypass it? did a SECURITY DEFINER function bypass RLS-aware triggers?). Without this RCA, FR-2 may add a duplicate trigger that the same gap can defeat. Shipping a second trigger that overlaps in predicate AND failure mode would be writer-consumer asymmetry on the validation layer itself.',
    mitigation:
      'PLAN-phase REQUIRED RCA: query pg_event_trigger, pg_trigger WHERE tgrelid=strategic_directives_v2::regclass, and audit_log for the witness SD timeline. If enforce_progress_on_completion was disabled by temp_bypass_completion_validation.sql-style migration, document the policy gap separately. FR-2 design choice: either (a) AUGMENT enforce_progress_on_completion (single trigger, multi-predicate body) or (b) add ORTHOGONAL trg_validate_sd_completion that checks accepted-handoff existence specifically (not progress percentage). Option (b) is cleaner if the existing function is widely-mocked in tests; option (a) avoids per-row trigger overhead. Recommend option (b) with the predicate isolation guarantees in R-2 mitigation.',
  },
  {
    id: 'R-4',
    severity: 'MEDIUM',
    description:
      'Backfill / audit path. FR-4 audit-ghost-completed-sds.mjs must bulk-revert existing ghost SDs (witness + however many others exist). If trigger fires on every UPDATE of an already-completed row, the audit script cannot revert (status stays completed, attempting status=completed UPDATE would be a no-op but any other field update would fail because revertSD writes reverted_at + status=in_progress). Conversely, the helper writing status=reverted/in_progress on an already-completed row must not trip the new trigger.',
    mitigation:
      'Trigger predicate "NEW.status=completed AND OLD.status<>completed" already handles this: revert UPDATEs flow NEW.status<>completed → trigger short-circuits. Re-updates of already-completed SDs (e.g., metadata patches by post-completion hooks) flow OLD.status=completed → trigger short-circuits. FR-4 should also write metadata.revert_reason and metadata.reverted_from_status into the SAME UPDATE that flips status, with idempotency guard (metadata.reverted_at IS NULL gate).',
  },
  {
    id: 'R-5',
    severity: 'MEDIUM',
    description:
      'revertSD() atomicity claim under transaction reality. PostgREST UPDATE is single-statement-atomic, but the FR-1 helper claim of "atomic single-call update" may give consumers a false sense of cross-table atomicity. If revertSD also needs to update sd_phase_handoffs status (e.g., reverse the accepted LEAD-FINAL-APPROVAL handoff), that would require either an RPC-based BEGIN/COMMIT transaction or a sequence of independent calls. Failure between calls leaves split state worse than the current ghost-completed state.',
    mitigation:
      'FR-1 scope clarification: revertSD does NOT modify sd_phase_handoffs (keep the audit trail intact — that is the whole point of being able to detect ghost-completions). Document this explicitly in revert.js JSDoc. If business logic later requires handoff revert too, wrap in a SECURITY DEFINER PL/pgSQL function in a follow-up SD. Single-table single-UPDATE-call is genuinely atomic at the PostgREST API layer; the helper should fail-loud on PostgrestError (per the SD scope notes "fail-loud").',
  },
  {
    id: 'R-6',
    severity: 'MEDIUM',
    description:
      'Phantom-non-compliance / self-validating-ship recursion. When THIS SD reaches its own LEAD-FINAL-APPROVAL, the new trigger will be live in the migration (FR-2 ships in the same PR). If LeadFinalApprovalExecutor pre-inserts into leo_handoff_executions BEFORE the SD UPDATE (per code-read line 328-339), the trigger should pass. But if any race / timing edge causes the pre-insert to fail-soft (current code logs warning and continues, line 351), the SD UPDATE will then be REJECTED BY ITS OWN TRIGGER. This is the same self-validating-ship class that has hit 4+ times in recent SDs (per memory note 0a06a05a witness lineage).',
    mitigation:
      'EXEC phase: confirm pre-insert into leo_handoff_executions is fail-LOUD (not fail-soft) for the LEAD-FINAL-APPROVAL handoff_type — if pre-insert fails, executor must abort BEFORE the SD UPDATE. PLAN-phase PRD must list the pre-insert error path as TR (Test Requirement). Test cases in FR-5 MUST include: (1) SD with no accepted LEAD-FINAL handoff → UPDATE rejected with named exception, (2) SD with valid pre-inserted leo_handoff_executions row → UPDATE accepted, (3) SD with metadata.bypass_reason set → UPDATE accepted (mirrors --bypass-validation path), (4) SD with governance_metadata.emergency_push=true → UPDATE accepted (mirrors EMERGENCY_PUSH), (5) re-update of already-completed SD → trigger short-circuits via OLD.status<>completed predicate.',
  },
  {
    id: 'R-7',
    severity: 'LOW',
    description:
      'STATUS_INCONSISTENT badge (FR-3) renders in sd:next output. If badge-generation logic crashes (e.g., reading sd.metadata?.reverted_at on a row without metadata), it can break the entire sd:next render, which is a high-leverage user-facing command. Memory note QF-20260509-818 documented sd:next as carrying its own writer/consumer asymmetry already.',
    mitigation:
      'FR-3 implementation MUST wrap badge derivation in try/catch with default empty string. Add a static-pin regression test that simulates metadata=null, metadata={}, metadata.reverted_at=null, and metadata.reverted_at="2026-05-10T...". Place the inconsistency check in a defensive helper (e.g., getStatusBadge(sd)) called from lib/sd-next/status-helpers.js so the rest of the render is insulated from a thrown error.',
  },
  {
    id: 'R-8',
    severity: 'LOW',
    description:
      'Migration application order. FR-2 trigger migration may need to be applied AFTER any pending child migrations (per memory note SD-LEO-INFRA-WORKTREE-CLEANUP-WINDOWS-001 documented sandbox restrictions on migration application). If the PR ships migration + code together and migration application is deferred or fails, the code (revertSD helper) will operate against a DB without the validation layer, creating a window where new ghost-completions could occur.',
    mitigation:
      'Either (a) include a module-load-time assertion in lib/sd/revert.js that the trg_validate_sd_completion trigger exists (query pg_trigger), failing with a clear error if migration not applied, OR (b) make FR-1 helper a no-op fallback if the trigger is absent (revertSD still works, but ghost-prevention is degraded). Precedent (a): SD-LEO-INFRA-WORKTREE-CLEANUP-WINDOWS-001 module-load assertion pattern.',
  },
];

const evidence_paths = [
  'scripts/modules/handoff/executors/lead-final-approval/index.js:328-389',
  'scripts/modules/handoff/cli/execution-helpers.js:28-81',
  'database/migrations/20251207_sd_type_validation_profiles.sql:403-446',
  'database/migrations/20251221_orchestrator_auto_complete.sql:101-137',
  'database/migrations/20251204_handoff_enforcement_trigger.sql:30-90',
  'database/migrations/20251128_enforce_sd_completeness.sql:1-110',
  'database/migrations/temp_bypass_completion_validation.sql:1-30',
];

const required_plan_actions = [
  'RCA witness SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A: query pg_trigger, audit_log, validation_audit_log for the timeline of how this row reached status=completed despite enforce_progress_on_completion',
  'Decide FR-2 trigger architecture: augment enforce_progress_on_completion vs add orthogonal trg_validate_sd_completion (recommend the latter per R-3 mitigation)',
  'Specify FR-2 alternate-predicate allowlist matching the v_allowed_creators pattern: handoff_type IN (LEAD-FINAL-APPROVAL, PLAN-TO-LEAD) OR metadata.bypass_reason set OR governance_metadata.emergency_push=true OR created_by IN allowlist',
  'Define FR-1 revertSD() scope clearly: single-table UPDATE on strategic_directives_v2 only; sd_phase_handoffs audit trail preserved',
  'Specify FR-3 STATUS_INCONSISTENT badge defensive helper signature and required regression-pin test cases',
  'Specify FR-5 test matrix: 5 cases per R-6 mitigation + trigger-absent fallback per R-8 mitigation',
];

const risk_domains = {
  technical_complexity: 7,
  security_risk: 4,
  performance_risk: 6,
  integration_risk: 8,
  data_migration_risk: 7,
  ui_ux_risk: 2,
};

const rationale_summary =
  'HIGH overall because R-1, R-2, R-3 each independently can cause production breakage if not mitigated, AND the failure modes are concrete (predicate landmine, redundancy with existing enforce_progress_on_completion, multi-writer-path validation gap). NON-blocking because every risk has a concrete, code-read-grounded mitigation; all mitigations are PLAN/EXEC-actionable; precedent triggers (validate_sd_completeness_trigger, enforce_progress_on_completion, enforce_handoff_system) demonstrate the design pattern is achievable. PLAN phase MUST RCA the witness ghost-completion (R-3) before FR-2 design proceeds — that finding may invert R-2/R-3 design choices.';

const VERDICT = 'WARNING'; // valid_verdict CHECK only allows PASS,FAIL,BLOCKED,CONDITIONAL_PASS,WARNING,MANUAL_REQUIRED,PENDING,ERROR; BMAD level HIGH stored in metadata.bmad_overall_risk_level
const CONFIDENCE = 88;
const BLOCKING = false;

const summary = `LEAD-phase risk assessment: ${VERDICT} (${risks.filter(r => r.severity==='HIGH').length} HIGH + ${risks.filter(r => r.severity==='MEDIUM').length} MEDIUM + ${risks.filter(r => r.severity==='LOW').length} LOW), non-blocking; PLAN-phase RCA of witness required.`;

const justification = rationale_summary;

const critical_issues = risks.filter(r => r.severity === 'HIGH').map(r => `${r.id}: ${r.description.slice(0, 200)}`);
const warnings_list = risks.filter(r => r.severity === 'MEDIUM').map(r => `${r.id}: ${r.description.slice(0, 200)}`);
const recommendations_list = [
  ...risks.map(r => `${r.id} mitigation: ${r.mitigation.slice(0, 250)}`),
  ...required_plan_actions.map(a => `PLAN action: ${a.slice(0, 250)}`),
];

const row = {
  sd_id: SD_ID,
  sub_agent_code: 'RISK',
  sub_agent_name: 'Risk Assessment Sub-Agent',
  source: 'risk-agent',
  phase: PHASE,
  verdict: VERDICT,
  confidence: CONFIDENCE,
  summary,
  justification,
  critical_issues,
  warnings: warnings_list,
  recommendations: recommendations_list,
  metadata: {
    sd_key: SD_KEY,
    blocking: BLOCKING,
    risks_count: risks.length,
    risk_severity_breakdown: {
      high: risks.filter(r => r.severity === 'HIGH').length,
      medium: risks.filter(r => r.severity === 'MEDIUM').length,
      low: risks.filter(r => r.severity === 'LOW').length,
    },
    risks,
    risk_domains,
    bmad_overall_risk_level: VERDICT,
    rationale_summary,
    evidence_paths,
    required_plan_actions,
    closes_feedback: '0a06a05a-3c52-41ba-9c5e-d62582d5395a',
    witness_sd: 'SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A',
    scope: {
      tier: 3,
      estimated_loc: 650,
      frs: ['FR-1 lib/sd/revert.js', 'FR-2 trg_validate_sd_completion', 'FR-3 STATUS_INCONSISTENT badge', 'FR-4 audit-ghost-completed-sds.mjs', 'FR-5 regression-pin tests'],
    },
    model: {
      agent: 'risk-agent',
      model_name: 'Opus 4.7 (1M context)',
      model_id: 'claude-opus-4-7[1m]',
    },
  },
  detailed_analysis: {
    risks,
    risk_domains,
    evidence_paths,
    required_plan_actions,
    rationale: rationale_summary,
  },
  validation_mode: 'prospective',
};

console.log('Inserting risk-agent evidence row (corrected schema)...');
const { data, error } = await supabase
  .from('sub_agent_execution_results')
  .insert(row)
  .select('id, sd_id, sub_agent_code, phase, verdict, confidence, created_at')
  .single();

if (error) {
  console.error('Insert failed:', error);
  process.exit(2);
}

console.log('Inserted:', JSON.stringify(data, null, 2));
console.log('\nRisk verdict summary:');
console.log(`  verdict: ${VERDICT}`);
console.log(`  confidence: ${CONFIDENCE}`);
console.log(`  blocking: ${BLOCKING}`);
console.log(`  risks: ${risks.length} (HIGH=${risks.filter(r=>r.severity==='HIGH').length} MEDIUM=${risks.filter(r=>r.severity==='MEDIUM').length} LOW=${risks.filter(r=>r.severity==='LOW').length})`);
