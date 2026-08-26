-- ROLLBACK for 20260826_browser_actuation_session_cap.sql
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE unless rolling back the paired UP migration.

BEGIN;

DROP FUNCTION IF EXISTS public.fn_try_consume_browser_actuation_cap(TEXT, INTEGER);
DROP TABLE IF EXISTS public.browser_actuation_session_caps;

NOTIFY pgrst, 'reload schema';

COMMIT;
