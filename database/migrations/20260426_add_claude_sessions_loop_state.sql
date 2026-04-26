-- SD-LEO-INFRA-LOOP-STATE-SIGNAL-001
-- Add claude_sessions.loop_state column for coordinator observability of /loop chaining state.
-- Whitelist: active | awaiting_tick | exited | unknown.
-- DATABASE sub-agent evidence row: 9cea72f9-33f0-499b-a0cc-f83a36ff704c flagged that
-- v_active_sessions live definition has drifted from the source file (45 cols vs 14),
-- so this migration uses pg_get_viewdef() to capture the LIVE view definition rather
-- than editing the stale file.

BEGIN;

-- Step 1: Add the column with default 'unknown' so existing rows are coherent.
-- Idempotent: ADD COLUMN IF NOT EXISTS guards re-application.
-- CHECK enforces the 4-value whitelist (NULL is permitted because IN(...) against NULL
-- evaluates to UNKNOWN which the CHECK accepts; explicit IS NULL is redundant).
ALTER TABLE claude_sessions
  ADD COLUMN IF NOT EXISTS loop_state TEXT DEFAULT 'unknown';

-- Add the CHECK constraint separately so we can guard against duplicate creation.
-- The IF NOT EXISTS pattern on constraints requires DO block + catalog probe.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'claude_sessions_loop_state_check'
      AND conrelid = 'claude_sessions'::regclass
  ) THEN
    ALTER TABLE claude_sessions
      ADD CONSTRAINT claude_sessions_loop_state_check
      CHECK (loop_state IN ('active', 'awaiting_tick', 'exited', 'unknown'));
  END IF;
END$$;

-- Step 2: Refresh v_active_sessions to expose the new column.
-- Capture the LIVE view definition (pg_get_viewdef returns the SELECT body), wrap it
-- in a CREATE OR REPLACE VIEW, and append loop_state to the projection. This avoids
-- re-typing 45 columns from a file that has drifted from production.
DO $$
DECLARE
  view_body TEXT;
BEGIN
  SELECT pg_get_viewdef('v_active_sessions'::regclass, true) INTO view_body;

  -- Only refresh if loop_state is not already in the view body
  IF view_body NOT LIKE '%loop_state%' THEN
    -- Strip trailing semicolon from pg_get_viewdef output
    view_body := regexp_replace(view_body, ';\s*$', '');
    -- The view body is "SELECT col1, col2, ... FROM ..."
    -- We append `, claude_sessions.loop_state` to the SELECT projection. The simplest
    -- way is to re-CREATE OR REPLACE with the body wrapped in a subquery + the new col.
    EXECUTE format(
      'CREATE OR REPLACE VIEW v_active_sessions AS SELECT _v.*, _cs.loop_state FROM (%s) _v LEFT JOIN claude_sessions _cs ON _cs.session_id = _v.session_id',
      view_body
    );
  END IF;
END$$;

COMMIT;

-- Step 3: Refresh PostgREST schema cache so clients see the new column without restart.
NOTIFY pgrst, 'reload schema';
