-- Migration: Reconcile enforce_is_working_on_for_handoffs() to the handoff_actor_policy() SSOT
-- Date: 2026-06-23
-- SD: SD-REFILL-00VDVRYM
-- Purpose: REPO<->LIVE DRIFT FIX. The historical migration
--   database/migrations/20260213_enforce_is_working_on_handoffs.sql defined this trigger with an
--   INLINE actor-bypass list (NEW.created_by IN ('SYSTEM_MIGRATION','ADMIN_OVERRIDE',
--   'ORCHESTRATOR_GUARDIAN','bypass_script','SYSTEM_AUTO_COMPLETE')). The LIVE function was later
--   changed (UNIFIED-HANDOFF-SYSTEM) to delegate the trusted-actor skip to the handoff_actor_policy()
--   SSOT. The repo file no longer matched live, so a future migration regenerated from the repo would
--   have CLOBBERED the live SSOT delegation on a critical claim-enforcement trigger.
--
--   ⚠️ SSOT-MANAGED — DO NOT REGENERATE INLINE. The trusted-actor skip MUST come from
--   handoff_actor_policy(NEW.created_by).skips_claim_check (the single source of truth shared with
--   enforce_handoff_system). Never reintroduce a hardcoded `NEW.created_by IN (...)` actor list here.
--   Guarded by tests/unit/migration-ssot-delegation-guard.test.js.
--
-- This is a behavior-preserving reconciliation: the body below is byte-equivalent in behavior to the
-- current LIVE function (verified via pg_get_functiondef). Applying it is idempotent against live.

CREATE OR REPLACE FUNCTION enforce_is_working_on_for_handoffs()
RETURNS TRIGGER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_is_working_on BOOLEAN;
  v_sd_title TEXT;
  v_bypass_value TEXT;
BEGIN
  -- Check session variable bypass (for admin scripts)
  BEGIN
    v_bypass_value := current_setting('leo.bypass_working_on_check', true);
    IF v_bypass_value = 'true' THEN
      RETURN NEW;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- Setting doesn't exist, continue with check
  END;

  -- SSOT: trusted system actors skip the claim check (single source of truth,
  -- shared with enforce_handoff_system via handoff_actor_policy()).
  IF (SELECT skips_claim_check FROM public.handoff_actor_policy(NEW.created_by)) THEN
    RETURN NEW;
  END IF;

  -- Allow failure/rejection documentation without claim
  IF NEW.status IN ('rejected', 'error') THEN
    RETURN NEW;
  END IF;

  -- Look up is_working_on for the SD
  SELECT is_working_on, title
  INTO v_is_working_on, v_sd_title
  FROM strategic_directives_v2
  WHERE id = NEW.sd_id;

  -- SD not found — let the FK constraint handle it
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Enforce: is_working_on must be true
  IF v_is_working_on IS NOT TRUE THEN
    RAISE EXCEPTION
      E'LEO Protocol Violation: Cannot create handoff for SD without active session claim\n\n'
      'SD: % (%)\n'
      'Handoff: %\n'
      'is_working_on: %\n\n'
      'ACTION REQUIRED:\n'
      '1. Claim the SD first: npm run sd:start %\n'
      '2. Or use created_by=''ADMIN_OVERRIDE'' for administrative operations\n'
      '3. Or SET LOCAL leo.bypass_working_on_check = ''true'' in a transaction',
      NEW.sd_id, COALESCE(v_sd_title, 'Unknown'),
      NEW.handoff_type,
      COALESCE(v_is_working_on::text, 'NULL'),
      NEW.sd_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- The trigger binding is unchanged (defined in 20260213); re-assert idempotently for clarity.
DROP TRIGGER IF EXISTS trg_enforce_is_working_on_handoffs ON sd_phase_handoffs;
CREATE TRIGGER trg_enforce_is_working_on_handoffs
  BEFORE INSERT ON sd_phase_handoffs
  FOR EACH ROW
  EXECUTE FUNCTION enforce_is_working_on_for_handoffs();

-- Reconcile the function comment: trusted-actor skip is sourced from the SSOT, NOT a hardcoded list.
COMMENT ON FUNCTION enforce_is_working_on_for_handoffs() IS
  'Blocks handoff inserts when SD is_working_on=false. Trusted-actor skip is sourced from the handoff_actor_policy() SSOT (NOT a hardcoded created_by list) — shared with enforce_handoff_system. Also bypassed by rejected/error status, or SET LOCAL leo.bypass_working_on_check=true. SSOT-managed: do not regenerate with an inline created_by IN (...) actor list (SD-REFILL-00VDVRYM).';
