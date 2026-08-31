-- SD-LEO-INFRA-CHAIRMAN-DECIDE-MIGRATION-001 (escalated from QF-20260831-310)
--
-- STAGED, NOT APPLIED. CREATE OR REPLACE on a shared decision-verb RPC
-- (fn_chairman_decision_value, consulted by fn_chairman_decide) is Tier-2 under this repo's
-- CREATE-OR-REPLACE apply policy. The builder stages; only the chairman applies, via the
-- 3-factor ceremony (--prod-deploy + single-use token + an @approved-by header matching
-- git config user.email).
--
-- @approved-by: <pending -- apply via the chairman's 3-factor ceremony>
--
-- requires-chairman-apply
--
-- APPLY NOTE (SECURITY EXEC review, evidence 9cfc41ed): this file lives under
-- database/chairman-gated/, not database/migrations/ -- apply-migration.js's path fence rejects
-- it unless the apply command also passes --allow-any-path (in addition to --prod-deploy, the
-- single-use token, and a filled-in @approved-by header). Omitting that flag fails with a
-- "path outside database/migrations/" error that reads like a missing file, not a guard.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- WHY THIS EXISTS
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- SD-LEO-INFRA-COMPLETED-UNAPPLIED-MIGRATION-001 shipped the decision_type='migration_apply'
-- MINTER (scripts/modules/handoff/executors/lead-final-approval/gates.js:1800) without ever
-- registering the type with the CLOSER (fn_chairman_decision_value). Measured live 2026-08-31
-- (direct RPC probe): fn_chairman_decision_value('migration_apply', 'approved'|'rejected') both
-- return NULL, so fn_chairman_decide refuses every migration_apply row with UNMAPPED_DECISION_TYPE
-- and no row of this type can ever be closed through the canonical path.
--
-- Exactly one live row carries this type: af7d6a00-295e-465f-a99c-414dc4aca283, status=pending,
-- venture_id=NULL, created 2026-08-30T03:36:30Z. Its brief_data.context confirms the underlying
-- migration (database/chairman-gated/20260829_reject_path_type_aware_and_live_kill_gate.sql) was
-- already APPLIED by chairman ceremony 2026-08-30 14:57Z -- the row is stuck for a tooling reason
-- only, not because any decision is genuinely unresolved. Closing it is a documented follow-up
-- (this SD's FR-3), executed once this migration applies -- not attempted here.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- WHY THE APPROVAL-SHAPED BUCKET (approved->'approve', rejected->'reject'), NOT VENTURE-SCOPED
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- migration_apply's one live row has venture_id=NULL. The venture-scoped bucket writes 'kill' on
-- reject -- the exact null-venture-writes-a-venture-verb defect
-- SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-003 FR-2 already fixed once (fn_chairman_decide's
-- null-safe LEFT JOIN). migration_apply is the chairman granting or withholding permission for a
-- staged SQL change to apply -- the same shape as its nearest sibling ddl_approval (and
-- gate_approval/outbound_publish_approval/ratified_deviation, all already in this bucket).
-- Confirmed constraint-safe: chairman_decisions_decision_check permits both 'approve' and
-- 'reject'. Confirmed no consumer breaks: a full grep of every trigger/view/script that reads the
-- decision column found zero references keyed on decision_type='migration_apply' or on the
-- approval-shaped bucket's specific verb strings.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- WHY THIS FILE IS BASED ON THE LIVE 20260823 BODY, NOT THE OLDER 20260803 ONE
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- database/migrations/20260823_add_thesis_kill_tier_b_to_decision_value.sql is the LIVE function
-- body (confirmed via direct RPC probe 2026-08-31: fn_chairman_decision_value('thesis_kill_tier_b',
-- 'approved') returns 'proceed', matching the 20260823 mapping, NOT NULL as the older 20260803
-- file would produce). Copying the 20260803 file's body here would silently REVERT
-- thesis_kill_tier_b and distribution_skip to unmapped, regressing a shipped, tested capability
-- (tests/unit/eva-decisions-exit-wiring.test.js) and re-arming exactly what
-- SD-LEO-INFRA-MINUS-PATH-INTEGRITY-001 FR-3 existed to prevent. This migration is purely
-- additive on top of the 20260823 body: one new decision_type joins the existing
-- APPROVAL-SHAPED IN-list. No other branch, no other function, changes.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- ROLLBACK
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Re-apply the pre-change body captured live via pg_get_functiondef 2026-08-31 (identical to
-- database/migrations/20260823_add_thesis_kill_tier_b_to_decision_value.sql's CREATE OR REPLACE
-- body verbatim -- that file remains the authoritative rollback target, not this file). An
-- incorrectly-applied version of THIS migration is remediated by staging a corrective
-- CREATE OR REPLACE via the same chairman ceremony -- never by hand-editing chairman_decisions
-- rows.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_chairman_decision_value(
  p_decision_type text,
  p_action        text
) RETURNS text
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path TO 'public'
AS $function$
BEGIN
  IF p_action NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'fn_chairman_decision_value: invalid action %', p_action
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  RETURN CASE
    -- VENTURE-SCOPED types: 'kill' is honest here because a venture is what gets killed.
    -- 'thesis_kill_tier_b' and 'distribution_skip' added 2026-08-23
    -- (SD-LEO-INFRA-MINUS-PATH-INTEGRITY-001 FR-3) -- see that migration's header for why.
    WHEN p_decision_type IN (
      'venture_disposition', 'stage_gate', 'launch_gate', 'gate_decision',
      'vision_approval', 'strategy_selection', 'product_review', 'distribution_block',
      'thesis_kill_tier_b', 'distribution_skip'
    ) THEN CASE p_action WHEN 'approved' THEN 'proceed' ELSE 'kill' END

    -- APPROVAL-SHAPED types: the chairman is granting or withholding permission, not ending a
    -- venture. 'reject' is the honest counterpart to 'approve'.
    -- 'migration_apply' added 2026-08-31 (SD-LEO-INFRA-CHAIRMAN-DECIDE-MIGRATION-001) -- see this
    -- migration's header for why.
    WHEN p_decision_type IN (
      'ddl_approval', 'gate_approval', 'outbound_publish_approval', 'ratified_deviation',
      'migration_apply'
    ) THEN CASE p_action WHEN 'approved' THEN 'approve' ELSE 'reject' END

    -- OVERRIDE: approving IS the override; declining leaves the original verdict standing.
    WHEN p_decision_type = 'gate_override'
      THEN CASE p_action WHEN 'approved' THEN 'override' ELSE 'reject' END

    -- QUESTION / REVIEW / ESCALATION types: nothing is killed, the item is answered or dropped.
    WHEN p_decision_type IN (
      'session_question', 'review', 'portfolio_review',
      'framing_escalation', 'gate_failure_escalation'
    ) THEN CASE p_action WHEN 'approved' THEN 'proceed' ELSE 'cancel' END

    ELSE NULL   -- caller raises; see fn_chairman_decide.
  END;
END;
$function$;

COMMENT ON FUNCTION public.fn_chairman_decision_value(text, text) IS
  'SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-003 FR-2 + SD-LEO-INFRA-MINUS-PATH-INTEGRITY-001 FR-3 + '
  'SD-LEO-INFRA-CHAIRMAN-DECIDE-MIGRATION-001. Maps (decision_type, action) -> a decision value '
  'inside chairman_decisions_decision_check. Keys on TYPE ONLY and never on venture_id nullability '
  '- the two axes are independent. Returns NULL for an unmapped type so the caller can RAISE; a '
  'silent default is how a new type acquires another type''s semantics.';

COMMIT;
