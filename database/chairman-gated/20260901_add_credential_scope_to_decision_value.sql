-- Chairman decision 2 (approved by verified SMS 9c0083e2, 2026-09-01T00:5xZ: "Approve")
-- Staged by adam a78170fa; ratified follow-up of ruling 4a473166 (UAT mail-fetch credential
-- scope: Option A fenced mailbox + portfolio-wide rider, decided verbally 2026-08-31).
--
-- STAGED, NOT APPLIED. CREATE OR REPLACE on the shared decision-verb RPC is Tier-2 under this
-- repo's apply policy: the builder stages; only the chairman applies, via the 3-factor ceremony
-- (--prod-deploy + single-use token + an @approved-by header matching git config user.email).
--
-- @approved-by: codestreetlabs@gmail.com
--
-- requires-chairman-apply
--
-- APPLY NOTE: this file lives under database/chairman-gated/ -- apply-migration.js's path fence
-- rejects it unless the apply command also passes --allow-any-path (plus --prod-deploy, the
-- single-use token, and the filled-in @approved-by header).
--
-- WHY: the creation path mints decision_type='credential_scope' rows (live specimen 4a473166,
-- pending since 2026-08-31) but fn_chairman_decision_value was never taught the type, so
-- fn_chairman_decide refuses UNMAPPED_DECISION_TYPE and no credential_scope row can close through
-- the canonical path. The chairman ALREADY DECIDED 4a473166 verbally (Option A + portfolio rider,
-- captured 2026-08-31) -- the row is stuck for a tooling reason only. Same defect class and same
-- fix shape as migration_apply (20260831_add_migration_apply_to_decision_value.sql, applied by
-- ceremony 2026-08-31); this file is purely additive on top of that APPLIED body: credential_scope
-- joins the APPROVAL-SHAPED bucket (the chairman grants or withholds a credential-scope choice --
-- nothing is killed; 'approve'/'reject' are honest verbs; constraint-safe under
-- chairman_decisions_decision_check).
--
-- FOLLOW-UP once applied (same session): close 4a473166 through fn_chairman_decide
-- (p_action='approved', rationale = the captured Option A ruling), then readback status.

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
    WHEN p_decision_type IN (
      'venture_disposition', 'stage_gate', 'launch_gate', 'gate_decision',
      'vision_approval', 'strategy_selection', 'product_review', 'distribution_block',
      'thesis_kill_tier_b', 'distribution_skip'
    ) THEN CASE p_action WHEN 'approved' THEN 'proceed' ELSE 'kill' END

    -- APPROVAL-SHAPED types: the chairman grants or withholds permission.
    -- 'credential_scope' added 2026-09-01 (this migration) -- see header.
    WHEN p_decision_type IN (
      'ddl_approval', 'gate_approval', 'outbound_publish_approval', 'ratified_deviation',
      'migration_apply', 'credential_scope'
    ) THEN CASE p_action WHEN 'approved' THEN 'approve' ELSE 'reject' END

    -- OVERRIDE: approving IS the override; declining leaves the original verdict standing.
    WHEN p_decision_type = 'gate_override'
      THEN CASE p_action WHEN 'approved' THEN 'override' ELSE 'reject' END

    -- QUESTION / REVIEW / ESCALATION types: the item is answered or dropped.
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
  'SD-LEO-INFRA-CHAIRMAN-DECIDE-MIGRATION-001 + credential_scope (2026-09-01, chairman-approved '
  'staging). Maps (decision_type, action) -> a decision value inside '
  'chairman_decisions_decision_check. Keys on TYPE ONLY and never on venture_id nullability. '
  'Returns NULL for an unmapped type so the caller can RAISE; a silent default is how a new type '
  'acquires another type''s semantics.';

COMMIT;
