#!/usr/bin/env node
/**
 * Write database-agent evidence row for SD-LEO-FEAT-STAGE-REJECT-KILL-001 LEAD_APPROVAL phase.
 * verdict='conditional_pass' — design changes recommended (see findings).
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config({ path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.env', quiet: true });

const sb = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const SD_ID = '5474573f-3fd9-43e5-8c9e-4584a0cedfdc';

const findings = {
  enum_safety: {
    type: 'workflow_status_enum (Postgres ENUM)',
    existing_values: ['pending','in_progress','paused','completed','failed','skipped','blocked'],
    additive_killed_safe: true,
    notes: "ALTER TYPE workflow_status_enum ADD VALUE 'killed' is safe and additive. No CHECK constraints; partial indexes/views (v_active_ventures, v_archived_ventures) reference workflow_status but are not value-filtered against a stable list — extension does not break them. CAVEAT: ADD VALUE cannot run inside a transaction block — use a standalone migration step.",
    views_to_review: ['v_active_ventures','v_archived_ventures']
  },
  trigger_inventory: {
    direct_workflow_status_triggers: 'NONE — no trigger on ventures fires on workflow_status changes',
    triggers_on_status_column: ['trigger_create_postmortem_on_failure (status=failed only — NOT killed)','trg_ventures_update_sync_eva (mirrors status->eva_ventures.status)'],
    notable_remap: {
      function: 'sync_ventures_to_eva_ventures_update',
      behavior: "Maps ventures.status='cancelled' → eva_ventures.status='killed' (NOT failed). MEMORY claim that the trigger 'remaps killed-like events to failed' is INCORRECT for this mapping. There is NO trigger named tr_sd_completed_event on public.ventures.",
      reject_chairman_decision_path: "RPC currently sets ventures.status='cancelled' AND workflow_status='failed' (latter is the actual remap source — happens in the RPC body, not a trigger)."
    },
    sd_completed_emitter: {
      function: 'fn_emit_sd_completed_event',
      attached_to: 'strategic_directives_v2 (NOT public.ventures)',
      fires_on: "NEW.status='completed' on SD update; emits event_type='sd.completed' to eva_events when metadata.venture_id present",
      relevance_to_kill: 'NONE — unrelated to venture kill flow'
    },
    cascade_concerns: {
      restrict_fks_count: 8,
      restrict_fk_examples: ['chairman_decisions','chairman_directives','compliance_gate_events','governance_decisions','risk_escalation_log','risk_gate_passage_log'],
      cascade_fks_count: '70+ — most child tables CASCADE on DELETE',
      kill_does_NOT_delete: true,
      assessment: 'Setting workflow_status=killed does NOT delete ventures.id, so RESTRICT FKs are not triggered. Safe.'
    }
  },
  chk_event_type_contract: {
    constraint_name: 'eva_events_event_type_check',
    accepts: ['metric_update','health_change','decision_required','alert_triggered','automation_executed','status_change','milestone_reached','risk_detected','user_action','stage_processing_started','stage_processing_completed','stage_processing_failed','stage.completed','decision.submitted','gate.evaluated','sd.completed'],
    rejects_venture_killed: true,
    cleaner_path: "Use existing event_type='status_change' (already accepted) with event_data jsonb carrying { type:'venture.killed', venture_id, killed_by, rationale, killed_at }. AVOID adding 'venture.killed' to the CHECK constraint — that requires migration of an enum-like check + breaking schema rev. event_type='status_change' is already the canonical bucket for venture lifecycle transitions.",
    note_no_event_subtype_column: 'eva_events has NO event_subtype column — only event_type, event_source, event_data jsonb. The SD spec mention of event_subtype is inaccurate; use event_data.type discriminator instead.',
    no_eva_venture_id_required: 'eva_events.eva_venture_id is nullable — but kill RPC SHOULD set it to ventures.id for audit linkage.'
  },
  auth_users_fk: {
    pk_column: 'id',
    pk_type: 'uuid',
    fk_alignment: 'OK — proposed killed_by_user_id UUID REFERENCES auth.users(id) is type-correct.'
  },
  privacypatrol_backfill: {
    venture_id: '08d20036-03c9-4a26-bbc5-f37a18dfdf23',
    name: 'PrivacyPatrol AI',
    current_status: 'active',
    current_workflow_status: 'pending',
    killed_at: '2026-05-05 15:22:04.335+00',
    kill_reason: 'Smoke test only — chairman decision 2026-05-05. Code reverted via SD-LEO-FIX-REVERT-CROSS-VENTURE-001 PR rickfelix/ehg#570.',
    kill_reason_length: 123,
    chk_rationale_min_20_satisfied: true,
    chairman_uid: '69c8aa7a-7661-48ed-9779-746fa6290873',
    chairman_email: 'rickfelix2000@gmail.com',
    chairman_meta_role: 'admin',
    inconsistency_flag: "PrivacyPatrol AI has killed_at + kill_reason populated but ventures.status = 'active' and workflow_status = 'pending' — kill state is partial. The SD-LEO-FIX-REVERT-CROSS-VENTURE-001 reverted user-facing code but did NOT roll the venture status back to a killed state. Backfill is therefore SAFE: existing kill_reason satisfies the proposed CHECK (length >= 20)."
  },
  rls_pattern: {
    canonical_role_check_helper: 'public.fn_is_chairman()',
    fn_is_chairman_signature: 'RETURNS boolean, SECURITY DEFINER, SET search_path = public',
    fn_is_chairman_logic: "auth.uid() lookup against auth.users.raw_user_meta_data->>'role' IN ('chairman','admin','owner') OR raw_user_meta_data->'roles' @> '\"chairman\"'::jsonb",
    auth_jwt_pattern_hits: 0,
    auth_jwt_recommendation: "DO NOT USE auth.jwt() — no existing public-schema SECURITY DEFINER RPC uses it. Use fn_is_chairman() (canonical) for the chairman role gate. The SD spec line saying 'role check via auth.jwt() (chairman|lead)' should be amended to 'role check via fn_is_chairman()' or extend fn_is_chairman to accept 'lead' if needed.",
    canonical_kill_rpc_already_exists: {
      name: 'public.reject_chairman_decision(p_decision_id uuid, p_rationale text, p_decided_by text)',
      security_definer: true,
      search_path_locked: true,
      pattern_used: "Uses auth.uid() (not auth.jwt()), updates ventures.status='cancelled' AND workflow_status='failed' for kill-gate stages [3,5,13,23], returns jsonb { success, decision_id, venture_id, lifecycle_stage, new_status, is_kill_gate, source }.",
      relevance: "STRONGEST CONFLICT FLAG. The proposed kill_venture(p_venture_id, p_rationale) overlaps with reject_chairman_decision in semantics. Recommendation: either (a) extend reject_chairman_decision with a venture-direct signature, or (b) make new RPC kill_venture call into the same code path so both stay consistent. Splitting them risks divergent kill logic where one path sets workflow_status='failed' (current) and another sets workflow_status='killed' (proposed)."
    },
    audit_pattern: 'public.operations_audit_log (entity_type, entity_id, action, performed_by uuid, performed_at, severity, metadata jsonb) is the canonical audit table — kill RPC SHOULD also write a row here in addition to ventures_kill_log for cross-system queryability.',
    rls_pattern_for_log_table: "Recommend: enable RLS, add SELECT policy USING (fn_is_chairman() OR auth.uid() = killed_by_user_id), add INSERT policy WITH CHECK (false) — only the SECURITY DEFINER RPC can insert (which bypasses RLS via its definer privileges)."
  },
  cross_cutting_concerns: {
    workflow_status_failed_vs_killed: "Today reject_chairman_decision sets workflow_status='failed' for kill-gate rejections. Adding 'killed' creates a new state that competes with 'failed'. Decide: (a) is 'killed' a NEW value (chairman two-gate kill) and 'failed' is reserved for system/auto failures? (b) does 'killed' also replace 'failed' in reject_chairman_decision? RECOMMENDATION (a) — keep them distinct, document semantics in migration comment.",
    eva_ventures_status_mapping: "After workflow_status='killed', the existing trg_ventures_update_sync_eva will fire ONLY if ventures.status changes (it does not fire on workflow_status alone). If the kill_venture RPC also sets ventures.status='cancelled' (as reject_chairman_decision does), eva_ventures.status will be remapped to 'killed' automatically — desirable. If RPC only updates workflow_status, eva_ventures will be out of sync. RECOMMEND: kill_venture must update BOTH ventures.status='cancelled' AND ventures.workflow_status='killed' for full consistency.",
    direct_insert_blocked: "trg_enforce_stage0_origin blocks direct INSERT to ventures unless leo.stage0_bypass=true or service_role JWT. The kill_venture RPC must run SECURITY DEFINER (which it does) — but the RPC is UPDATE-only on ventures, so this trigger is irrelevant.",
    stage_constraint_unaffected: "fn_validate_stage_column + prevent_tier0_stage_progression fire on current_lifecycle_stage / tier changes only — kill_venture does not modify those, so no interference.",
    sd_completed_emitter_unaffected: "fn_emit_sd_completed_event lives on strategic_directives_v2, fires on NEW.status='completed' — completely orthogonal to the venture-kill flow."
  }
};

const recommendations = [
  "ENUM extension: keep — `ALTER TYPE workflow_status_enum ADD VALUE IF NOT EXISTS 'killed';` in standalone migration step (cannot run in tx with other DDL).",
  "RLS policy: omit INSERT policy entirely and rely on SECURITY DEFINER on kill_venture(). SELECT policy: `CREATE POLICY ventures_kill_log_select_policy ON ventures_kill_log FOR SELECT TO authenticated USING (fn_is_chairman() OR killed_by_user_id = auth.uid());`",
  "Role check: replace 'auth.jwt() role check (chairman|lead)' with 'IF NOT fn_is_chairman() THEN RAISE EXCEPTION USING ERRCODE = 42501;'. If 'lead' role is required separately, extend fn_is_chairman to recognize it OR write a new fn_is_chairman_or_lead() helper.",
  "eva_events emission: use event_type='status_change' (already in CHECK), put { type:'venture.killed', venture_id, killed_by_user_id, rationale, killed_at } into event_data. Do NOT add 'venture.killed' as a new event_type value (avoids CHECK rev).",
  "RPC must update BOTH ventures.status='cancelled' AND ventures.workflow_status='killed' to keep eva_ventures sync trigger consistent with prior reject_chairman_decision behavior.",
  "Conflict resolution with reject_chairman_decision: amend that RPC (in same migration) to set workflow_status='killed' instead of 'failed' for kill-gate rejections, so both code paths converge. Document semantics: 'failed' = automated/system failure; 'killed' = chairman kill decision.",
  "Backfill: insert single ventures_kill_log row from PrivacyPatrol AI venture (id=08d20036-03c9-4a26-bbc5-f37a18dfdf23, killed_by_user_id=69c8aa7a-7661-48ed-9779-746fa6290873, rationale=existing kill_reason length=123, killed_at=existing killed_at, metadata={ backfill_source:'pre_two_gate_dialog', sd_ref:'SD-LEO-FIX-REVERT-CROSS-VENTURE-001' }). Existing kill_reason satisfies the >=20 CHECK.",
  "Drop the legacy ventures.killed_at + ventures.kill_reason columns AFTER backfill in a follow-up SD (do NOT drop in this SD — risk of cross-repo readers).",
  "Optional: also write to operations_audit_log (entity_type='venture', entity_id=venture_id::text, action='kill', performed_by=killed_by_user_id, severity='warning', metadata=jsonb_build_object('rationale', p_rationale)) for governance audit trail consistency."
];

const conditions = [
  'Amend SD spec: replace auth.jwt() with fn_is_chairman() canonical helper.',
  'Amend SD spec: do NOT add new event_type — use status_change with event_data.type=venture.killed.',
  'Amend SD spec: kill_venture must also UPDATE ventures.status=cancelled in addition to workflow_status=killed.',
  'In same migration: align reject_chairman_decision so it also sets workflow_status=killed for kill-gate rejections — or document why they diverge.',
  'Add operations_audit_log write inside kill_venture for governance trail.'
];

const warnings = [
  "MEMORY claim that 'tr_sd_completed_event family remaps killed-like events to failed' is INCORRECT — no such trigger on public.ventures. The actual workflow_status='failed' on kill comes from public.reject_chairman_decision RPC body.",
  "Existing reject_chairman_decision RPC overlaps semantically with proposed kill_venture — divergence risk if both kept independent.",
  "PrivacyPatrol AI venture state is partial: killed_at/kill_reason populated but status='active'/workflow_status='pending'. Backfill must NOT depend on ventures.status being 'cancelled'.",
  "ALTER TYPE ... ADD VALUE cannot run inside a transaction with other DDL — split into standalone migration step."
];

console.log('Writing evidence row...');
const payload = {
  sd_id: SD_ID,
  sub_agent_code: 'DATABASE',
  sub_agent_name: 'database-agent',
  phase: 'LEAD_APPROVAL',
  validation_mode: 'prospective',
  verdict: 'WARNING',
  confidence: 88,
  summary: 'Pre-implementation schema-impact analysis for Stage 23 Reject UX kill flow. Enum extension is safe; auth.users FK type aligns; PrivacyPatrol AI backfill data satisfies CHECK. Five design conditions before EXEC: drop auth.jwt() in favor of fn_is_chairman(), reuse event_type=status_change instead of adding venture.killed, RPC must update both status and workflow_status, align with existing reject_chairman_decision RPC to avoid divergent kill semantics, add operations_audit_log write.',
  detailed_analysis: findings,
  recommendations,
  conditions,
  warnings,
  critical_issues: [],
  source: 'database-agent',
  metadata: {
    analysis_type: 'pre_implementation_schema_impact',
    sd_key: 'SD-LEO-FEAT-STAGE-REJECT-KILL-001',
    db_project: 'dedlbzhpgkmetvhbkyzq',
    method: 'supabase_db_query_linked_read_only',
    queries_executed: 25,
    migrations_applied: 0,
    privacypatrol_venture_id: '08d20036-03c9-4a26-bbc5-f37a18dfdf23',
    chairman_uid: '69c8aa7a-7661-48ed-9779-746fa6290873'
  },
  justification: 'Verdict conditional_pass: no blocking issues, but five design corrections required before PLAN/EXEC. Confidence 88% reflects strong evidence on enum safety, FK alignment, trigger inventory and backfill viability; the 12% gap accounts for unknowns about whether the LEAD intent is to converge with reject_chairman_decision or keep parallel kill paths.'
};

const { data, error } = await sb.from('sub_agent_execution_results').insert(payload).select().single();

if (error) {
  console.error('INSERT ERROR:', error);
  process.exit(1);
}
console.log('✅ Evidence row written:', data.id);
console.log('   sd_id:', data.sd_id);
console.log('   phase:', data.phase);
console.log('   verdict:', data.verdict);
console.log('   confidence:', data.confidence);
console.log('   validation_mode:', data.validation_mode);
