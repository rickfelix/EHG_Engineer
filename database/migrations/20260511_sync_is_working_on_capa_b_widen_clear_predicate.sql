-- QF-20260511-499 CAPA-B: widen CLEAR predicate in sync_is_working_on_with_session
-- @approved-by: rickfelix@example.com
--
-- 2nd-order defect from SD-FDBK-INFRA-CASCADE-TRIGGER-OVERREACH-001 FR-2.
-- FR-2 narrowed CLEAR branch to require:
--     (OLD.status='active' AND NEW.status IN ('released','completed'))
--
-- This blocks irrevocable transitions on the canonical cleanup path:
--     active -> stale -> released   (cleanup_stale_sessions Block 3)
--
-- At step 7 of the smoke runner (scripts/smoke/verify-claim-col-preservation.mjs)
-- OLD.status='stale' when status flips to 'released', so the predicate fails
-- and the claim cols are not cleared. Recurs at runtime any time a session
-- ages out via stale->released rather than active->released directly.
--
-- Witnesses: feedback e08ffe0a (1st, in_progress), deb8595c (2nd, new, occ=2).
-- Workflow run 25683018138 step "smoke-verify" exits 1 with marker
-- [SD_CLAIM_COL_PRESERVATION_FAILED].
--
-- CAPA-B fix: accept terminal transition from EITHER 'active' or 'stale'.
-- The irrevocability marker is NEW.status, not OLD.status. Both
-- active->released and stale->released are equally irrevocable from the
-- session-lifecycle perspective.
--
-- Predicate change (one line):
--   FROM: OLD.status = 'active' AND NEW.status IN ('released','completed')
--   TO:   OLD.status IN ('active','stale') AND NEW.status IN ('released','completed')
--
-- Everything else (CAS guard, audit branch, SET branch, fall-through) is
-- preserved verbatim from 20260511_sync_is_working_on_preserve_recoverable_stale.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_is_working_on_with_session()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_claim_cleared boolean := false;
  v_audit_should_fire boolean;
BEGIN
  v_audit_should_fire := (
    OLD.sd_key IS DISTINCT FROM NEW.sd_key
    OR OLD.status IS DISTINCT FROM NEW.status
  );

  -- SET branch (claim acquisition) — unchanged
  IF TG_OP = 'UPDATE' AND OLD.sd_key IS NULL AND NEW.sd_key IS NOT NULL AND NEW.status = 'active' THEN
    UPDATE strategic_directives_v2
    SET is_working_on = true,
        active_session_id = NEW.session_id,
        updated_at = NOW()
    WHERE sd_key = NEW.sd_key;

    IF v_audit_should_fire THEN
      BEGIN
        INSERT INTO session_lifecycle_events (event_type, session_id, reason, metadata)
        VALUES (
          'SESSION_STATUS_TRANSITION',
          NEW.session_id::text,
          format('claim_acquired: sd_key=%s status=%s->%s', NEW.sd_key, OLD.status, NEW.status),
          jsonb_build_object(
            'old_sd_key', OLD.sd_key,
            'new_sd_key', NEW.sd_key,
            'old_status', OLD.status,
            'new_status', NEW.status,
            'claim_cleared', false,
            'branch', 'SET'
          )
        );
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;

    RETURN NEW;
  END IF;

  -- CLEAR branch — CAPA-B widened to accept OLD.status IN ('active','stale').
  -- Irrevocability is established by NEW.status terminal value; intermediate
  -- recoverable state ('stale') still falls through if it stays 'stale'.
  IF TG_OP = 'UPDATE' AND (
    (OLD.sd_key IS NOT NULL AND NEW.sd_key IS NULL) OR
    (OLD.status IN ('active','stale') AND NEW.status IN ('released', 'completed') AND OLD.sd_key IS NOT NULL)
  ) THEN
    UPDATE strategic_directives_v2
    SET is_working_on = false,
        active_session_id = NULL,
        updated_at = NOW()
    WHERE sd_key = OLD.sd_key
      AND active_session_id = OLD.session_id;

    v_claim_cleared := true;

    IF v_audit_should_fire THEN
      BEGIN
        INSERT INTO session_lifecycle_events (event_type, session_id, reason, metadata)
        VALUES (
          'SESSION_STATUS_TRANSITION',
          OLD.session_id::text,
          format('claim_cleared_irrevocable: sd_key=%s status=%s->%s', OLD.sd_key, OLD.status, NEW.status),
          jsonb_build_object(
            'old_sd_key', OLD.sd_key,
            'new_sd_key', NEW.sd_key,
            'old_status', OLD.status,
            'new_status', NEW.status,
            'claim_cleared', true,
            'branch', 'CLEAR_IRREVOCABLE'
          )
        );
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;

    RETURN NEW;
  END IF;

  -- Fall-through: still-recoverable transitions (e.g., active->stale with no terminal).
  IF v_audit_should_fire AND OLD.sd_key IS NOT NULL THEN
    BEGIN
      INSERT INTO session_lifecycle_events (event_type, session_id, reason, metadata)
      VALUES (
        'SESSION_STATUS_TRANSITION',
        COALESCE(OLD.session_id, NEW.session_id)::text,
        format('claim_preserved_recoverable: sd_key=%s status=%s->%s', OLD.sd_key, OLD.status, NEW.status),
        jsonb_build_object(
          'old_sd_key', OLD.sd_key,
          'new_sd_key', NEW.sd_key,
          'old_status', OLD.status,
          'new_status', NEW.status,
          'claim_cleared', false,
          'branch', 'PRESERVED_RECOVERABLE'
        )
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
