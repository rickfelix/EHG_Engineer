-- SD-LEO-INFRA-CLEANUP-NON-VENTURE-001 / FR5
-- Promote eva_vision_documents_active_rich_check from NOT VALID → VALIDATED
-- (pg_constraint.convalidated false → true), completing the legacy-preserving
-- forward-enforcing pattern started by UNIFY Child A.3.
--
-- Pre-condition: 20260527_cleanup_non_venture_l2_violators.sql must run first.
-- Split into a separate migration per database-agent COND-SPLIT-MIGRATIONS:
-- independent rollback boundary protects the archive from being undone if
-- VALIDATE fails on a concurrent insert in the gap.
--
-- Lock impact: ALTER TABLE ... VALIDATE CONSTRAINT takes SHARE UPDATE EXCLUSIVE,
-- which permits concurrent SELECT/INSERT/UPDATE/DELETE. Sub-second on a
-- 392KB / 275-row table per database-agent measurement.

BEGIN;

-- Re-verify zero violators before VALIDATE (defends against concurrent-insert
-- race between the two migrations).
DO $$
DECLARE
  rem INT;
BEGIN
  SELECT COUNT(*) INTO rem
    FROM eva_vision_documents
    WHERE status = 'active'
      AND NOT ((extracted_dimensions IS NOT NULL) AND (char_length(content) > 500));
  IF rem > 0 THEN
    RAISE EXCEPTION
      'CANNOT VALIDATE: % violators detected. '
      'Run 20260527_cleanup_non_venture_l2_violators.sql first.', rem;
  END IF;
  RAISE NOTICE 'PRE-VALIDATE PASSED: 0 violators detected.';
END $$;

ALTER TABLE eva_vision_documents
  VALIDATE CONSTRAINT eva_vision_documents_active_rich_check;

-- Post-flight: confirm convalidated flipped to true.
DO $$
DECLARE
  is_validated BOOLEAN;
BEGIN
  SELECT convalidated INTO is_validated
    FROM pg_constraint
    WHERE conname = 'eva_vision_documents_active_rich_check';
  IF is_validated IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION
      'POST-VALIDATE FAILED: convalidated=% (expected true).', is_validated;
  END IF;
  RAISE NOTICE 'POST-VALIDATE PASSED: constraint fully enforced (convalidated=true).';
END $$;

COMMIT;
