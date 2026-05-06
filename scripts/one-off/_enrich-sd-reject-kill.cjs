require('dotenv').config();

(async () => {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const sdKey = 'SD-LEO-FEAT-STAGE-REJECT-KILL-001';

  const enrichment = {
    rationale:
      "Stage 23 (Launch Readiness) currently has Approve and Hold UX surfaces but no terminal Reject path. Chairman rejection of a venture today is an ad-hoc workaround using ventures.killed_at + ventures.kill_reason text fields, added during SD-LEO-FIX-REVERT-CROSS-VENTURE-001 to terminate PrivacyPatrol AI. There is no enum value, no audit log, no role-restricted RPC, and no destructive-action UX guard. This SD is the formal follow-up to FR-5 of SD-LEO-FEAT-STAGE-LAUNCH-READINESS-001 (PRD EA07B573120C scope_amendment / US-004 deferred), closing the 7th of 7 FRs from that parent SD.",

    scope:
      "IN SCOPE: (1) DB migration in EHG_Engineer — extend ventures.workflow_status enum with 'killed' (additive, no row backfill); create ventures_kill_log table (id UUID PK, venture_id FK to ventures, killed_by_user_id FK to auth.users, rationale TEXT NOT NULL CHECK length>=20, killed_at TIMESTAMPTZ, metadata JSONB) with RLS (SELECT for authenticated; INSERT only via SECURITY DEFINER RPC); RPC kill_venture(p_venture_id UUID, p_rationale TEXT) RETURNS UUID with role check (chairman|lead via auth.jwt()), updates ventures.workflow_status='killed' + killed_at + kill_reason, inserts ventures_kill_log row with killed_by_user_id=auth.uid(), emits eva_events row matching A05 chk_event_type contract. (2) Cross-repo EHG UI — LaunchGateRenderer.tsx Reject dialog: typed 'REJECT' (case-sensitive) + rationale ≥20 chars + 5s cooldown after last keystroke + destructive button styling + 403 inline error on role-check fail; vitest unit + e2e smoke. (3) A05 source-enum compliance — venture.killed eva event satisfies chk_event_type via enum extension OR custom subtype (PLAN decides). (4) Backfill PrivacyPatrol AI kill row from interim killed_at into ventures_kill_log with metadata.backfill_source='SD-LEO-FIX-REVERT-CROSS-VENTURE-001'. OUT OF SCOPE: bulk-kill UI; undo/un-kill RPC (terminal by design); replacing interim killed_at/kill_reason columns (forward-compat); kill-confirmation 2FA/MFA (typed REJECT + cooldown + role check sufficient at P3).",

    key_changes: [
      { change: "Extend ventures.workflow_status enum with 'killed' value (additive migration)", impact: "Enables formal terminal state distinct from 'failed'/'cancelled'; no existing rows touched" },
      { change: "Create ventures_kill_log table with RLS + indexes on (venture_id) and (killed_at DESC)", impact: "Append-only audit log replaces ad-hoc text fields as system of record" },
      { change: "Create kill_venture(uuid, text) SECURITY DEFINER RPC with chairman|lead role check via auth.jwt()", impact: "Single transactional entry point; prevents direct UPDATE bypassing audit log" },
      { change: "Add RLS policy on ventures_kill_log (SELECT authenticated, INSERT only via RPC)", impact: "Defense-in-depth — non-RPC writes blocked even with elevated client" },
      { change: "LaunchGateRenderer.tsx Reject dialog: typed REJECT match + ≥20-char rationale + 5s cooldown + destructive styling", impact: "User-visible terminal-state control; prevents misclick/accidental kill" },
      { change: "Vitest unit test for dialog (cooldown, exact match, error states) + e2e smoke for Stage 23 reject path", impact: "Regression coverage; PLAN gate evidence" },
      { change: "Backfill PrivacyPatrol AI kill row into ventures_kill_log with backfill_source metadata", impact: "Existing terminal venture promoted from interim columns to formal audit log" }
    ],

    key_principles: [
      "Additive migrations only (workflow_status enum extension; new ventures_kill_log table; new RPC)",
      "RLS-defended (RLS on ventures_kill_log + SECURITY DEFINER RPC + JWT role check, not metadata role)",
      "Two-gate confirm UX (typed match + ≥20-char rationale + 5s cooldown + destructive styling)",
      "Forward-compatible (interim ventures.killed_at / ventures.kill_reason columns left in place)",
      "Cross-repo coordinated (DB migration ships first as additive; UI gated on migration applied)",
      "Audit log as system of record (ventures_kill_log append-only; RPC writes mandatory)"
    ],

    strategic_objectives: [
      "Close deferred FR-5 from SD-LEO-FEAT-STAGE-LAUNCH-READINESS-001 (PRD EA07B573120C scope_amendment)",
      "Replace ad-hoc ventures.killed_at/kill_reason text-field workaround with formal terminal state + audit log",
      "Prevent unintended venture termination via two-gate confirm UX (typed REJECT + rationale + cooldown)",
      "Enforce role-based access (chairman|lead only) via RLS + SECURITY DEFINER RPC, not client-side checks",
      "Maintain A05 source-enum compliance for new venture.killed eva event"
    ],

    smoke_test_steps: [
      { step_number: 1, instruction: "Sign in to EHG as a chairman, navigate to Stage 23 (Launch Readiness) for an active venture", expected_outcome: "LaunchGateRenderer renders with Approve, Hold, and the new Reject button visible" },
      { step_number: 2, instruction: "Click Reject; type 'REJ' (incomplete) in the confirmation field, type 'Insufficient market signal' (≥20 chars) in rationale", expected_outcome: "Confirm Reject button stays disabled (typed match incomplete)" },
      { step_number: 3, instruction: "Complete the typed match to 'REJECT'; wait 5 seconds without further keystrokes", expected_outcome: "Confirm Reject button becomes enabled with destructive (red) styling after the cooldown" },
      { step_number: 4, instruction: "Click Confirm Reject", expected_outcome: "kill_venture RPC invoked; toast 'Venture rejected' shown; navigation to /ventures; venture row shows workflow_status='killed' in DB" },
      { step_number: 5, instruction: "Query ventures_kill_log for the venture", expected_outcome: "One row exists with killed_by_user_id=chairman uid, rationale matching dialog input, killed_at within last minute" },
      { step_number: 6, instruction: "Sign in as a non-chairman/non-lead user, attempt the same flow", expected_outcome: "RPC returns 403; inline UI error 'Only chairman or lead can reject a venture'; ventures_kill_log row count unchanged" }
    ],

    success_metrics: [
      { metric: "Migration idempotency", target: "Re-runs against already-applied DB report 0 changes; CI green on second apply" },
      { metric: "RPC role enforcement", target: "Non-chairman/non-lead callers receive 403; 0 rows in ventures_kill_log from those callers" },
      { metric: "UI two-gate compliance", target: "vitest covers all 3 gates (typed match, rationale length, cooldown); 0 ways to bypass in dialog" },
      { metric: "Audit log completeness", target: "ventures_kill_log row count == count of ventures.workflow_status='killed' (post-backfill)" },
      { metric: "A05 enum compliance", target: "Drift sentinel green; chk_event_type accepts the new venture.killed event type" },
      { metric: "Cross-repo PR coordination", target: "DB migration PR (EHG_Engineer) merges and applies BEFORE UI PR (EHG); 0 instances of UI calling RPC that doesn't exist yet" },
      { metric: "LEAD-FINAL gate", target: "≥85% (feature SD threshold)" }
    ],

    scope_reduction_percentage: 35,

    metadata_addendum: {
      scope_reduction_audit: {
        deletion_audit_q8: "4 explicit OUT OF SCOPE items cut from initial ask",
        cuts: [
          "Bulk-kill UI (multi-venture termination) — not a chairman ask yet; YAGNI",
          "Undo / un-kill RPC — terminal by design; reversal would need retention-policy review",
          "Replacing interim ventures.killed_at / kill_reason columns — left in place for forward-compat",
          "2FA/MFA challenge for kill-confirmation — typed REJECT + 5s cooldown + role check sufficient at P3"
        ],
        estimated_loc_saved: "~600 LOC (bulk UI + undo RPC + 2FA flow + interim-column migration)",
        approximate_reduction: "35%"
      }
    }
  };

  const { data: existing } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', sdKey)
    .single();

  const mergedMetadata = {
    ...(existing?.metadata || {}),
    ...enrichment.metadata_addendum
  };

  const updatePayload = {
    rationale: enrichment.rationale,
    scope: enrichment.scope,
    key_changes: enrichment.key_changes,
    key_principles: enrichment.key_principles,
    strategic_objectives: enrichment.strategic_objectives,
    smoke_test_steps: enrichment.smoke_test_steps,
    success_metrics: enrichment.success_metrics,
    scope_reduction_percentage: enrichment.scope_reduction_percentage,
    metadata: mergedMetadata
  };

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update(updatePayload)
    .eq('sd_key', sdKey)
    .select('sd_key, scope_reduction_percentage')
    .single();

  if (error) {
    console.error('Update failed:', error);
    process.exit(1);
  }
  console.log('Enrichment applied:', JSON.stringify(data, null, 2));
})();
