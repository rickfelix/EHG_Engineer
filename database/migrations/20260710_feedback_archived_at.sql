-- Migration: Add feedback.archived_at (nullable timestamptz)
-- SD: SD-LEO-INFRA-HARNESS-BACKLOG-DRAIN-POLICY-001 (FR-6, TR-1)
-- Purpose: archive-not-delete age-out for the new 'informational_note' terminal
--          category. feedback.status already has a CHECK constraint with no
--          'archived' value; adding one would be a higher-risk constraint
--          migration (out of scope per this SD's rationale). archived_at is
--          additive-only -- nullable, no default, no existing constraint touched,
--          no data loss. A row with archived_at set is never deleted.
-- Date: 2026-07-10
-- @approved-by: codestreetlabs@gmail.com

BEGIN;

ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN public.feedback.archived_at IS
  'SD-LEO-INFRA-HARNESS-BACKLOG-DRAIN-POLICY-001 FR-6: set by the age-out job for '
  'category=''informational_note'' rows untouched 30+ days. NULL means active/not '
  'archived. Archive-not-delete: the row is never removed, only marked.';

COMMIT;

-- ============================================================
-- ROLLBACK (manual, if needed):
-- ============================================================
-- BEGIN;
-- ALTER TABLE public.feedback DROP COLUMN IF EXISTS archived_at;
-- COMMIT;
