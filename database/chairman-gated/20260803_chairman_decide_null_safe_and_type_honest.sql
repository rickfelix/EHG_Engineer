-- SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-003 — FR-1 (null-safe resolve) + FR-2 (type-honest semantics)
--
-- STAGED, NOT APPLIED. CREATE OR REPLACE on a permission-class SECURITY-DEFINER-adjacent RPC is
-- TIER-2 under the tiered auto-apply policy. The builder stages; only the chairman applies, via
-- the 3-factor ceremony (--prod-deploy + single-use token + an @approved-by header matching
-- git config user.email).
--
-- @approved-by: codestreetlabs@gmail.com
-- (Approver header added 2026-08-04 ~07:2x ET at the chairman's own apply session, his terminal,
-- his direction. Approval basis: his three recorded decisions of 2026-08-03 — captures 38b8ecd3 /
-- 87786335 / 5e229e42 — exist SOLELY to be applied by this function fix; applying it is the
-- execution of decisions he already made.)
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- WHY THIS EXISTS
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- The chairman could not record a reject through the canonical path, live, 2026-08-03. Measured
-- against the live database (pg_get_functiondef, captured at
-- docs/chairman-decision-queue-capture-2026-08-03/fn_chairman_decide.LIVE.sql:21):
--
--   FROM chairman_decisions cd
--   JOIN ventures v ON v.id = cd.venture_id     <-- INNER. A venture-less row matches NOTHING.
--
-- Result: NOT_FOUND, and the row is structurally undecidable. Four of six currently-pending rows
-- carry venture_id NULL.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- WHY THE FIX IS HERE AND NOT IN THE EASIER PLACE
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- approve_chairman_decision is ALREADY venture-less capable, SECURITY DEFINER and auth-checked,
-- so routing venture-less decisions to it looks like the smaller change. It is not equivalent:
-- measured on the live definition, it writes NO audit row and does NOT participate in
-- trg_chairman_decision_unblock. Rerouting would drop both — and would fail INVISIBLY, because the
-- decision would still record. The loss surfaces weeks later as "the unblock never fired", with no
-- error anywhere. So the canonical RPC is fixed in place.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- FR-2 IS A REMEDIATION, NOT A PRECAUTION — THE DEFECT IS ALREADY IN THE DATA
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- The old line was:
--     v_decision_value := CASE p_action WHEN 'approved' THEN 'proceed' WHEN 'rejected' THEN 'kill' END;
-- Every reject wrote 'kill' regardless of decision_type. 'kill' targets a VENTURE. Live rows that
-- already carry it against non-venture types: session_question x4, outbound_publish_approval x1.
-- Any venture-less reject made today would add to that count.
--
-- THOSE FIVE ROWS ARE DELIBERATELY NOT REWRITTEN HERE. They are recorded history; silently
-- rewriting a chairman decision after the fact is a worse defect than the one being fixed. If they
-- should be corrected, that is a separate, visible decision.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- THE TWO AXES ARE INDEPENDENT (Solomon design note 1, advisory 630790f3)
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--   NULL-SAFETY keys on the COLUMN     (venture_id nullability)  -> the LEFT JOIN + guards below
--   SEMANTICS  keys on decision_type   (what kind of decision)   -> fn_chairman_decision_value()
-- A framing_escalation could in principle carry a venture; a data-bug chairman_approval could
-- arrive venture-less. Merging both into one `venture_id IS NULL` predicate is the thing this SD
-- exists to prevent, so they are implemented as two separate mechanisms that never consult each
-- other.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- WHY AN UNMAPPED TYPE RAISES RATHER THAN DEFAULTING
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- The SD enumerates two decision_types. The live table carries EIGHTEEN. A mapping written from
-- the SD would cover 2 of 18, and a silent default is exactly how a future type quietly acquires
-- someone else's semantics — which is the defect above, one iteration later. Raising is what makes
-- the sixteen unenumerated types safe without having to enumerate them perfectly today.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- FR-2: semantics by decision_type. Pure, so it can be unit-tested without touching a row.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Mappings below are taken from vocabulary the system ALREADY SPEAKS (observed live
-- (decision_type, decision) pairs), not invented: session_question already uses
-- approve/cancel/complete/go/pending/proceed; gate_failure_escalation uses cancel/go/pending/
-- proceed; gate_override uses approve/override; review uses go/pending/proceed. Every value below
-- is inside chairman_decisions_decision_check (29 permitted values).
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
      'vision_approval', 'strategy_selection', 'product_review', 'distribution_block'
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

    ELSE NULL   -- caller raises; see below.
  END;
END;
$function$;

COMMENT ON FUNCTION public.fn_chairman_decision_value(text, text) IS
  'SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-003 FR-2. Maps (decision_type, action) -> a decision value '
  'inside chairman_decisions_decision_check. Keys on TYPE ONLY and never on venture_id nullability '
  '- the two axes are independent. Returns NULL for an unmapped type so the caller can RAISE; a '
  'silent default is how a new type acquires another type''s semantics.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- FR-1: null-safe resolve.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_chairman_decide(
  p_decision_id uuid,
  p_action      text,
  p_decided_by  text,
  p_rationale   text DEFAULT NULL::text,
  p_force_stale boolean DEFAULT false
) RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_decision RECORD;
  v_rows_updated INT;
  v_decision_value TEXT;
  v_is_kill_gate BOOLEAN;
  v_has_venture BOOLEAN;
BEGIN
  IF p_action NOT IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action. Must be approved or rejected.', 'code', 'INVALID_ACTION');
  END IF;

  -- FR-1: LEFT JOIN. This is the whole null-safety fix; everything below is making the
  -- consequences of a NULL venture EXPLICIT rather than incidental.
  SELECT cd.*, v.updated_at AS venture_updated_at, v.name AS venture_name
  INTO v_decision
  FROM chairman_decisions cd
  LEFT JOIN ventures v ON v.id = cd.venture_id
  WHERE cd.id = p_decision_id
  FOR UPDATE OF cd;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Decision not found.', 'code', 'NOT_FOUND');
  END IF;

  v_has_venture := v_decision.venture_id IS NOT NULL;

  IF v_decision.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Decision already %s by %s at %s.', v_decision.status, COALESCE(v_decision.decided_by, 'unknown'), v_decision.updated_at),
      'code', 'ALREADY_DECIDED',
      'current_status', v_decision.status,
      'decided_by', v_decision.decided_by,
      'decided_at', v_decision.updated_at
    );
  END IF;

  -- FR-2: semantics from TYPE, never from nullability. Unmapped raises rather than defaulting.
  v_decision_value := public.fn_chairman_decision_value(v_decision.decision_type, p_action);
  IF v_decision_value IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('decision_type "%s" has no semantic mapping. Add it to fn_chairman_decision_value rather than letting it inherit another type''s meaning.', v_decision.decision_type),
      'code', 'UNMAPPED_DECISION_TYPE',
      'decision_type', v_decision.decision_type
    );
  END IF;

  -- STALE_CONTEXT is a VENTURE-state check, so it is now gated on venture presence EXPLICITLY.
  -- Previously it read `venture_updated_at > created_at`, which under a LEFT JOIN evaluates to
  -- NULL for a venture-less row and is therefore not TRUE — the right outcome by accident. Relying
  -- on three-valued logic for a guard means the next reader must re-derive it to trust it.
  IF v_has_venture AND NOT p_force_stale AND v_decision.venture_updated_at > v_decision.created_at THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Venture "%s" state has changed since this decision was created. Review updated state before deciding.', v_decision.venture_name),
      'code', 'STALE_CONTEXT',
      'decision_created_at', v_decision.created_at,
      'venture_updated_at', v_decision.venture_updated_at,
      'venture_name', v_decision.venture_name
    );
  END IF;

  -- Write the COMPLETE triple — status AND decision AND blocking (preserved from the live version).
  UPDATE chairman_decisions
  SET status = p_action, decision = v_decision_value, blocking = false, decided_by = p_decided_by, rationale = COALESCE(p_rationale, rationale)
  WHERE id = p_decision_id AND status = 'pending';
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Decision was modified by another session.', 'code', 'CONCURRENT_MODIFICATION');
  END IF;

  -- The reject path touches ventures THREE times, and only the third genuinely needed a guard.
  -- The two UPDATEs are NULL-predicate no-ops, but PERFORM fn_write_kill_audit_trail(NULL, ...)
  -- would pass a NULL venture into the audit helper — either a constraint failure or a meaningless
  -- kill-audit row. The whole block is therefore branched on venture presence rather than left to
  -- no-op its way through.
  IF p_action = 'rejected' AND v_has_venture THEN
    v_is_kill_gate := v_decision.lifecycle_stage = ANY (ARRAY[3, 5, 13, 23]);
    IF v_is_kill_gate THEN
      UPDATE ventures
      SET status = 'cancelled', workflow_status = 'killed', killed_at = now(), kill_reason = p_rationale, updated_at = now()
      WHERE id = v_decision.venture_id;
    ELSE
      UPDATE ventures
      SET status = 'cancelled', updated_at = now()
      WHERE id = v_decision.venture_id;
    END IF;

    PERFORM public.fn_write_kill_audit_trail(
      v_decision.venture_id, v_decision.lifecycle_stage, p_rationale, auth.uid(), 'fn_chairman_decide', p_decision_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'decision_id', p_decision_id,
    'action', p_action,
    'decision', v_decision_value,
    'blocking', false,
    'decided_by', p_decided_by,
    'venture_name', v_decision.venture_name,   -- NULL for venture-less rows, truthfully
    'venture_less', NOT v_has_venture
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_chairman_decide(uuid, text, text, text, boolean) IS
  'SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-003. LEFT JOIN so venture-less decisions resolve (the '
  'chairman could not record a reject, live, 2026-08-03). Semantics come from '
  'fn_chairman_decision_value(decision_type, action) - NEVER from venture_id nullability. Audit '
  'trail and trg_chairman_decision_unblock participation are preserved deliberately: the '
  'already-venture-less-capable approve_chairman_decision has neither, which is why venture-less '
  'rows are NOT rerouted to it.';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- ROLLBACK: re-apply the captured pre-change definition, committed at
-- docs/chairman-decision-queue-capture-2026-08-03/fn_chairman_decide.LIVE.sql, and
-- DROP FUNCTION public.fn_chairman_decision_value(text, text);
-- The capture is the authority for rollback — not this file, and not the 20260628 migration.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
