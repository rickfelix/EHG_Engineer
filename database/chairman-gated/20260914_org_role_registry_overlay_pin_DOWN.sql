-- Rollback sibling for 20260914_org_role_registry_overlay_pin.sql.
-- @chairman-gated
-- @approved-by: <PENDING -- chairman must add this line + a token before apply>

BEGIN;

DROP POLICY IF EXISTS org_role_venture_pins_service_role ON public.org_role_venture_pins;
DROP POLICY IF EXISTS org_role_venture_overlays_service_role ON public.org_role_venture_overlays;

-- pins FK's into overlays and base -- drop it first.
DROP TABLE IF EXISTS public.org_role_venture_pins;
DROP TABLE IF EXISTS public.org_role_venture_overlays;

COMMIT;
