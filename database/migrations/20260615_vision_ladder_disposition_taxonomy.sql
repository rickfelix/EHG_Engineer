-- 20260615_vision_ladder_disposition_taxonomy.sql
-- SD-LEO-INFRA-VISION-LADDER-V1-001 (FR-2 / FR-3): honest conversion_ledger disposition
-- taxonomy + 4 new idea-source intake pools.
--
-- ADDITIVE + REVERSIBLE. conversion_ledger is EMPTY (0 rows) so there is no data to migrate.
-- The disposition CHECK is EXTENDED to a SUPERSET (old values are kept so there is no
-- code/migration ordering hazard — the new code can emit new values, any straggler old
-- value still validates). The "retire 'deferred'" goal is enforced at the GAUGE level:
-- backlogDepth() counts only the 5 honest TERMINAL values as dispositioned, so a parking
-- 'deferred' (and an in-flight 'converted') correctly count as UN-dispositioned (HONEST-GAUGE:
-- could-not-machine-verify != done; an SD created-but-not-LIVE is NOT 'built').
--
-- CHAIRMAN PROD-DEPLOY GATE: this migration is intentionally NOT yet attested. Before applying
-- to production with `node scripts/apply-migration.js <file> --prod-deploy`, the CHAIRMAN must
-- add `-- @approved-by: <chairman-email>` (matching git user.email). Ships DORMANT.

BEGIN;

-- (FR-2) Honest disposition taxonomy. The 5 terminal MECE values are
--   built | already_covered | duplicate | declined | deferred_to_rung
-- 'converted' is retained as a NON-terminal in-flight marker (SD created, awaiting
-- completion+live before a probe promotes it to 'built'). The legacy values
-- (dismissed, merged_duplicate, deferred) are kept ALLOWED for safety but the new code
-- no longer EMITS them and the gauge does not credit them.
ALTER TABLE conversion_ledger DROP CONSTRAINT IF EXISTS conversion_ledger_disposition_check;
ALTER TABLE conversion_ledger ADD CONSTRAINT conversion_ledger_disposition_check
  CHECK (disposition IS NULL OR disposition IN (
    -- 5 honest TERMINAL values
    'built', 'already_covered', 'duplicate', 'declined', 'deferred_to_rung',
    -- non-terminal in-flight
    'converted',
    -- legacy (kept allowed; not emitted by new code; not credited by the gauge)
    'dismissed', 'merged_duplicate', 'deferred'
  ));

-- (FR-2) target_rung for deferred_to_rung (closed enum; NOT 'someday'/'backlog'/null-meaning-anything).
ALTER TABLE conversion_ledger ADD COLUMN IF NOT EXISTS target_rung text
  CHECK (target_rung IS NULL OR target_rung IN ('v2', 'v3'));

-- (FR-3) Register the 4 new idea-source pools alongside the existing 3.
ALTER TABLE conversion_ledger DROP CONSTRAINT IF EXISTS conversion_ledger_source_pool_check;
ALTER TABLE conversion_ledger ADD CONSTRAINT conversion_ledger_source_pool_check
  CHECK (source_pool IN (
    'eva_consultant_rec', 'sd_proposal', 'prd_payload_file',
    'todoist_todo', 'youtube_playlist', 'ehg_folder', 'estate_corpus'
  ));

-- In-DB self-verification (proves the constraints at apply time; rows are deleted so the
-- table stays empty). Wrapped so a failure aborts the migration loudly.
DO $verify$
DECLARE rejected boolean;
BEGIN
  -- a new TERMINAL value + a new pool + target_rung are ACCEPTED
  INSERT INTO conversion_ledger (source_pool, source_id, title, disposition, target_rung)
    VALUES ('estate_corpus', '__vl_verify_ok__', 'verify', 'deferred_to_rung', 'v2');
  DELETE FROM conversion_ledger WHERE source_id = '__vl_verify_ok__';

  -- an UNKNOWN disposition is REJECTED (constraint is real, not permissive)
  rejected := false;
  BEGIN
    INSERT INTO conversion_ledger (source_pool, source_id, title, disposition)
      VALUES ('estate_corpus', '__vl_verify_bad__', 'verify', 'not_a_real_disposition');
    DELETE FROM conversion_ledger WHERE source_id = '__vl_verify_bad__';
  EXCEPTION WHEN check_violation THEN rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'vision-ladder taxonomy verify: an unknown disposition was NOT rejected';
  END IF;

  -- an UNKNOWN pool is REJECTED
  rejected := false;
  BEGIN
    INSERT INTO conversion_ledger (source_pool, source_id, title)
      VALUES ('__not_a_pool__', '__vl_verify_pool__', 'verify');
    DELETE FROM conversion_ledger WHERE source_id = '__vl_verify_pool__';
  EXCEPTION WHEN check_violation THEN rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'vision-ladder taxonomy verify: an unknown source_pool was NOT rejected';
  END IF;
END
$verify$;

COMMIT;

-- ROLLBACK (reverse):
--   ALTER TABLE conversion_ledger DROP COLUMN IF EXISTS target_rung;
--   ALTER TABLE conversion_ledger DROP CONSTRAINT IF EXISTS conversion_ledger_disposition_check;
--   ALTER TABLE conversion_ledger ADD CONSTRAINT conversion_ledger_disposition_check
--     CHECK (disposition IS NULL OR disposition IN ('converted','dismissed','merged_duplicate','deferred'));
--   ALTER TABLE conversion_ledger DROP CONSTRAINT IF EXISTS conversion_ledger_source_pool_check;
--   ALTER TABLE conversion_ledger ADD CONSTRAINT conversion_ledger_source_pool_check
--     CHECK (source_pool IN ('eva_consultant_rec','sd_proposal','prd_payload_file'));
