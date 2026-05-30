-- =============================================================================
-- SD-LEO-INFRA-ORCHESTRATOR-LAST-CHILD-001
-- Unify handoff trusted-actor bypass into a single source of truth (SSOT)
-- @approved-by: rickfelix@example.com
-- Date: 2026-05-30
--
-- Handoff creation on sd_phase_handoffs is gated by TWO sibling BEFORE-INSERT
-- triggers, each historically hardcoding its own divergent list of trusted
-- system actors:
--   * enforce_handoff_system            -> "may this created_by create a handoff at all?"
--   * enforce_is_working_on_for_handoffs -> "may this created_by skip the is_working_on claim check?"
-- and a now-dead third copy (check_handoff_bypass, attached to no trigger).
--
-- The divergence produced a bug CLASS. Proven-live (D1): the in-DB
-- complete_orchestrator_sd() inserts the parent rollup handoff with
-- created_by='ORCHESTRATOR_AUTO_COMPLETE' while the parent is_working_on=false;
-- enforce_handoff_system ALLOWS it but enforce_is_working_on_for_handoffs does
-- NOT bypass it, so the last-child completion transaction rolls back.
-- Latent cousins: D2 (PCVP_EMERGENCY_BYPASS), D3 (ORCHESTRATOR-GUARDIAN hyphen).
--
-- FIX: one canonical SSOT function handoff_actor_policy(created_by) returning
-- (may_create, skips_claim_check). Both triggers derive their decision solely
-- from it; the dead check_handoff_bypass is removed; no-producer actors dropped.
-- Reversible: see 20260530_unify_handoff_actor_policy_ssot_rollback.sql
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. SSOT: canonical trusted-actor policy. Declares every trusted handoff
--    actor ONCE so the two enforcement triggers can never diverge again.
--    Aggregate SELECT returns exactly one row even for unknown actors
--    (bool_or over zero rows = NULL -> COALESCE false,false).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handoff_actor_policy(p_created_by text)
RETURNS TABLE(may_create boolean, skips_claim_check boolean)
LANGUAGE sql
IMMUTABLE
AS $fn$
  WITH registry(actor, may_create, skips_claim) AS (
    VALUES
      ('UNIFIED-HANDOFF-SYSTEM'::text, true,  false),  -- normal handoff.js path: legit creator, MUST still hold a claim
      ('SYSTEM_MIGRATION',             true,  true),    -- data migrations
      ('ADMIN_OVERRIDE',               true,  true),    -- manual/administrative
      ('ORCHESTRATOR_AUTO_COMPLETE',   true,  true),    -- D1: complete_orchestrator_sd() last-child rollup (SECURITY DEFINER)
      ('PCVP_EMERGENCY_BYPASS',        true,  true),    -- D2: emergency completion bypass row
      ('ORCHESTRATOR-GUARDIAN',        true,  true)     -- D3: OrchestratorCompletionGuardian.createHandoff (hyphen = canonical)
  )
  SELECT
    COALESCE(bool_or(r.may_create), false),
    COALESCE(bool_or(r.skips_claim), false)
  FROM registry r
  WHERE r.actor = p_created_by
$fn$;

COMMENT ON FUNCTION public.handoff_actor_policy(text) IS
  'SSOT for handoff trusted-actor enforcement (SD-LEO-INFRA-ORCHESTRATOR-LAST-CHILD-001). '
  'may_create -> enforce_handoff_system; skips_claim_check -> enforce_is_working_on_for_handoffs. '
  'Every trusted actor is declared exactly once here so the two BEFORE-INSERT triggers cannot diverge. '
  'Dropped no-producer actors: SYSTEM_AUTO_COMPLETE, bypass_script, ORCHESTRATOR_GUARDIAN(underscore typo).';

-- ---------------------------------------------------------------------------
-- 2. enforce_handoff_system: derive may_create from the SSOT.
--    handoff_audit_log insert + HANDOFF_BYPASS_BLOCKED RAISE preserved verbatim.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_handoff_system()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_may_create boolean;
BEGIN
    -- SSOT: single source of truth for "is this a legitimate handoff creator?"
    v_may_create := (SELECT may_create FROM public.handoff_actor_policy(COALESCE(NEW.created_by, '')));

    -- Log the attempt (always, regardless of outcome)
    INSERT INTO handoff_audit_log (
        attempted_by,
        sd_id,
        handoff_type,
        from_phase,
        to_phase,
        blocked,
        block_reason,
        request_metadata
    ) VALUES (
        COALESCE(NEW.created_by, 'NULL'),
        NEW.sd_id,
        NEW.handoff_type,
        NEW.from_phase,
        NEW.to_phase,
        NOT v_may_create,
        CASE
            WHEN v_may_create THEN NULL
            ELSE format('Invalid created_by: %s. Must use handoff.js script.', COALESCE(NEW.created_by, 'NULL'))
        END,
        jsonb_build_object(
            'trigger_time', NOW(),
            'status', NEW.status,
            'validation_score', NEW.validation_score
        )
    );

    IF v_may_create THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'HANDOFF_BYPASS_BLOCKED: Direct handoff creation is not allowed.

To create a handoff, run:
  node scripts/handoff.js execute <TYPE> <SD-ID>

Where TYPE is one of:
  - LEAD-TO-PLAN
  - PLAN-TO-EXEC
  - EXEC-TO-PLAN
  - PLAN-TO-LEAD

Example:
  node scripts/handoff.js execute PLAN-TO-EXEC SD-EXAMPLE-001

Attempted created_by: %', COALESCE(NEW.created_by, 'NULL');
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. enforce_is_working_on_for_handoffs: derive skips_claim_check from the SSOT.
--    GUC bypass + rejected/error bypass + is_working_on RAISE preserved verbatim.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_is_working_on_for_handoffs()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
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
$function$;

-- ---------------------------------------------------------------------------
-- 4. Remove the dead check_handoff_bypass() (orphaned legacy SSOT, a third
--    divergent copy). Guarded: only drop if it is attached to no trigger.
-- ---------------------------------------------------------------------------
DO $drop_dead$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE p.proname = 'check_handoff_bypass' AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'check_handoff_bypass is attached to a trigger — aborting drop (unexpected; investigate before re-running)';
  END IF;
  DROP FUNCTION IF EXISTS public.check_handoff_bypass();
  RAISE NOTICE 'Dropped dead check_handoff_bypass() (no trigger attachment, no in-DB caller)';
END
$drop_dead$;

-- ---------------------------------------------------------------------------
-- 5. Regression invariant (side-effect-free): assert the SSOT matrix and that
--    both triggers now derive from it. Fails the migration if any drift.
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE mc boolean; sc boolean;
BEGIN
  SELECT may_create, skips_claim_check INTO mc, sc FROM public.handoff_actor_policy('UNIFIED-HANDOFF-SYSTEM');
  ASSERT mc AND NOT sc, 'UNIFIED-HANDOFF-SYSTEM must be create-only (still claim-subject)';

  SELECT may_create, skips_claim_check INTO mc, sc FROM public.handoff_actor_policy('SYSTEM_MIGRATION');
  ASSERT mc AND sc, 'SYSTEM_MIGRATION must create + skip-claim';
  SELECT may_create, skips_claim_check INTO mc, sc FROM public.handoff_actor_policy('ADMIN_OVERRIDE');
  ASSERT mc AND sc, 'ADMIN_OVERRIDE must create + skip-claim';

  SELECT may_create, skips_claim_check INTO mc, sc FROM public.handoff_actor_policy('ORCHESTRATOR_AUTO_COMPLETE');
  ASSERT mc AND sc, 'ORCHESTRATOR_AUTO_COMPLETE must create + skip-claim (D1)';
  SELECT may_create, skips_claim_check INTO mc, sc FROM public.handoff_actor_policy('PCVP_EMERGENCY_BYPASS');
  ASSERT mc AND sc, 'PCVP_EMERGENCY_BYPASS must create + skip-claim (D2)';
  SELECT may_create, skips_claim_check INTO mc, sc FROM public.handoff_actor_policy('ORCHESTRATOR-GUARDIAN');
  ASSERT mc AND sc, 'ORCHESTRATOR-GUARDIAN (hyphen) must create + skip-claim (D3)';

  -- Dropped / unknown actors must be (false, false)
  SELECT may_create, skips_claim_check INTO mc, sc FROM public.handoff_actor_policy('SYSTEM_AUTO_COMPLETE');
  ASSERT NOT mc AND NOT sc, 'SYSTEM_AUTO_COMPLETE must be dropped (no producer)';
  SELECT may_create, skips_claim_check INTO mc, sc FROM public.handoff_actor_policy('bypass_script');
  ASSERT NOT mc AND NOT sc, 'bypass_script must be dropped (no producer)';
  SELECT may_create, skips_claim_check INTO mc, sc FROM public.handoff_actor_policy('ORCHESTRATOR_GUARDIAN');
  ASSERT NOT mc AND NOT sc, 'ORCHESTRATOR_GUARDIAN (underscore typo) must be dropped';
  SELECT may_create, skips_claim_check INTO mc, sc FROM public.handoff_actor_policy('definitely-not-an-actor');
  ASSERT NOT mc AND NOT sc, 'unknown actor must be (false, false)';

  -- Both triggers must derive from the SSOT
  ASSERT (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='enforce_handoff_system' AND p.prokind='f') LIKE '%handoff_actor_policy%',
         'enforce_handoff_system must call handoff_actor_policy()';
  ASSERT (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='enforce_is_working_on_for_handoffs' AND p.prokind='f') LIKE '%handoff_actor_policy%',
         'enforce_is_working_on_for_handoffs must call handoff_actor_policy()';

  RAISE NOTICE 'VERIFY OK: handoff_actor_policy SSOT matrix + both trigger rewires confirmed';
END
$verify$;

-- Make the new SSOT function visible to PostgREST (.rpc) for the CI regression test.
NOTIFY pgrst, 'reload schema';

COMMIT;
