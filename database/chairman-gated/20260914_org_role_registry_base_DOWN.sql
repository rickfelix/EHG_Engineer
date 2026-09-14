-- Rollback sibling for 20260914_org_role_registry_base.sql.
-- @chairman-gated
-- @approved-by: <PENDING -- chairman must add this line + a token before apply>

BEGIN;

DROP FUNCTION IF EXISTS public.supersede_org_role(TEXT, INTEGER, INTEGER);

DROP POLICY IF EXISTS org_role_base_versions_service_role ON public.org_role_base_versions;

DROP INDEX IF EXISTS public.org_role_base_versions_role_key_idx;
DROP INDEX IF EXISTS public.org_role_base_versions_one_active_idx;

DROP TABLE IF EXISTS public.org_role_base_versions;

COMMIT;
