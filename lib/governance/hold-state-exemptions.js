/**
 * Hold-state contract exemptions registry — SD-LEO-INFRA-HOLD-STATE-CONTRACT-001 (FR-2).
 *
 * The shared hold-state writer (lib/governance/hold-state-contract.js) can only
 * validate writes that go THROUGH application code. Two DB-level writers touch
 * strategic_directives_v2.status directly and bypass any JS-level writer
 * entirely — this is a structural fact of Postgres triggers/RPCs, not
 * something a JS library can intercept. Rather than silently missing this
 * gap, each is recorded here as a NAMED, OWNED exemption with the evidence
 * that it cannot create or interfere with a hold in the contract's sense
 * (a status='deferred' park, or an exec_boundary_hold metadata write).
 *
 * Both exemptions were verified by reading the FULL function/trigger body
 * line-for-line (not inferred from a status-value grep) during PLAN/EXEC of
 * this SD:
 *
 * 1. auto_transition_status() trigger
 *    (supabase/ehg_engineer/migrations/20250927080959_schema_add_status_automation.sql)
 *    Can only ever set NEW.status to 'pending_verification' | 'pending_approval' |
 *    'completed' (the 3 IF/ELSIF branches), gated by validate_status_transition()
 *    against status_transition_rules, whose seeded rows never list 'deferred' as
 *    either from_status or to_status. It never touches the `metadata` column.
 *    CANNOT write a park (status='deferred'), CANNOT touch exec_boundary_hold or
 *    any other metadata-held hold, and this ALREADY informed lib/sd-park.js's
 *    own progress-normalization guard (its `edge` logic) as a belt-and-suspenders,
 *    not because this trigger could otherwise flip a parked SD.
 *
 * 2. complete_orchestrator_sd() RPC
 *    (database/migrations/20260712_orchestrator_ghost_complete_lead_final.sql —
 *    STAGED, not yet chairman-applied at the time of this SD)
 *    Its only two UPDATE statements set status to 'pending_approval' or
 *    'completed'; neither writes 'deferred' and neither touches `metadata` at
 *    all. CANNOT write a park and CANNOT strip an exec_boundary_hold stamp.
 *
 * Owner: coordinator (per this SD's LEAD-locked scope). Re-verify this
 * registry any time either migration file is edited (see the pin test in
 * tests/unit/governance/hold-state-exemptions.test.js, which greps the live
 * source for the specific patterns this analysis depends on).
 */

export const HOLD_STATE_DB_LEVEL_EXEMPTIONS = [
  {
    name: 'auto_transition_status_trigger',
    file: 'supabase/ehg_engineer/migrations/20250927080959_schema_add_status_automation.sql',
    reason: 'Trigger can only set status to pending_verification|pending_approval|completed, gated by a rules table with no deferred from/to_status row; never touches metadata.',
    owner: 'coordinator',
  },
  {
    name: 'complete_orchestrator_sd_rpc',
    file: 'database/migrations/20260712_orchestrator_ghost_complete_lead_final.sql',
    reason: 'Its two UPDATE statements only ever write pending_approval or completed; neither touches metadata.',
    owner: 'coordinator',
  },
];

export default { HOLD_STATE_DB_LEVEL_EXEMPTIONS };
