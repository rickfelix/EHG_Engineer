-- SD-FDBK-INFRA-CASCADE-TRIGGER-OVERREACH-001 FR-2 + FR-5
--
-- Surgical fix for sync_is_working_on_with_session trigger function:
-- CLEAR branch was firing on ANY status transition from 'active' (including
-- recoverable 'stale'), causing strategic_directives_v2.{is_working_on,
-- active_session_id} to be cleared whenever cleanup_stale_sessions cron fired
-- the 120s heartbeat-timeout flip on a session running long sub-agents.
--
-- Empirical evidence: PLAN database-agent fabb2c47 reproduced via direct probe.
-- 18-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 (claim-column-loss variant).
--
-- Fix: narrow CLEAR branch to fire ONLY on irrevocable transitions:
--   (OLD.sd_key NOT NULL AND NEW.sd_key IS NULL)  -- explicit disassociation
--   OR (OLD.status='active' AND NEW.status IN ('released', 'completed'))  -- terminal
--
-- Recoverable 'stale' status: do nothing — heartbeat keep-alive (FR-3) recovers.
-- cleanup_stale_sessions Block 3 (30s grace then irrevocable clear) is UNAFFECTED —
-- it directly UPDATEs strategic_directives_v2 + sets status='released' which fires
-- the irrevocable branch as a backstop.
--
-- SET branch (claim acquisition) preserved verbatim from original body
-- (rca-fr1-out.clean.json L763) — required to keep claim_sd RPC working.
--
-- FR-5: Audit trail to existing session_lifecycle_events table on every fire,
-- narrowed to skip pure heartbeat-only updates (sd_key/status unchanged).
--
-- Backward compat: ZERO regressions per database-agent FR-1 audit:
-- - release_sd / release_session: explicitly write status='released' → fires CLEAR
-- - cleanup_stale_sessions Block 3: explicitly clears 3 cols + status='released'
-- - claim_sd: writes sd_key from NULL → non-NULL → fires SET branch
-- - handoff.js: previously FAILED for in-flight sessions; this fix UNBLOCKS it
--
-- Function signature preserved: public.sync_is_working_on_with_session()
-- SECURITY: INVOKER (NOT DEFINER). NO SET search_path change.
--
-- Migration ends with NOTIFY pgrst, 'reload schema' to refresh PostgREST cache.

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_is_working_on_with_session()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_claim_cleared boolean := false;
  v_audit_should_fire boolean;
BEGIN
  -- Determine whether to write an audit row: only on transitions that
  -- materially change session lifecycle (sd_key change OR status change).
  -- Skips pure heartbeat-only updates which would otherwise produce
  -- ~thousands of rows/day per active session (per testing-agent R-16).
  v_audit_should_fire := (
    OLD.sd_key IS DISTINCT FROM NEW.sd_key
    OR OLD.status IS DISTINCT FROM NEW.status
  );

  -- SET branch (claim acquisition): preserved verbatim from original
  -- (rca-fr1-out.clean.json L763). Fires when a session transitions from
  -- "no SD claimed" to "actively working an SD".
  IF TG_OP = 'UPDATE' AND OLD.sd_key IS NULL AND NEW.sd_key IS NOT NULL AND NEW.status = 'active' THEN
    UPDATE strategic_directives_v2
    SET is_working_on = true,
        active_session_id = NEW.session_id,
        updated_at = NOW()
    WHERE sd_key = NEW.sd_key;

    -- FR-5 audit
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
      EXCEPTION WHEN OTHERS THEN
        -- Audit failures must NOT block trigger
        NULL;
      END;
    END IF;

    RETURN NEW;
  END IF;

  -- CLEAR branch (NARROWED per SD-FDBK-INFRA-CASCADE-TRIGGER-OVERREACH-001 FR-2):
  -- Original predicate was "OLD.status='active' AND NEW.status != 'active'" which
  -- fired on ANY non-active transition (including recoverable 'stale').
  -- New predicate fires ONLY on irrevocable transitions:
  --   (a) sd_key explicitly disassociated (NULL transition)
  --   (b) status terminally moved to 'released' or 'completed'
  -- Preserves CAS guard (active_session_id = OLD.session_id) for cross-session safety.
  -- Recoverable 'stale' transitions fall through to RETURN NEW without clearing.
  IF TG_OP = 'UPDATE' AND (
    (OLD.sd_key IS NOT NULL AND NEW.sd_key IS NULL) OR
    (OLD.status = 'active' AND NEW.status IN ('released', 'completed') AND OLD.sd_key IS NOT NULL)
  ) THEN
    UPDATE strategic_directives_v2
    SET is_working_on = false,
        active_session_id = NULL,
        updated_at = NOW()
    WHERE sd_key = OLD.sd_key
      AND active_session_id = OLD.session_id;

    v_claim_cleared := true;

    -- FR-5 audit
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

  -- Fall-through: recoverable transitions (e.g., active->stale) — preserve claim cols.
  -- FR-5 audit: still record the transition for observability.
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

-- Refresh PostgREST schema cache so consumers see the updated function body
-- (gotcha W2 from PR #3691 — without this, callers may read stale cached function for hours).
NOTIFY pgrst, 'reload schema';

COMMIT;
