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
-- current_lifecycle_stage>=24 AND launch_mode='live'. NO chairman override escape hatch --
-- SECURITY finding SEC-H2 (sub_agent_execution_results 3ed447ec-de8c-4798-9fdc-5a0c814623a5):
-- an earlier draft of this trigger checked `consumed_at IS NOT NULL`, the OPPOSITE of
-- hasActiveOverride()'s one-shot `consumed_at IS NULL` atomic-claim semantics -- inverted this
-- way, a single spent override would have licensed UNLIMITED direct INSERTs for its
-- (venture_id, override_key) pair until undo_deadline expired, against exactly the manual-
-- insert threat this trigger exists to close. The application layer (assertOutreachAuthorized,
-- via checkStageGate's hasActiveOverride) already owns the one-shot chairman override as the
-- sole touchpoint; this DB-level defense-in-depth layer is deliberately absolute with no
-- escape hatch of its own, so it cannot itself become a vector for exactly the standing-bypass
-- class of bug an override mechanism is supposed to avoid.
--
-- SCOPE: fires on INSERT only. UPDATE is not gated here -- the only production UPDATE path on
-- this table is recordPublishOutcome() (setting outcome/outcome_ref on an already-accepted
-- row), which does not create new send authority and is out of scope for this gate.
--
-- @approved-by: codestreetlabs@gmail.com
--   Chairman verification NOT yet obtained. This file is staged only -- per coordinator
--   directive 7c1c6622: LEAD-FINAL-APPROVAL for this SD waits on the chairman ceremony apply.
--
-- Rollback: 20260912_venture_channel_publish_ledger_outbound_gate_trigger_DOWN.sql
--
-- NOTE: no top-level BEGIN/COMMIT -- scripts/apply-migration.js wraps the whole file in its
-- own transaction (this directory's established convention).

-- SECURITY finding (sub_agent_execution_results 3ed447ec): no SECURITY DEFINER -- this
-- function does not need elevated privilege to be fail-closed. As INVOKER, a caller whose
-- own RLS hides the linked venture row hits the SAME "NOT FOUND -> does not resolve"
-- rejection this function already raises for a genuinely unresolvable venture_id, which is
-- the correct fail-closed outcome anyway.
CREATE OR REPLACE FUNCTION check_venture_channel_publish_ledger_outbound_gate()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_venture RECORD;
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
    RAISE EXCEPTION 'OUTBOUND_GATE_REJECTED: venture % is not outreach-authorized (is_demo=%, status=%, stage=%, launch_mode=%)',
      NEW.venture_id, v_venture.is_demo, v_venture.status, v_venture.current_lifecycle_stage, v_venture.launch_mode
      USING ERRCODE = 'P0001';
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
