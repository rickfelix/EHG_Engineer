-- CAPTURED LIVE via pg_get_functiondef() at 2026-08-24T03:58:07.377Z
-- SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 / FR-4 -- BEFORE artifact.
-- Source: live consolidated engineer DB. NOT copied from any migration file (a stale
-- migration-file copy of a live RPC caused a real authentication-bypass risk on a prior SD
-- this session -- see FR-4's description).
--
CREATE OR REPLACE FUNCTION public.auto_transition_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
      BEGIN
        -- Fix: Use current_phase instead of phase
        IF NEW.current_phase = 'EXEC' AND NEW.progress >= 100 THEN
          NEW.status = 'pending_approval';
        END IF;

        -- FIX: Changed from 'pending_lead_approval' to 'pending_approval'
        IF NEW.current_phase = 'PLAN' AND NEW.progress >= 100 THEN
          NEW.status = 'pending_approval';
        END IF;

        RETURN NEW;
      END;
      $function$

