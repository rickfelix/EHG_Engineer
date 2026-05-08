-- SD-FDBK-INFRA-FIX-COMPLETION-LIFECYCLE-001
-- FR-1a/b/c + FR-6: Split quick_fixes.actual_loc into actual_source_loc + actual_test_loc;
--                   ALTER actual_loc_reasonable + completed_requires_verification CHECKs;
--                   ADD force_completed BOOLEAN column.
--
-- WHY split: complete-quick-fix.js conflates source LOC + test LOC under the single 75-LOC
-- Tier-1 cap, blocking small fixes that ship comprehensive test coverage. Source-only cap
-- aligns with the existing CLAUDE.md routing tier table.
--
-- WHY ALTER actual_loc_reasonable: legacy CHECK was `actual_loc <= 200`. After split, cap
-- policy moves into the script (FR-2); CHECK becomes a sanity backstop only.
--
-- WHY ALTER completed_requires_verification: legacy CHECK forces tests_passing=true AND
-- uat_verified=true for status='completed'. FR-2's --force-complete flag bypasses runtime
-- test/UAT verification with --reason audit trail; CHECK must accept (status='completed'
-- AND force_completed=true) without test/UAT.
--
-- ORDERING: ADD COLUMNs FIRST (idempotent, NULL-tolerant); BACKFILL SECOND (UPDATE existing
-- rows); ALTER CHECKs LAST (after columns + values exist). Single transaction for atomicity.
--
-- VERIFICATION (post-apply DO block): all 3 columns exist; all rows have actual_source_loc
-- non-NULL where actual_loc was non-NULL; both CHECK constraints in expected new form.
--
-- ROLLBACK PATH (manual paste if migration breaks downstream — see end of file).

BEGIN;

-- 1. ADD COLUMNs (idempotent via IF NOT EXISTS)
ALTER TABLE quick_fixes ADD COLUMN IF NOT EXISTS actual_source_loc INTEGER;
ALTER TABLE quick_fixes ADD COLUMN IF NOT EXISTS actual_test_loc INTEGER;
ALTER TABLE quick_fixes ADD COLUMN IF NOT EXISTS force_completed BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN quick_fixes.actual_source_loc IS
  'SD-FDBK-INFRA-FIX-COMPLETION-LIFECYCLE-001: source-only lines changed (excludes test files). Cap policy enforced in script (complete-quick-fix.js).';
COMMENT ON COLUMN quick_fixes.actual_test_loc IS
  'SD-FDBK-INFRA-FIX-COMPLETION-LIFECYCLE-001: test-file lines changed (matched by .test./.spec./__tests__/tests/e2e/playwright path patterns). Excluded from cap.';
COMMENT ON COLUMN quick_fixes.force_completed IS
  'SD-FDBK-INFRA-FIX-COMPLETION-LIFECYCLE-001: --force-complete CLI flag set this to true. Operator-supplied --reason recorded in verification_notes JSON.';

-- 2. BACKFILL existing rows: pre-migration actual_loc -> source (test=0, force=false)
UPDATE quick_fixes
SET actual_source_loc = actual_loc,
    actual_test_loc = 0,
    force_completed = FALSE
WHERE actual_loc IS NOT NULL
  AND actual_source_loc IS NULL;

-- 3. ALTER actual_loc_reasonable CHECK: cap moves to script; constraint is sanity-only
ALTER TABLE quick_fixes DROP CONSTRAINT IF EXISTS actual_loc_reasonable;
ALTER TABLE quick_fixes ADD CONSTRAINT actual_loc_reasonable CHECK (
  (actual_loc IS NULL OR actual_loc <= 1000) AND
  (actual_source_loc IS NULL OR actual_source_loc <= 1000) AND
  (actual_test_loc IS NULL OR actual_test_loc <= 5000)
);

-- 4. ALTER completed_requires_verification CHECK: accept force_completed=true rows
ALTER TABLE quick_fixes DROP CONSTRAINT IF EXISTS completed_requires_verification;
ALTER TABLE quick_fixes ADD CONSTRAINT completed_requires_verification CHECK (
  (status = 'completed' AND ((tests_passing = TRUE AND uat_verified = TRUE) OR force_completed = TRUE))
  OR status <> 'completed'
);

-- 5. Verification DO block — fails the transaction if any invariant is violated
DO $$
DECLARE
  col_count INTEGER;
  unfilled_count INTEGER;
  loc_check_def TEXT;
  comp_check_def TEXT;
BEGIN
  -- 3 new columns present?
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns
  WHERE table_name = 'quick_fixes'
    AND column_name IN ('actual_source_loc', 'actual_test_loc', 'force_completed');
  IF col_count <> 3 THEN
    RAISE EXCEPTION 'Migration failed: expected 3 new columns (actual_source_loc, actual_test_loc, force_completed); found %', col_count;
  END IF;

  -- All rows with non-NULL actual_loc backfilled?
  SELECT COUNT(*) INTO unfilled_count
  FROM quick_fixes
  WHERE actual_loc IS NOT NULL AND actual_source_loc IS NULL;
  IF unfilled_count > 0 THEN
    RAISE EXCEPTION 'Migration failed: % rows have actual_loc but missing actual_source_loc backfill', unfilled_count;
  END IF;

  -- actual_loc_reasonable CHECK reflects new tri-column form?
  SELECT pg_get_constraintdef(oid) INTO loc_check_def
  FROM pg_constraint
  WHERE conname = 'actual_loc_reasonable';
  IF loc_check_def NOT LIKE '%actual_source_loc%' OR loc_check_def NOT LIKE '%actual_test_loc%' THEN
    RAISE EXCEPTION 'Migration failed: actual_loc_reasonable CHECK does not reference new columns (got: %)', loc_check_def;
  END IF;

  -- completed_requires_verification CHECK references force_completed?
  SELECT pg_get_constraintdef(oid) INTO comp_check_def
  FROM pg_constraint
  WHERE conname = 'completed_requires_verification';
  IF comp_check_def NOT LIKE '%force_completed%' THEN
    RAISE EXCEPTION 'Migration failed: completed_requires_verification CHECK does not reference force_completed (got: %)', comp_check_def;
  END IF;

  RAISE NOTICE 'Migration verified: 3 columns present, all rows backfilled, both CHECKs ALTERed. SD-FDBK-INFRA-FIX-COMPLETION-LIFECYCLE-001 schema ready.';
END $$;

COMMIT;

-- ROLLBACK PATH (paste manually if migration breaks downstream):
-- BEGIN;
-- ALTER TABLE quick_fixes DROP CONSTRAINT IF EXISTS completed_requires_verification;
-- ALTER TABLE quick_fixes ADD CONSTRAINT completed_requires_verification CHECK (
--   (status = 'completed' AND tests_passing = TRUE AND uat_verified = TRUE) OR status <> 'completed'
-- );
-- ALTER TABLE quick_fixes DROP CONSTRAINT IF EXISTS actual_loc_reasonable;
-- ALTER TABLE quick_fixes ADD CONSTRAINT actual_loc_reasonable CHECK (actual_loc IS NULL OR actual_loc <= 200);
-- ALTER TABLE quick_fixes DROP COLUMN IF EXISTS force_completed;
-- ALTER TABLE quick_fixes DROP COLUMN IF EXISTS actual_test_loc;
-- ALTER TABLE quick_fixes DROP COLUMN IF EXISTS actual_source_loc;
-- COMMIT;
