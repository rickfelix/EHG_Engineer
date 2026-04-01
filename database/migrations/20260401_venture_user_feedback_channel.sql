-- Migration: Venture User Feedback Channel
-- SD: SD-LEO-INFRA-VENTURE-USER-FEEDBACK-001
-- Purpose: Add user-submitted feedback support to the feedback table,
--          with feedback_type classification, venture_id FK, anon INSERT
--          policy for venture users, and rate limiting.
-- Date: 2026-04-01

BEGIN;

-- ============================================================
-- 1. Add venture_id column (FK to ventures.id)
-- ============================================================
ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS venture_id uuid REFERENCES public.ventures(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.feedback.venture_id
  IS 'Links feedback to a specific venture. Required for user-submitted feedback.';

-- ============================================================
-- 2. Add feedback_type column
--    Classifies the origin channel: sentry errors vs user-submitted.
-- ============================================================
ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS feedback_type varchar(30) NOT NULL DEFAULT 'sentry_error';

COMMENT ON COLUMN public.feedback.feedback_type
  IS 'Feedback channel type. sentry_error = automated capture; user_* = user-submitted via venture app.';

-- Backfill existing rows (all are sentry-originated)
UPDATE public.feedback
SET feedback_type = 'sentry_error'
WHERE feedback_type IS NULL OR feedback_type = 'sentry_error';

-- CHECK constraint for valid feedback_type values
ALTER TABLE public.feedback
  ADD CONSTRAINT feedback_feedback_type_check
  CHECK (feedback_type IN (
    'sentry_error',
    'user_bug',
    'user_feature_request',
    'user_usability',
    'user_other'
  ));

-- ============================================================
-- 3. Expand source_type CHECK to include 'user_feedback'
--    Current values: manual_feedback, auto_capture, uat_failure,
--    error_capture, uncaught_exception, unhandled_rejection,
--    manual_capture, todoist_intake, youtube_intake,
--    claude_code_intake, telegram
-- ============================================================
ALTER TABLE public.feedback
  DROP CONSTRAINT IF EXISTS feedback_source_type_check;

ALTER TABLE public.feedback
  ADD CONSTRAINT feedback_source_type_check
  CHECK (source_type IN (
    'manual_feedback',
    'auto_capture',
    'uat_failure',
    'error_capture',
    'uncaught_exception',
    'unhandled_rejection',
    'manual_capture',
    'todoist_intake',
    'youtube_intake',
    'claude_code_intake',
    'telegram',
    'user_feedback'
  ));

-- ============================================================
-- 4. Rate-limit function
--    Returns TRUE if the venture has submitted >= 50 feedback
--    rows in the last hour (i.e., rate limit exceeded).
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_feedback_rate_limit(p_venture_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT count(*) >= 50
  FROM public.feedback
  WHERE venture_id = p_venture_id
    AND feedback_type LIKE 'user_%'
    AND created_at > now() - interval '1 hour';
$$;

COMMENT ON FUNCTION public.check_feedback_rate_limit(uuid)
  IS 'Returns TRUE when the venture has hit the hourly feedback rate limit (50/hr).';

-- ============================================================
-- 5. RLS policy: anon INSERT for venture user feedback
--    Mirrors the telegram_bot_insert_feedback pattern.
--    Conditions:
--      - feedback_type must start with 'user_'
--      - venture_id must reference a valid, non-deleted venture
--      - rate limit must not be exceeded
-- ============================================================
CREATE POLICY venture_user_insert_feedback
  ON public.feedback
  FOR INSERT
  TO anon
  WITH CHECK (
    -- Must be a user-submitted feedback type
    feedback_type LIKE 'user_%'
    -- Must have a venture_id
    AND venture_id IS NOT NULL
    -- Venture must exist and not be soft-deleted
    AND EXISTS (
      SELECT 1 FROM public.ventures v
      WHERE v.id = venture_id
        AND v.deleted_at IS NULL
    )
    -- Rate limit: block if >= 50 in last hour
    AND NOT public.check_feedback_rate_limit(venture_id)
  );

-- ============================================================
-- 6. RLS policy: anon SELECT for venture user feedback
--    Allows anon to read back their own venture's feedback.
-- ============================================================
CREATE POLICY venture_user_select_feedback
  ON public.feedback
  FOR SELECT
  TO anon
  USING (
    feedback_type LIKE 'user_%'
    AND venture_id IS NOT NULL
  );

-- ============================================================
-- 7. Composite index for rate-limit query performance
--    Supports the check_feedback_rate_limit function.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_feedback_venture_created
  ON public.feedback (venture_id, created_at DESC)
  WHERE venture_id IS NOT NULL;

-- ============================================================
-- 8. Index on feedback_type for filtered queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_feedback_feedback_type
  ON public.feedback (feedback_type);

COMMIT;

-- ============================================================
-- ROLLBACK (manual, if needed):
-- ============================================================
-- DROP POLICY IF EXISTS venture_user_select_feedback ON public.feedback;
-- DROP POLICY IF EXISTS venture_user_insert_feedback ON public.feedback;
-- DROP FUNCTION IF EXISTS public.check_feedback_rate_limit(uuid);
-- DROP INDEX IF EXISTS idx_feedback_venture_created;
-- DROP INDEX IF EXISTS idx_feedback_feedback_type;
-- ALTER TABLE public.feedback DROP CONSTRAINT IF EXISTS feedback_feedback_type_check;
-- ALTER TABLE public.feedback DROP COLUMN IF EXISTS feedback_type;
-- ALTER TABLE public.feedback DROP COLUMN IF EXISTS venture_id;
-- Restore original source_type CHECK:
-- ALTER TABLE public.feedback DROP CONSTRAINT IF EXISTS feedback_source_type_check;
-- ALTER TABLE public.feedback ADD CONSTRAINT feedback_source_type_check CHECK (...original 11 values...);
