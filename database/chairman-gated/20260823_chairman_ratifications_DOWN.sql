-- ROLLBACK for 20260823_chairman_ratifications.sql
-- SD-LEO-INFRA-CHAIRMAN-RATIFICATION-LEDGER-001

BEGIN;

DROP TRIGGER IF EXISTS chairman_ratifications_no_truncate_trg ON public.chairman_ratifications;
DROP TRIGGER IF EXISTS chairman_ratifications_no_delete_trg ON public.chairman_ratifications;
DROP TRIGGER IF EXISTS chairman_ratifications_no_update ON public.chairman_ratifications;

DROP FUNCTION IF EXISTS public.chairman_ratifications_no_truncate();
DROP FUNCTION IF EXISTS public.chairman_ratifications_no_delete();
DROP FUNCTION IF EXISTS public.chairman_ratifications_freeze();

-- SECURITY finding M2 (EXEC-phase adversarial review): DROP TABLE ran unconditionally, so one
-- DOWN run would silently destroy every ratification the ledger had ever recorded, append-only
-- guarantee notwithstanding -- DOWN itself is the escape hatch the guards can't see. Refuse the
-- drop (and the whole transaction, via RAISE EXCEPTION) if any row exists; an operator who really
-- means to discard ratified history must delete rows through an explicit, separate, audited step
-- first, never as a side effect of running this rollback.
DO $guard$
DECLARE
  existing_rows integer;
BEGIN
  IF to_regclass('public.chairman_ratifications') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.chairman_ratifications' INTO existing_rows;
    IF existing_rows > 0 THEN
      RAISE EXCEPTION 'chairman_ratifications DOWN refused: table has % row(s) -- this rollback would '
        'silently destroy ratified history. Delete/export rows through an explicit, separate, audited '
        'step first if that is truly intended.', existing_rows;
    END IF;
  END IF;
END
$guard$;

DROP TABLE IF EXISTS public.chairman_ratifications;

DO $verify$
BEGIN
  ASSERT to_regclass('public.chairman_ratifications') IS NULL,
    'chairman_ratifications table still exists after DOWN';
  RAISE NOTICE 'chairman_ratifications DOWN verified: table and all triggers/functions removed';
END
$verify$;

COMMIT;
