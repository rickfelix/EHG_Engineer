-- @chairman-gated
-- SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001 FR-5 -- a DB-level last-line defense on
-- venture_channel_publish_ledger, independent of application code, per Solomon's amended
-- design (coordinator directive 7c1c6622): "one DB trigger on the outbound ledger... refuses
-- rows for a venture below go-live, so the guard lives in the absence of a send path, not in
-- a sentence."
--
-- This does NOT replace the application-level gate (assertOutreachAuthorized() in
-- lib/governance/stage-gate-predicate.js, called from checkPublishAuthorization()) -- that
-- remains the PRIMARY enforcement point and the only one that can also fetch/log rich context.
-- This trigger exists so that a bug in application code, a future code path that forgets to
-- call the JS gate, or a direct/manual insert cannot silently write an outbound-send ledger
-- row for a venture that has not gone live.
--
-- PREDICATE (mirrors assertOutreachAuthorized()'s positive shape exactly): a row may be
-- inserted only if the linked venture resolves AND is_demo=false AND status='active' AND
-- current_lifecycle_stage>=24 AND launch_mode='live' -- UNLESS a consumed chairman override
-- exists for this exact (venture_id, channel_type:content_ref) pair, reconstructing the same
-- override_key the application layer uses (checkPublishAuthorization's actorId is
-- `${channelType}:${contentId}`, and this table's own channel_type/content_ref columns are
-- exactly those two values on the row being inserted).
--
-- SCOPE: fires on INSERT only. UPDATE is not gated here -- the only production UPDATE path on
-- this table is recordPublishOutcome() (setting outcome/outcome_ref on an already-accepted
-- row), which does not create new send authority and is out of scope for this gate.
--
-- KNOWN LIMITATION, documented not silently absorbed: content_ref is nullable on this table;
-- a NULL content_ref reconstructs the override_key as '<channel_type>:' (empty suffix), which
-- will not match an application-side override minted with a real contentId. This is an edge
-- case with zero real overrides recorded against it today (0 rows in chairman_decisions with
-- decision_type='stage_gate_override') and does not weaken the primary predicate -- it only
-- means the override escape hatch may not reach a NULL-content_ref row.
--
-- @approved-by: codestreetlabs@gmail.com
--   Chairman verification NOT yet obtained. This file is staged only -- per coordinator
--   directive 7c1c6622: LEAD-FINAL-APPROVAL for this SD waits on the chairman ceremony apply.
--
-- Rollback: 20260912_venture_channel_publish_ledger_outbound_gate_trigger_DOWN.sql
--
-- NOTE: no top-level BEGIN/COMMIT -- scripts/apply-migration.js wraps the whole file in its
-- own transaction (this directory's established convention).

CREATE OR REPLACE FUNCTION check_venture_channel_publish_ledger_outbound_gate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_venture RECORD;
  v_override_key TEXT;
  v_has_override BOOLEAN;
BEGIN
  SELECT is_demo, status, current_lifecycle_stage, launch_mode
    INTO v_venture
    FROM ventures
   WHERE id = NEW.venture_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OUTBOUND_GATE_REJECTED: venture % does not resolve', NEW.venture_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_venture.is_demo IS NOT FALSE
     OR v_venture.status IS DISTINCT FROM 'active'
     OR v_venture.current_lifecycle_stage IS NULL
     OR v_venture.current_lifecycle_stage < 24
     OR v_venture.launch_mode IS DISTINCT FROM 'live'
  THEN
    -- One-shot chairman override escape hatch, mirroring the application layer's own
    -- override_key = `${channelType}:${contentId}` scoping.
    --
    -- MEASURED (2026-09-12): chairman_decisions.override_key does NOT exist in the live
    -- schema yet -- it is part of a separate, still-unapplied predecessor migration
    -- (SD-LEO-INFRA-STAGE-GATE-PREDICATE-001 FR-4). This lookup fails safe (treats the
    -- error as "no override", same fail-closed direction as the primary predicate) rather
    -- than letting an undefined_column error propagate as an unrelated 500 on every single
    -- rejected insert -- this trigger's own PRIMARY predicate must not depend on that
    -- separate migration having landed. Once it lands, the override escape hatch here
    -- activates automatically with no further change to this file.
    v_override_key := NEW.channel_type || ':' || COALESCE(NEW.content_ref, '');
    v_has_override := FALSE;
    BEGIN
      SELECT EXISTS (
        SELECT 1 FROM chairman_decisions
         WHERE override_key = v_override_key
           AND decision_type = 'stage_gate_override'
           AND venture_id = NEW.venture_id
           AND consumed_at IS NOT NULL
           AND undo_deadline > now()
      ) INTO v_has_override;
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      v_has_override := FALSE;
    END;

    IF NOT v_has_override THEN
      RAISE EXCEPTION 'OUTBOUND_GATE_REJECTED: venture % is not outreach-authorized (is_demo=%, status=%, stage=%, launch_mode=%)',
        NEW.venture_id, v_venture.is_demo, v_venture.status, v_venture.current_lifecycle_stage, v_venture.launch_mode
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION check_venture_channel_publish_ledger_outbound_gate() IS
'SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001 FR-5: DB-level last-line defense mirroring '
'assertOutreachAuthorized()''s positive predicate. Defense-in-depth only -- the application-'
'level gate in lib/governance/stage-gate-predicate.js remains primary.';

DROP TRIGGER IF EXISTS trg_venture_channel_publish_ledger_outbound_gate ON venture_channel_publish_ledger;
CREATE TRIGGER trg_venture_channel_publish_ledger_outbound_gate
  BEFORE INSERT ON venture_channel_publish_ledger
  FOR EACH ROW
  EXECUTE FUNCTION check_venture_channel_publish_ledger_outbound_gate();

DO $verify$
DECLARE
  v_fn_exists BOOLEAN;
  v_trigger_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'check_venture_channel_publish_ledger_outbound_gate'
  ) INTO v_fn_exists;
  IF NOT v_fn_exists THEN
    RAISE EXCEPTION 'FR-5 VERIFY FAILED: function check_venture_channel_publish_ledger_outbound_gate does not exist';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_venture_channel_publish_ledger_outbound_gate'
       AND tgrelid = 'public.venture_channel_publish_ledger'::regclass
  ) INTO v_trigger_exists;
  IF NOT v_trigger_exists THEN
    RAISE EXCEPTION 'FR-5 VERIFY FAILED: trigger trg_venture_channel_publish_ledger_outbound_gate does not exist';
  END IF;
END;
$verify$;
