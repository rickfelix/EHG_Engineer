-- SD-LEO-INFRA-MINUS-PATH-INTEGRITY-001 (FR-3, EXEC-discovered gaps, 2026-08-23)
--
-- STAGED, NOT APPLIED. fn_chairman_decision_value is a Tier-2 RPC under this repo's
-- CREATE-OR-REPLACE apply policy (--prod-deploy + single-use token + an @approved-by header
-- matching git config user.email -- same policy documented at
-- database/chairman-gated/20260803_chairman_decide_null_safe_and_type_honest.sql). SECURITY
-- EXEC-TO-PLAN review (2026-08-23) corrected this file's original "SECURITY-DEFINER-adjacent"
-- framing: the live function has prosecdef=false (SECURITY INVOKER, not DEFINER) -- Tier-2
-- status here is about CREATE-OR-REPLACE on a shared decision-verb RPC, not a SECURITY DEFINER
-- privilege boundary. The over-classification erred toward MORE ceremony, not less, so it did
-- not change the safe outcome, but the language is corrected for accuracy.
--
-- @approved-by: <pending -- apply via the chairman's 3-factor ceremony>
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- WHY THIS EXISTS
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- FR-3 (this SD) routes scripts/eva-decisions.js's approveDecision()/rejectDecision() through
-- fn_chairman_decision_value() instead of an unconditional hardcoded 'proceed'/'kill' pair, and
-- fails LOUDLY (never writes decision=NULL) when a decision_type has no mapping -- by design,
-- matching this function's own stated philosophy ("Add it to fn_chairman_decision_value rather
-- than letting it inherit another type's meaning").
--
-- Verified live via a direct RPC probe (2026-08-23): 'thesis_kill_tier_b' -- the decision_type
-- lib/eva/lifecycle/exit-wiring.js's THESIS_KILL_DECISION_TYPE constant uses to trigger
-- SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-H's exit-init marker on approval -- is ALSO outside
-- the function's mapping (returns NULL for both 'approved' and 'rejected'), independently of the
-- 3 unmapped types (plan_go, security_ratification, platform_ruling) the PLAN-phase review
-- measured. Without this fix, FR-3's fail-loud behavior would regress a live, tested exit-wiring
-- capability the moment it is ever exercised (0 live chairman_decisions rows carry this type
-- today, but the capability is shipped and covered by
-- tests/unit/eva-decisions-exit-wiring.test.js).
--
-- SECURITY EXEC-TO-PLAN review (SEC-PATH-002, 2026-08-23) additionally found 'distribution_skip'
-- (lib/eva/stage-templates/analysis-steps/stage-22-distribution-setup.js's SKIP_DECISION_TYPE) is
-- ALSO unmapped. Its sibling type 'distribution_block' is already in the VENTURE-SCOPED branch
-- below; the S21 consumer's APPROVED_DECISIONS allowlist accepts 'proceed' among other legacy
-- verbs, so the pre-FR-3 unconditional proceed/kill pair remains a correct, non-guessed mapping.
-- SECURITY's census additionally found ~19 MORE decision_types minted into chairman_decisions
-- (directly, or via lib/chairman/record-pending-decision.mjs's shared helper) that are ALSO
-- unmapped and NOT individually triaged here -- each requires the same "vocabulary the system
-- already speaks" analysis this function's original 18-type mapping and the two additions above
-- went through, which is deliberately NOT attempted for the remaining set without a verified
-- downstream-consumer expectation (guessing a verb is exactly the class of error FR-3 exists to
-- prevent). Documented as an explicit, named follow-on -- not silently fixed here, not silently
-- dropped. See scripts/eva-decisions.js's JS_SIDE_VERB_BRIDGE comment for the full census.
--
-- Until this migration is applied, scripts/eva-decisions.js bridges 'thesis_kill_tier_b' and
-- 'distribution_skip' with a narrow JS-side carve-out (JS_SIDE_VERB_BRIDGE, matching the exact
-- mapping added here) so neither capability regresses in the meantime. That carve-out should be
-- removed once this migration lands.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- WHY THIS MAPPING (VENTURE-SCOPED: approved->'proceed', rejected->'kill')
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Matches the exact pair every decision_type got unconditionally under the pre-FR-3 hardcode --
-- zero behavior change for either type. Also matches the semantics of the function's existing
-- VENTURE-SCOPED branch (venture_disposition, stage_gate, launch_gate, gate_decision,
-- vision_approval, strategy_selection, product_review, distribution_block): a venture is what
-- gets killed, and approving a thesis-kill decision (i.e. the chairman agreeing the thesis should
-- be killed) is what actually initiates the venture's exit path -- 'proceed' on approval is the
-- honest verb for "act on this decision", not an endorsement of the venture continuing.
-- 'distribution_skip' is the direct sibling of the already-mapped 'distribution_block' (same
-- file, same S21 consumer, same APPROVED_DECISIONS check) -- same bucket, same reasoning. No
-- other code path reads the `decision` column value for either type (only decision_type and
-- status are read by onDecisionApproved for thesis_kill_tier_b; distribution_skip's only
-- consumer checks membership in a multi-verb allowlist that already includes 'proceed') --
-- confirmed by a full-repo grep, 2026-08-23.
--
-- Purely additive: widens one IN-list inside an existing CASE branch. No other branch, no other
-- function, changes.

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
    -- (SD-LEO-INFRA-MINUS-PATH-INTEGRITY-001 FR-3) -- see this migration's header for why.
    WHEN p_decision_type IN (
      'venture_disposition', 'stage_gate', 'launch_gate', 'gate_decision',
      'vision_approval', 'strategy_selection', 'product_review', 'distribution_block',
      'thesis_kill_tier_b', 'distribution_skip'
    ) THEN CASE p_action WHEN 'approved' THEN 'proceed' ELSE 'kill' END

    -- APPROVAL-SHAPED types: the chairman is granting or withholding permission, not ending a
    -- venture. 'reject' is the honest counterpart to 'approve'.
    WHEN p_decision_type IN (
      'ddl_approval', 'gate_approval', 'outbound_publish_approval', 'ratified_deviation'
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
  'SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-003 FR-2 + SD-LEO-INFRA-MINUS-PATH-INTEGRITY-001 FR-3. '
  'Maps (decision_type, action) -> a decision value inside chairman_decisions_decision_check. '
  'Keys on TYPE ONLY and never on venture_id nullability - the two axes are independent. Returns '
  'NULL for an unmapped type so the caller can RAISE; a silent default is how a new type acquires '
  'another type''s semantics.';

COMMIT;
