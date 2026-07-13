-- Fix cleanup_expired_coordination(): P0003 crash + archive-before-delete + guard predicates
-- SD-FDBK-FIX-BUS-RETENTION-CLEANUP-001 (FR-1)
--
-- Prior body used `DELETE ... RETURNING 1 INTO deleted_count` -- a scalar INTO that raises
-- P0003 too_many_rows whenever the DELETE matches more than one row, rolling back the whole
-- statement. This has been a silent no-op for months (caller swallows the error).
--
-- This version: (a) uses GET DIAGNOSTICS ROW_COUNT instead of a scalar INTO, (b) archives
-- every deleted row into retention_archive BEFORE deleting (mirrors scripts/retention-enforce.js's
-- proven archive-before-delete invariant), aborting with zero deletes on any archive/delete
-- count mismatch, and (c) only ever deletes rows that are expired AND (acknowledged OR read
-- >=7 days ago) -- expired-but-never-surfaced rows (read_at IS NULL AND acknowledged_at IS
-- NULL) are NEVER deleted here; they are already routed through the existing dead-letter pass
-- (lib/sweep/passes/dead-letter-planning.cjs), which stamps payload.dead_letter=true rather
-- than deleting.

CREATE OR REPLACE FUNCTION cleanup_expired_coordination()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count integer;
  archived_count integer;
BEGIN
  -- Snapshot the exact candidate id set once, so the archive INSERT and the
  -- DELETE operate on identically the same rows (no re-evaluation race).
  CREATE TEMP TABLE IF NOT EXISTS _cleanup_expired_coord_candidates (id uuid) ON COMMIT DROP;
  DELETE FROM _cleanup_expired_coord_candidates;

  INSERT INTO _cleanup_expired_coord_candidates (id)
  SELECT id FROM session_coordination
  WHERE expires_at < now()
    AND (
      acknowledged_at IS NOT NULL
      OR (read_at IS NOT NULL AND read_at <= now() - interval '7 days')
    );

  INSERT INTO retention_archive (source_table, source_id, row_data, row_timestamp, archived_by)
  SELECT 'session_coordination', sc.id::text, to_jsonb(sc), sc.expires_at, 'cleanup_expired_coordination'
  FROM session_coordination sc
  JOIN _cleanup_expired_coord_candidates c ON c.id = sc.id;
  GET DIAGNOSTICS archived_count = ROW_COUNT;

  DELETE FROM session_coordination sc
  USING _cleanup_expired_coord_candidates c
  WHERE sc.id = c.id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF archived_count <> deleted_count THEN
    RAISE EXCEPTION 'cleanup_expired_coordination archive/delete count mismatch: archived=%, deleted=%', archived_count, deleted_count;
  END IF;

  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_expired_coordination() IS
  'Archive-before-delete cleanup of expired session_coordination rows. Only deletes rows that are acknowledged or read >=7d ago; never-surfaced rows are routed via the dead-letter pass instead. Fixed P0003 (SD-FDBK-FIX-BUS-RETENTION-CLEANUP-001).';
