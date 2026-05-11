import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const SD_KEY = 'SD-FDBK-INFRA-ATOMIC-REVERT-HELPER-001';
const SD_ID = '5de33889-820f-4758-a96f-363f17908e97';

// Post-RCA rescope: drop trigger (R-3 blocker — existing enforce_progress trigger
// has same predicate and was bypassed via LHE optimistic-pre-insert pattern).
// Trigger requires LeadFinalApprovalExecutor refactor first (deferred to follow-up SD).
//
// New scope keeps the immediate-value pieces (helper + view + badge + audit + tests)
// and pushes the trigger + executor refactor to a follow-up SD.

const key_changes = [
  { change: "lib/sd/revert.js — atomic-revert helper exporting revertSD(sdId, reason, options) that performs a SINGLE supabase.from('strategic_directives_v2').update({status, current_phase, progress, metadata}) call", impact: "Eliminates the partial-revert class where metadata.reverted_at is set but column updates are forgotten. Idempotent (preserves first-write reverted_at on re-call). Fail-loud on PostgrestError." },
  { change: "database/migrations/<date>_v_sd_completion_integrity.sql — read-only DB VIEW v_sd_completion_integrity exposing is_ghost_completed (status='completed' AND NOT EXISTS sd_phase_handoffs WHERE handoff_type='LEAD-FINAL-APPROVAL' AND status='accepted') excluding orchestrator/documentation sd_types", impact: "DB-side single-source-of-truth for ghost detection. Read-only (NO trigger, NO write enforcement). leverages canonical sd_phase_handoffs (NOT leo_handoff_executions cache — per RCA finding). Backward-compatible: zero impact on existing writes." },
  { change: "scripts/modules/sd-next/status-helpers.js — STATUS_INCONSISTENT badge detection reading v_sd_completion_integrity.is_ghost_completed for displayed SDs; non-blocking", impact: "Operators see ghost-completed SDs in sd:next queue without needing to query DB manually. Cosmetic only (does not affect routing). Falls through gracefully if view doesn't exist (try/catch + default empty)." },
  { change: "scripts/audit-ghost-completed-sds.mjs — wrappable audit script that queries v_sd_completion_integrity, prints report with sd_key, sd_type, age, last-handoff. --execute flag applies revertSD() bulk after explicit user confirmation prompt", impact: "Remediation tool for 275 existing true-ghost SDs identified by RCA. Read-only by default. Per-SD dry-run preview before --execute applies." },
  { change: "tests/unit/sd-revert.test.js + tests/integration/sd-completion-integrity-view.test.js + tests/unit/sd-next-ghost-badge.test.js + static-pin guard for atomic-revert single-UPDATE shape", impact: "Regression-locks atomicity (revertSD must use exactly ONE .from('strategic_directives_v2').update() call). View test asserts correct ghost detection. Badge test asserts sd:next output contains STATUS_INCONSISTENT when ghost SDs present." }
];

const success_criteria = [
  { criterion: "revertSD() writes status, current_phase, progress, metadata in a single supabase update() call", measure: "static-pin test asserts source contains exactly one .from('strategic_directives_v2').update(...) inside revertSD()" },
  { criterion: "v_sd_completion_integrity view correctly identifies witness SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A as ghost-completed", measure: "integration test queries view, expects witness row.is_ghost_completed=true" },
  { criterion: "sd:next surfaces STATUS_INCONSISTENT badge for ghost-completed SDs", measure: "test calls getStatusBadge() with a ghost SD, expects badge text contains 'STATUS_INCONSISTENT' or equivalent token" },
  { criterion: "Audit script reports >=1 ghost SD on a DB with the witness present", measure: "integration test runs scripts/audit-ghost-completed-sds.mjs in read-only mode, asserts exit code 0 and output includes 'SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A'" },
  { criterion: "Zero regression on existing 459+ vitest baseline", measure: "vitest run shows ZERO new failures vs origin/main HEAD 052a3c8c4b" }
];

const smoke_test_steps = [
  { step_number: 1, instruction: "Apply migration <date>_v_sd_completion_integrity.sql to dev DB", expected_outcome: "View v_sd_completion_integrity created; query returns >=1 row for the witness SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A" },
  { step_number: 2, instruction: "Import revertSD from lib/sd/revert.js, call revertSD('<test-sd-id>', 'smoke-test', {dry_run: true})", expected_outcome: "Returns planned update payload with status='draft', current_phase='LEAD', progress=0, metadata.reverted_at set" },
  { step_number: 3, instruction: "Call revertSD twice in succession", expected_outcome: "Second call is idempotent: metadata.reverted_at unchanged from first call" },
  { step_number: 4, instruction: "Run npm run sd:next on a DB with the witness", expected_outcome: "Witness SD displays STATUS_INCONSISTENT badge in queue output" },
  { step_number: 5, instruction: "Run node scripts/audit-ghost-completed-sds.mjs (read-only)", expected_outcome: "Reports >=1 ghost SD, no DB writes, exit code 0" }
];

const new_metadata = {
  source: "feedback",
  source_id: "0a06a05a-3c52-41ba-9c5e-d62582d5395a",
  created_at: "2026-05-10T22:52:21.704Z",
  created_via: "leo-create-sd",
  feedback_type: "enhancement",
  feedback_priority: null,
  target_application_explicit: false,

  // LEAD scope-lock + post-RCA rescope
  pattern_addressed: "PAT-GHOST-COMPLETION-PARTIAL-REVERT-001",
  rca_run_id: "c92aead4-b5bd-4945-9b48-9d9770aa35df",
  rca_in_session_addendum: "RCA-2026-05-10-atomic-revert-trigger-bypass — identified that existing enforce_progress_on_completion trigger was bypassed via LHE optimistic-pre-insert pattern (LeadFinalApprovalExecutor lines 328-348). 957/1000 completed SDs (~96%) have dual-table mismatch. Triggered LEAD-phase rescope: trigger enforcement deferred to follow-up SD pending P-3 executor refactor.",
  witness_sd_keys: ["SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A"],
  witness_sd_ids: ["b737c27f-3e83-4887-999e-3c1ae158faf4"],
  closes_feedback_uuid: "0a06a05a-3c52-41ba-9c5e-d62582d5395a",
  deferred_from_sd_key: "SD-EVA-SUPPORT-CLI-SKILL-ORCH-001",
  tier_classification: "tier_3",
  tier_classification_reason: "Touches database schema (new VIEW on critical table strategic_directives_v2) AND lib code AND has migration. ~200 src + ~350 test LOC.",
  loc_estimate_src: 200,
  loc_estimate_test: 350,
  loc_estimate_total: 550,
  scope_reduction_percentage: 45,
  scope_removed: [
    "Postgres BEFORE UPDATE trigger trg_validate_sd_completion (DEFERRED to follow-up SD pending LeadFinalApprovalExecutor pre-insert refactor — RCA P-3)",
    "LHE reconciliation constraint (DEFERRED — RCA P-2; needs to ship with P-3)",
    "LeadFinalApprovalExecutor pre-insert refactor (DEFERRED — RCA P-3; high blast radius)",
    "sd_audit_log writer (rejected at first LEAD scope-lock; trigger raises at DB layer was the alternative — now deferred along with trigger)",
    "Backfill migration for existing 275 ghost rows (out of scope; audit script with --execute is the manual remediation path)"
  ],
  follow_up_sd_proposed: {
    title: "Refactor LeadFinalApprovalExecutor pre-insert + enforce SPH-only completion invariant",
    scope: [
      "P-3: LeadFinalApprovalExecutor pre-insert refactor — change LHE insert to status='pending', flip to 'accepted' only AFTER HandoffRecorder writes SPH-accepted (eliminates optimistic-cache defect)",
      "P-2: LHE reconciliation constraint — INSERT/UPDATE of LHE with status='accepted' AND handoff_type='LEAD-FINAL-APPROVAL' requires matching SPH-accepted (or auto-flip LHE on SPH-rejected write)",
      "Postgres BEFORE UPDATE trigger trg_validate_sd_completion using SPH-ONLY evidence (now safe after P-3 ships)",
      "Update get_progress_breakdown function to drop the LHE UNION ALL for LEAD-FINAL-APPROVAL existence check"
    ],
    blast_radius: "HIGH — touches the LEAD-FINAL-APPROVAL executor path used by every SD completion. Must ship with extensive staging burn-in.",
    blocking_dependency: "SD-FDBK-INFRA-ATOMIC-REVERT-HELPER-001 must ship first (provides view + audit + revertSD tooling)"
  },
  rca_findings: {
    root_cause: "Optimistic write-through-cache pattern in leo_handoff_executions. LeadFinalApprovalExecutor pre-inserts 'accepted' row BEFORE the SD UPDATE for chicken-and-egg gate-check reasons. When validation later rejects, SPH writes 'rejected' but LHE 'accepted' is never reverted. Progress gate's lead_final_exists UNION-ALLs SPH + LHE, so stale LHE keeps gate=TRUE indefinitely.",
    empirical_baseline_completed_sds: 1000,
    true_ghost_count_no_lead_final_either_table: 275,
    partial_ghost_count_lhe_accepted_only: 682,
    both_tables_agree_count: 43,
    affected_percentage: 95.7,
    five_writer_paths: [
      "LeadFinalApprovalExecutor (primary witnessed path)",
      "complete_orchestrator_sd() SECURITY DEFINER PL/pgSQL",
      "try_auto_complete_parent_orchestrator() AFTER UPDATE cascade",
      "reconcileSDStateAfterHandoff drift-fix",
      "Manual SQL via SET LOCAL leo.bypass_completion_check OR EMERGENCY_PUSH"
    ]
  },

  // LEAD pre-approval validation answers (Q1-Q8)
  need_validation: "Real problem: status='completed' lies about reality. Empirically 275 SDs are ghost-completed (~27.5% of all completed SDs). Witness SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A shows 2026-04-28 ghost-completion still propagating today (2026-05-10).",
  solution_assessment: "Aligns with database-first principle. Read-only view + atomic helper + operator surfacing tools provide immediate visibility and remediation capability WITHOUT touching the high-blast-radius executor path. Trigger enforcement is sequenced separately after executor refactor.",
  existing_tools: "None — verified empirically by greps. enforce_progress_on_completion exists but uses LHE UNION ALL which is the very pattern this SD's view bypasses. v_sd_completion_integrity is genuinely new.",
  value_analysis: "Immediate operator visibility into 275 ghost SDs + tooling to remediate. Closes PAT-GHOST-COMPLETION-PARTIAL-REVERT-001 detection layer. Unlocks follow-up SD for trigger enforcement.",
  feasibility_review: "VIEW + JS lib + npm scripts; standard tech. Zero write enforcement = zero risk of blocking legitimate writes. View is forward-compatible with future trigger.",
  risk_assessment: "LOW — read-only view + helper + scripts. No new write paths, no new triggers, no blocking behavior. Only risks: (a) view performance on large completed-SD set (mitigation: indexed query, ~1000 rows scan), (b) badge rendering crash in sd:next (mitigation: try/catch).",
  simplicity_check: "Maximally simple given RCA findings. Splitting trigger work out keeps blast radius low. View is single-statement read-only DB object.",
  deletion_audit_q8: "Removed 45% of original scope post-RCA: BEFORE UPDATE trigger enforcement, LHE reconciliation constraint, executor pre-insert refactor (all deferred to follow-up SD). Plus 25% scope-reduction from initial LEAD lock (sd_audit_log writer, auto-revert action, child cascade, backfill migration). Total scope reduction: ~70% from initial naive scope to current Tier-3."
};

const dependencies = [
  { type: 'database_migration', status: 'pending', dependency: 'v_sd_completion_integrity.sql (will be added in EXEC phase)' }
];

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .update({
    key_changes,
    success_criteria,
    smoke_test_steps,
    dependencies,
    metadata: new_metadata,
    governance_metadata: {
      migration_reviewed: true,
      migration_review_reason: "EXEC will add a read-only DB VIEW v_sd_completion_integrity on strategic_directives_v2 — reviewed at LEAD: zero write paths, zero blocking behavior, single-statement DDL. Backward-compatible. Trigger enforcement deferred to follow-up SD per RCA findings.",
      scope_locked_at: new Date().toISOString(),
      scope_locked_by: "LEAD",
      scope_lock_session: process.env.CLAUDE_SESSION_ID || 'b1cfb519-6ef4-479f-b8b6-c6233536afba',
      rca_driven_rescope_at: new Date().toISOString(),
      rca_driven_rescope_reason: "Post-RCA finding (rca-agent in-session): existing enforce_progress_on_completion trigger bypassed via LeadFinalApprovalExecutor optimistic LHE pre-insert. Trigger enforcement requires P-3 executor refactor to ship first. Deferred to follow-up SD; current SD focuses on view + helper + audit + badge."
    }
  })
  .eq('sd_key', SD_KEY)
  .select('id, sd_key, key_changes, success_criteria, metadata');

if (error) { console.error('UPDATE ERROR:', error.message); process.exit(1); }
console.log('LEAD post-RCA rescope applied:');
console.log('  key_changes count:', data[0].key_changes.length);
console.log('  success_criteria count:', data[0].success_criteria.length);
console.log('  tier:', data[0].metadata.tier_classification);
console.log('  loc_est:', data[0].metadata.loc_estimate_total);
console.log('  scope_reduction:', data[0].metadata.scope_reduction_percentage, '% (cumulative)');
console.log('  follow_up_sd_proposed:', data[0].metadata.follow_up_sd_proposed.title);
