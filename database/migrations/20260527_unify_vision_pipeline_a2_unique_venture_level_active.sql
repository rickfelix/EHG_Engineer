-- SD-LEO-INFRA-UNIFY-VENTURE-NON-001 / Child A.2
-- Unique partial index on (venture_id, level) WHERE venture_id IS NOT NULL AND status='active'.
--
-- DEVIATION FROM SD SCOPE: brainstorm prescribed WHERE venture_id IS NOT NULL only.
-- Execution-time revision: narrower filter to AND status='active' avoids blocking
-- legitimate upserts when a venture has both an archived (draft_seed) stub AND a
-- new active rich L2 (the post-Phase-0 transitional state). Original intent — prevent
-- two ACTIVE L2 docs per venture — is preserved.

-- Pre-flight: ensure no current duplicates exist in the index's scope.
DO $$
DECLARE dup_count INT;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT venture_id, level, COUNT(*) AS n
    FROM eva_vision_documents
    WHERE venture_id IS NOT NULL AND status = 'active' AND level = 'L2'
    GROUP BY venture_id, level
    HAVING COUNT(*) > 1
  ) d;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'eva_vision_documents has % duplicate active (venture_id, level) groups — resolve before adding the unique index', dup_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS eva_vision_documents_venture_level_active_uniq
  ON eva_vision_documents (venture_id, level)
  WHERE venture_id IS NOT NULL AND status = 'active';

COMMENT ON INDEX eva_vision_documents_venture_level_active_uniq IS
  'Prevents two ACTIVE L2 vision docs per venture. Narrower than brainstorm-prescribed filter — see migration header for rationale.';
