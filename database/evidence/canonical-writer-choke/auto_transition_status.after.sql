-- CAPTURED LIVE via pg_get_functiondef() at 2026-08-24T03:58:07.377Z
-- SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 / FR-4 -- AFTER artifact (generated).
-- Source: this file started as the BEFORE capture with the enumerated stamp lines inserted, produced
-- by scripts/one-off/gen-canonical-writer-stamp-amendments.mjs (exactly-once anchor matching), and was
-- then hand-amended with ONE additional block: the IS DISTINCT FROM guard fix directed by the 06:01Z
-- coordinator ceremony-packet relay (Adam flag-review / risk-agent live measurement). This function is
-- therefore the sole documented exception to "stamp-only diff" among AMENDED_FUNCTIONS -- see the
-- dedicated 'auto_transition_status carries exactly the stamp edit plus the guard fix, nothing else'
-- DDL test, which enumerates both permitted diff classes instead of relying on the generic stamp-only
-- comparator.
-- Original source: live consolidated engineer DB. NOT copied from any migration file (a stale
-- migration-file copy of a live RPC caused a real authentication-bypass risk on a prior SD
-- this session -- see FR-4's description).
--
CREATE OR REPLACE FUNCTION public.auto_transition_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
      BEGIN
        -- SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 ceremony-packet amendment (Adam flag-review,
        -- risk-agent live-measured): status_auto_transition is BEFORE UPDATE with no WHEN clause and this
        -- function had no IS DISTINCT FROM guard, so it recomputed status on EVERY update to a row already
        -- satisfying (current_phase, progress>=100) -- including metadata-only writes that never touched
        -- either column. That silently reverted a row a human/handoff had deliberately moved to a DIFFERENT
        -- status afterward (e.g. cancelled/completed) back to 'pending_approval'. Only recompute when THIS
        -- write actually changed current_phase or progress. (Staged here, not a separate ceremony, per
        -- coordinator packet-fragmentation call -- this trigger's table is already open in this migration.)
        IF NEW.current_phase IS NOT DISTINCT FROM OLD.current_phase
           AND NEW.progress IS NOT DISTINCT FROM OLD.progress THEN
          RETURN NEW;
        END IF;

        -- Fix: Use current_phase instead of phase
        IF NEW.current_phase = 'EXEC' AND NEW.progress >= 100 THEN
          IF NEW.lifecycle_write_token IS NULL THEN
            NEW.lifecycle_write_token = 'auto_transition_status';
          END IF;
          NEW.status = 'pending_approval';
        END IF;

        -- FIX: Changed from 'pending_lead_approval' to 'pending_approval'
        IF NEW.current_phase = 'PLAN' AND NEW.progress >= 100 THEN
          IF NEW.lifecycle_write_token IS NULL THEN
            NEW.lifecycle_write_token = 'auto_transition_status';
          END IF;
          NEW.status = 'pending_approval';
        END IF;

        RETURN NEW;
      END;
      $function$

