-- Rollback for 20260911_chairman_ratification_verifications.sql.
-- SD-LEO-INFRA-RATIFICATION-ENCODE-VERIFICATION-001 (FR-3)
-- Drop order: triggers, then their functions, then the policy, then the table (indexes/FK go with
-- the table). Never drop a function while a trigger still references it.

BEGIN;

DROP TRIGGER IF EXISTS chairman_ratification_verifications_no_update
  ON public.chairman_ratification_verifications;
DROP TRIGGER IF EXISTS chairman_ratification_verifications_no_delete_trg
  ON public.chairman_ratification_verifications;
DROP TRIGGER IF EXISTS chairman_ratification_verifications_no_truncate_trg
  ON public.chairman_ratification_verifications;
DROP TRIGGER IF EXISTS crv_stamp_verified_at
  ON public.chairman_ratification_verifications;

DROP FUNCTION IF EXISTS public.chairman_ratification_verifications_freeze();
DROP FUNCTION IF EXISTS public.chairman_ratification_verifications_no_delete();
DROP FUNCTION IF EXISTS public.chairman_ratification_verifications_no_truncate();
DROP FUNCTION IF EXISTS public.chairman_ratification_verifications_stamp();

DROP POLICY IF EXISTS chairman_ratification_verifications_service_role
  ON public.chairman_ratification_verifications;

DROP TABLE IF EXISTS public.chairman_ratification_verifications;

COMMIT;
