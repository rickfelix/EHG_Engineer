-- Migration: Add Telegram bot RLS policies to feedback table
-- Context: The Telegram chairman bot edge function uses the anon key to insert
--          feedback items, but RLS blocks it. We need scoped INSERT and SELECT
--          policies for the anon role.
-- Date: 2026-02-23
--
-- IMPORTANT: The feedback_source_type_check constraint did NOT previously include
--            'telegram' as an allowed value. Step 1 updates the CHECK constraint.
--
-- Changes:
--   1. Drop and recreate feedback_source_type_check to include 'telegram'
--   2. Create RLS INSERT policy for anon role scoped to source_type = 'telegram'
--   3. Create RLS SELECT policy for anon role scoped to source_type = 'telegram'
--      (needed for PostgREST .insert().select() to return the inserted row)
--
-- Rollback:
--   DROP POLICY IF EXISTS telegram_bot_insert_feedback ON feedback;
--   DROP POLICY IF EXISTS telegram_bot_select_feedback ON feedback;
--   ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_source_type_check;
--   ALTER TABLE feedback ADD CONSTRAINT feedback_source_type_check
--     CHECK (source_type IN ('manual_feedback','auto_capture','uat_failure',
--       'error_capture','uncaught_exception','unhandled_rejection','manual_capture',
--       'todoist_intake','youtube_intake','claude_code_intake'));

-- Step 1: Update the CHECK constraint to include 'telegram'
ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_source_type_check;

ALTER TABLE feedback ADD CONSTRAINT feedback_source_type_check
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
    'telegram'
  ));

-- Step 2: Create scoped RLS INSERT policy for anon role
-- Only allows INSERT when source_type = 'telegram' (Telegram bot context)
CREATE POLICY telegram_bot_insert_feedback ON feedback
  FOR INSERT
  TO anon
  WITH CHECK (source_type = 'telegram');

-- Step 3: Create scoped RLS SELECT policy for anon role
-- Only allows reading rows with source_type = 'telegram'
-- Required for PostgREST to return the inserted row via .insert().select()
CREATE POLICY telegram_bot_select_feedback ON feedback
  FOR SELECT
  TO anon
  USING (source_type = 'telegram');
