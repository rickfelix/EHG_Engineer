-- @approved-by: codestreetlabs@gmail.com
-- Qualify the unqualified DELETE in cleanup_expired_coordination()
-- QF-20260713-277 (co-owned with Adam d02c9e34; follow-up to
-- SD-FDBK-FIX-BUS-RETENTION-CLEANUP-001 / 20260713_fix_cleanup_expired_coordination.sql)
--
-- The D5 apply-ceremony for that migration ran successfully (CREATE OR REPLACE FUNCTION
-- is idempotent), but the deployed function then failed at CALL time: `DELETE FROM
-- _cleanup_expired_coord_candidates;` (line 28 of the original migration) has no WHERE
-- clause. Postgres' own safe-delete guard rejects this at execution:
--   error 21000: "DELETE requires a WHERE clause"
-- confirmed live via `supabase.rpc('cleanup_expired_coordination')` this session. The bus
-- (~21k session_coordination rows, 20,175 eligible) has been unable to drain since.
--
-- This is a temp table scoped to the calling session/transaction (ON COMMIT DROP), so
-- deleting every row in it is intentional and safe -- it just needs to be an explicit,
-- qualified delete rather than a bare one. `WHERE true` is the minimal fix.

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
  DELETE FROM _cleanup_expired_coord_candidates WHERE true;

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
  'Archive-before-delete cleanup of expired session_coordination rows. Only deletes rows that are acknowledged or read >=7d ago; never-surfaced rows are routed via the dead-letter pass. Fixed P0003 (SD-FDBK-FIX-BUS-RETENTION-CLEANUP-001) and the unqualified-DELETE safe-delete-guard rejection (QF-20260713-277).';
