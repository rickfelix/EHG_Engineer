-- SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-F -- widens chairman_ratifications'
-- cr_target_contracts_valid CHECK to accept 'michael' as a target_contracts value.
--
-- @approved-by: codestreetlabs@gmail.com
--   Chairman verbal by verified SMS 2026-09-07 (staging row 7bb7f018): "Apply the stages
--   migration so ratifications can bind Michael." Scribed by Adam under contract 3c.
--   WHY chairman-gated rather than database/migrations/: this file DROPs and re-ADDs a CHECK
--   constraint on an existing, chairman-gated governance table (chairman_ratifications) --
--   same sensitivity class as the table's own original migration
--   (database/chairman-gated/20260823_chairman_ratifications.sql).
--
-- ============================================================================
-- WHY THIS MIGRATION EXISTS.
--
-- lib/chairman/ratification-writer.mjs's VALID_TARGET_CONTRACTS already accepts 'michael'
-- (SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-A, commit 56bb955ea38), but the underlying DB
-- CHECK constraint on chairman_ratifications (database/chairman-gated/20260823_
-- chairman_ratifications.sql:68-70) was never widened to match -- confirmed still absent via
-- a live pg_constraint query during this child's LEAD VALIDATION pass (row b841f537). A live
-- INSERT naming target_contracts:['michael'] is rejected by Postgres today.
--
-- SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-F (the Cowork import child) is the first child
-- that actually needs this write to succeed (its own --ratify mode records the chairman's
-- one-time approval of the import), and no other child's scope currently, correctly owns the
-- fix -- child G's own description claims the JS-layer change as its scope, but that is
-- already done by child A; G's description is stale (noted in this SD's own
-- metadata.lead_design_notes for a later correction pass on G, not built here).
--
-- ADDITIVE ONLY: this migration widens an allowed-values array by one entry. It changes no
-- other column, adds no new object, and drops no existing capability -- every ratification the
-- constraint already accepted (adam/coordinator/solomon/protocol) is unaffected.
-- ============================================================================

BEGIN;

ALTER TABLE public.chairman_ratifications
  DROP CONSTRAINT IF EXISTS cr_target_contracts_valid;

ALTER TABLE public.chairman_ratifications
  ADD CONSTRAINT cr_target_contracts_valid CHECK (
    cardinality(target_contracts) > 0
    AND target_contracts <@ ARRAY['adam','coordinator','solomon','michael','protocol']::text[]
  );

DO $verify$
DECLARE
  v_ok boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.chairman_ratifications'::regclass
      AND conname = 'cr_target_contracts_valid'
      AND pg_get_constraintdef(oid) LIKE '%michael%'
  ) INTO v_ok;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'cr_target_contracts_valid was not widened to include michael';
  END IF;
END $verify$;

COMMIT;
