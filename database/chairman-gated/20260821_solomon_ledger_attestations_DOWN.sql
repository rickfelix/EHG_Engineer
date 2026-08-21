-- ROLLBACK for 20260821_solomon_ledger_attestations.sql
-- SD-LEO-GEN-STAGE-DECISION-RESTORE-001

BEGIN;

DROP TRIGGER IF EXISTS solomon_ledger_attestations_no_truncate_trg ON public.solomon_ledger_attestations;
DROP TRIGGER IF EXISTS solomon_ledger_attestations_no_delete_trg ON public.solomon_ledger_attestations;
DROP TRIGGER IF EXISTS solomon_ledger_attestations_no_update ON public.solomon_ledger_attestations;

DROP FUNCTION IF EXISTS public.solomon_ledger_attestations_no_truncate();
DROP FUNCTION IF EXISTS public.solomon_ledger_attestations_no_delete();
DROP FUNCTION IF EXISTS public.solomon_ledger_attestations_freeze();

DROP TABLE IF EXISTS public.solomon_ledger_attestations;

DO $verify$
BEGIN
  ASSERT to_regclass('public.solomon_ledger_attestations') IS NULL,
    'solomon_ledger_attestations table still exists after DOWN';
  RAISE NOTICE 'solomon_ledger_attestations DOWN verified: table and all triggers/functions removed';
END
$verify$;

COMMIT;
