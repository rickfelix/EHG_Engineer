-- ============================================================================
-- chairman_preferences: fix NULL-venture_id upsert bug via UNIQUE NULLS NOT DISTINCT
-- SD-LEO-INFRA-CHAIRMAN-QUIET-WINDOW-001 (FR-1)
--
-- PROBLEM: uq_chairman_pref_scope is UNIQUE(chairman_id, venture_id, preference_key)
-- with Postgres's default indnullsnotdistinct=false, so two rows sharing
-- (chairman_id, preference_key) but both having venture_id=NULL do NOT collide.
-- ChairmanPreferenceStore.setPreference's upsert (onConflict:
-- 'chairman_id,venture_id,preference_key') therefore INSERTS a duplicate on a
-- 2nd write instead of updating the existing global-scope row. Measured live:
-- 2 rows for notifications.quiet_hours_extended_until (created 2026-07-25 and
-- 2026-08-08) -- the shipped quiet-hours-extension feature (QF-20260720-824)
-- has been silently non-functional since its 2nd write.
--
-- FIX: dedupe first (this migration cannot be applied while duplicates exist),
-- then replace the constraint with UNIQUE NULLS NOT DISTINCT (Postgres 15+),
-- which treats NULL venture_id as equal to itself for uniqueness purposes while
-- leaving non-NULL venture_id rows independently unique by their real value.
-- Verified (PLAN-phase live PG 17.4 measurement) to be the ONLY fix compatible
-- with the existing supabase-js onConflict call with ZERO application code
-- change -- a plain partial unique index (WHERE venture_id IS NULL) fails both
-- forms PostgREST's column-list onConflict parameter can express (23505 /
-- 42P10); a predicate-qualified upsert has no supabase-js syntax.
-- ============================================================================

BEGIN;

-- Step 1: dedupe existing duplicate global-scope (venture_id IS NULL) rows,
-- keeping the most recently updated row per (chairman_id, preference_key).
-- Idempotent: on a table with no duplicates, this DELETE matches zero rows.
DELETE FROM chairman_preferences a
USING chairman_preferences b
WHERE a.chairman_id = b.chairman_id
  AND a.preference_key = b.preference_key
  AND a.venture_id IS NULL
  AND b.venture_id IS NULL
  AND a.id <> b.id
  AND (a.updated_at, a.id) < (b.updated_at, b.id);

-- Step 2: replace the constraint. Idempotent via IF EXISTS on the drop; the
-- add is a no-op-safe single statement (fails loudly, not silently, if a
-- duplicate somehow survives step 1 -- which would indicate a bug in step 1,
-- not a condition to paper over).
ALTER TABLE chairman_preferences DROP CONSTRAINT IF EXISTS uq_chairman_pref_scope;
ALTER TABLE chairman_preferences
  ADD CONSTRAINT uq_chairman_pref_scope
  UNIQUE NULLS NOT DISTINCT (chairman_id, venture_id, preference_key);

COMMIT;
