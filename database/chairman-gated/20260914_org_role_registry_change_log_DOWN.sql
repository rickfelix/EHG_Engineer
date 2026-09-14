-- Rollback sibling for 20260914_org_role_registry_change_log.sql.
-- @chairman-gated
-- @approved-by: <PENDING -- chairman must add this line + a token before apply>

BEGIN;

-- Guard triggers on org_role_change_log itself.
DROP TRIGGER IF EXISTS org_role_change_log_no_truncate_trg ON public.org_role_change_log;
DROP TRIGGER IF EXISTS org_role_change_log_no_delete_trg ON public.org_role_change_log;
DROP TRIGGER IF EXISTS org_role_change_log_no_update_trg ON public.org_role_change_log;

-- Writer triggers on the three source tables.
DROP TRIGGER IF EXISTS trg_org_role_venture_pins_log ON public.org_role_venture_pins;
DROP TRIGGER IF EXISTS trg_org_role_venture_overlays_log ON public.org_role_venture_overlays;
DROP TRIGGER IF EXISTS trg_org_role_base_versions_log ON public.org_role_base_versions;

DROP FUNCTION IF EXISTS public.org_role_change_log_no_truncate();
DROP FUNCTION IF EXISTS public.org_role_change_log_no_delete();
DROP FUNCTION IF EXISTS public.org_role_change_log_no_update();
DROP FUNCTION IF EXISTS public.log_org_role_change();

DROP POLICY IF EXISTS org_role_change_log_service_role ON public.org_role_change_log;

DROP TABLE IF EXISTS public.org_role_change_log;

COMMIT;
