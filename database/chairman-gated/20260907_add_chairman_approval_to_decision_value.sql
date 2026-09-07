-- SD-LEO-INFRA-CHAIRMAN-DECISION-VALUE-001 FR-1.
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
-- WHY: the chairman approved a permissions-fix decision by his own keystroke, verified by
-- independent readback (specimen 2026-09-07 ~12:2xZ), then closing the covering decision
-- (live row 644a861f, decision_type='chairman_approval') returned:
--   DECIDE_ERR: fn_chairman_decide refused: decision_type "chairman_approval" has no semantic
--   mapping. Add it to fn_chairman_decision_value rather than letting it inherit another type
--   meaning.
-- fn_chairman_decision_value's CASE never had a chairman_approval branch -- 18 decision types
-- were mapped, chairman_approval was not one of them. Root cause (LEAD-phase Explore evidence,
-- id c413aa94-a2ff-4c6c-986d-95ab22d9b1b3): lib/chairman/classifier-denial-guard.mjs, which
-- mints chairman_approval rows, wrongly cited decision-retirement.mjs's armOf() (an unrelated
-- concept -- the chairman_pending_decisions UNION-view arm classifier) as proof the type was
-- already mapped here. It never was.
--
-- NOTE ON SCOPE: migration_apply is NOT touched by this migration -- it was already added to the
-- approval-shaped bucket by 20260831_add_migration_apply_to_decision_value.sql (applied
-- 2026-08-31) and remains live/correct. This migration is purely additive on top of that and the
-- 20260901_add_credential_scope_to_decision_value.sql body (applied): chairman_approval joins the
-- APPROVAL-SHAPED bucket -- the chairman grants or withholds approval, nothing is killed;
-- 'approve'/'reject' are honest verbs; constraint-safe under chairman_decisions_decision_check.
--
-- FOLLOW-UP once applied (same session): close 644a861f through fn_chairman_decide
-- (p_action='approved'), then readback status.

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
    -- 'chairman_approval' added 2026-09-07 (this migration) -- see header.
    WHEN p_decision_type IN (
      'ddl_approval', 'gate_approval', 'outbound_publish_approval', 'ratified_deviation',
      'migration_apply', 'credential_scope', 'chairman_approval'
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
  'SD-LEO-INFRA-CHAIRMAN-DECIDE-MIGRATION-001 + credential_scope (2026-09-01) + chairman_approval '
  '(2026-09-07, SD-LEO-INFRA-CHAIRMAN-DECISION-VALUE-001). Maps (decision_type, action) -> a '
  'decision value inside chairman_decisions_decision_check. Keys on TYPE ONLY and never on '
  'venture_id nullability. Returns NULL for an unmapped type so the caller can RAISE; a silent '
  'default is how a new type acquires another type''s semantics.';

COMMIT;
