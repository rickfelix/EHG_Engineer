-- ROLLBACK for 20260823_chairman_ratifications.sql
-- SD-LEO-INFRA-CHAIRMAN-RATIFICATION-LEDGER-001

BEGIN;

DROP TRIGGER IF EXISTS chairman_ratifications_no_truncate_trg ON public.chairman_ratifications;
DROP TRIGGER IF EXISTS chairman_ratifications_no_delete_trg ON public.chairman_ratifications;
DROP TRIGGER IF EXISTS chairman_ratifications_no_update ON public.chairman_ratifications;

DROP FUNCTION IF EXISTS public.chairman_ratifications_no_truncate();
DROP FUNCTION IF EXISTS public.chairman_ratifications_no_delete();
DROP FUNCTION IF EXISTS public.chairman_ratifications_freeze();

DROP TABLE IF EXISTS public.chairman_ratifications;

DO $verify$
BEGIN
  ASSERT to_regclass('public.chairman_ratifications') IS NULL,
    'chairman_ratifications table still exists after DOWN';
  RAISE NOTICE 'chairman_ratifications DOWN verified: table and all triggers/functions removed';
END
$verify$;

COMMIT;
