import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const SD_KEY = 'SD-FDBK-INFRA-ATOMIC-REVERT-HELPER-001';

const key_changes = [
  { change: "lib/sd/revert.js — atomic-revert helper exporting revertSD(sdId, reason, options) that performs a SINGLE supabase.from('strategic_directives_v2').update({status, current_phase, progress, metadata}) call", impact: "Eliminates the partial-revert class where metadata.reverted_at is set but column updates are forgotten. Idempotent (no-op when already reverted), fail-loud on PostgrestError." },
  { change: "database/migrations/<date>_sd_completion_invariant.sql — BEFORE UPDATE trigger trg_validate_sd_completion on strategic_directives_v2 that fires when new.status='completed' and old.status != 'completed', asserting EXISTS(sd_phase_handoffs WHERE sd_id=new.id AND handoff_type='LEAD-FINAL-APPROVAL' AND status='accepted')", impact: "Prevents future ghost-completion at the DB layer. Bracket-tokenized error [SD_COMPLETION_INVARIANT_VIOLATED] on raise. Backward-compatible: existing rows untouched (trigger fires on UPDATE only)." },
  { change: "scripts/modules/sd-next/status-helpers.js — add STATUS_INCONSISTENT badge detection (status='completed' AND no accepted LEAD-FINAL-APPROVAL handoff) surfaced in sd:next display; non-blocking", impact: "Operators see ghost-completed SDs in the queue without needing to query DB manually. Cosmetic only (does not affect routing)." },
  { change: "scripts/one-off/audit-ghost-completed-sds.mjs — report script that lists status='completed' SDs missing accepted LEAD-FINAL-APPROVAL handoff; --execute flag to apply revertSD() bulk", impact: "One-shot remediation tool for existing drift. Read-only by default. Existing ghost rows (e.g., SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A) can be cleanly reverted via this audit." },
  { change: "tests/unit/sd-revert.test.js + tests/unit/sd-completion-invariant.test.js + static-pin guard for revertSD source", impact: "Regression-locks the single-UPDATE shape so a future PR cannot split atomicity. Trigger violation test confirms migration applies and enforces invariant." }
];

const success_criteria = [
  { criterion: "revertSD() writes status, current_phase, progress, metadata in a single supabase update() call", measure: "static-pin test asserts source contains exactly one .from('strategic_directives_v2').update(...) inside revertSD()" },
  { criterion: "Trigger trg_validate_sd_completion blocks status→completed without accepted LEAD-FINAL-APPROVAL handoff", measure: "test creates SD without handoff, attempts UPDATE status='completed', expects PostgrestError matching /SD_COMPLETION_INVARIANT/" },
  { criterion: "sd:next surfaces STATUS_INCONSISTENT badge for ghost-completed SDs", measure: "audit query returns >=1 SD pre-fix; sd:next text output contains 'STATUS_INCONSISTENT' for those rows" },
  { criterion: "Static-pin tests prevent future drift on atomic-revert shape", measure: "regression test fails if helper splits UPDATE into >1 supabase call" },
  { criterion: "Backward compatibility: no regression in existing 459+ vitest baseline", measure: "vitest run shows ZERO new failures vs origin/main" }
];

const smoke_test_steps = [
  { step_number: 1, instruction: "Apply migration <date>_sd_completion_invariant.sql to dev DB", expected_outcome: "Trigger trg_validate_sd_completion exists on strategic_directives_v2" },
  { step_number: 2, instruction: "Create a test SD without any handoffs, attempt UPDATE status='completed'", expected_outcome: "PostgrestError thrown with [SD_COMPLETION_INVARIANT_VIOLATED] token" },
  { step_number: 3, instruction: "Import revertSD from lib/sd/revert.js, call revertSD(<sd_id>, 'test')", expected_outcome: "Single supabase UPDATE writes all 4 fields atomically; second call is idempotent" },
  { step_number: 4, instruction: "Run npm run sd:next on a DB with the witness SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A", expected_outcome: "Witness SD displays STATUS_INCONSISTENT badge" },
  { step_number: 5, instruction: "Run scripts/one-off/audit-ghost-completed-sds.mjs (read-only)", expected_outcome: "Reports >=1 ghost SD (witness), no DB writes" }
];

// Scope reduction Q8: removed (a) sd_audit_log writer (not needed when trigger blocks at DB layer),
// (b) auto-revert on detection in sd:next (read-only badge only), (c) child SD auto-revert on parent revert (out of scope).
const dependencies = [
  { type: 'database_migration', status: 'pending', dependency: 'sd_completion_invariant.sql (will be added in EXEC phase)' }
];

const new_metadata = {
  source: "feedback",
  source_id: "0a06a05a-3c52-41ba-9c5e-d62582d5395a",
  created_at: "2026-05-10T22:52:21.704Z",
  created_via: "leo-create-sd",
  feedback_type: "enhancement",
  feedback_priority: null,
  target_application_explicit: false,
  // LEAD scope-lock additions
  pattern_addressed: "PAT-GHOST-COMPLETION-PARTIAL-REVERT-001",
  rca_run_id: "c92aead4-b5bd-4945-9b48-9d9770aa35df",
  witness_sd_keys: ["SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A"],
  witness_sd_ids: ["b737c27f-3e83-4887-999e-3c1ae158faf4"],
  closes_feedback_uuid: "0a06a05a-3c52-41ba-9c5e-d62582d5395a",
  deferred_from_sd_key: "SD-EVA-SUPPORT-CLI-SKILL-ORCH-001",
  tier_classification: "tier_3",
  tier_classification_reason: "Touches database schema (trigger on critical table strategic_directives_v2) AND lib code AND has migration. Triage misclassified as Tier-1 (~8 LOC) due to description-scan fallback when scope/key_changes not supplied at creation. Actual ~250 src + ~400 test LOC.",
  loc_estimate_src: 250,
  loc_estimate_test: 400,
  loc_estimate_total: 650,
  scope_reduction_percentage: 25,
  scope_removed: [
    "sd_audit_log writer (replaced by trigger raising at DB layer — single source of truth)",
    "auto-revert action in sd:next (kept read-only badge only — operators decide)",
    "child SD auto-revert on parent revert (out of scope; rare case)",
    "backfill migration to revert existing ghost rows (kept as separate audit-script with --execute flag)"
  ],
  // LEAD pre-approval validation answers (Q1-Q8)
  need_validation: "Real problem: status='completed' lies about reality, breaking sd:next/dashboards/auto-resolver downstream. Witness SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A shows ghost-completed state 2026-04-28 still propagating today (2026-05-10).",
  solution_assessment: "Aligns with database-first principle. DB-side invariant + atomic helper enforce truth where it matters — at write time.",
  existing_tools: "None — verified empirically by greps on scripts/, lib/, database/migrations/. Only archive scripts (scripts/archive/one-time/auto-revert.js) exist as historical refs.",
  value_analysis: "Prevents data integrity drift across the SD lifecycle. Closes PAT-GHOST-COMPLETION-PARTIAL-REVERT-001 (a NEW pattern). Sister to PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 (19+ witnesses) — same root cause class (partial write of multi-field state).",
  feasibility_review: "Postgres trigger + JS lib + npm scripts; standard well-understood tech. Migration on critical strategic_directives_v2 table — needs staged rollout but trigger fires only on UPDATE so backward-compatible with existing rows.",
  risk_assessment: "MEDIUM — migration on critical table. Mitigations: (a) trigger fires BEFORE UPDATE not on INSERT so doesn't affect SD creation, (b) trigger only fires when new.status='completed' AND old.status != 'completed' (idempotent re-completion safe), (c) advisory test in staging via temp DB before prod. R6 risk: existing handoff-bypass paths (--bypass-validation) could legitimately complete SDs without LEAD-FINAL — mitigated by relaxed predicate that allows accepted LEAD-FINAL-APPROVAL OR metadata.bypass_reason set.",
  simplicity_check: "Simpler alternative considered: CHECK constraint instead of trigger. Rejected because CHECK constraints cannot reference other tables in Postgres. Trigger is the minimum viable enforcement mechanism.",
  deletion_audit_q8: "Removed 25% of original scope: sd_audit_log writer, auto-revert sd:next action, child cascade revert, backfill migration (kept as separate audit script)."
};

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
      migration_review_reason: "EXEC will add BEFORE UPDATE trigger on critical table strategic_directives_v2 — reviewed at LEAD: fires only when new.status='completed' AND old.status != 'completed' (idempotent re-completion safe); backward-compatible (existing rows untouched).",
      scope_locked_at: new Date().toISOString(),
      scope_locked_by: "LEAD",
      scope_lock_session: process.env.CLAUDE_SESSION_ID || 'b1cfb519-6ef4-479f-b8b6-c6233536afba'
    }
  })
  .eq('sd_key', SD_KEY)
  .select('id, sd_key, key_changes, success_criteria, metadata');

if (error) { console.error('UPDATE ERROR:', error.message); process.exit(1); }
console.log('LEAD scope-lock applied:');
console.log('  key_changes count:', data[0].key_changes.length);
console.log('  success_criteria count:', data[0].success_criteria.length);
console.log('  tier:', data[0].metadata.tier_classification);
console.log('  loc_est:', data[0].metadata.loc_estimate_total);
console.log('  scope_reduction:', data[0].metadata.scope_reduction_percentage, '%');
