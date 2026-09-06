-- Restore v_story_verification_status and v_sd_release_gate (SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-E-B)
--
-- Both views are referenced from mounted, live code (src/api/stories.js, GET /api/stories
-- and GET /api/stories/gate) but are absent from the live database. They were originally
-- defined by supabase/ehg_engineer/migrations/20250922112148_schema_user-stories.sql
-- (2025-09-22), which this migration reproduces verbatim for these two views only -- the
-- ALTER TABLE columns that migration also added to sd_backlog_map (item_type, parent_id,
-- sequence_no, verification_status, verification_source, acceptance_criteria, priority)
-- are already present live (confirmed via database/schema-reference-snapshot.json), so no
-- table change is needed here.
--
-- A LATER migration (20260124_update_views_remove_legacy_id.sql) replaced these view names
-- with incompatible schemas built on a different base (v_sd_keys / user_stories) that do not
-- match what src/api/stories.js actually queries (it expects sd_key, sequence_no, status,
-- total_stories, passing_count, etc. -- not the Jan 24 version's verification_status /
-- sd_title / uuid_id shape). Neither historical version is live today. This migration
-- restores the Sept 22 definitions, the only ones matching current code.
--
-- Idempotent (CREATE OR REPLACE VIEW), additive-only, no table changes.

BEGIN;

CREATE OR REPLACE VIEW v_story_verification_status AS
SELECT
  sd_id AS sd_key,
  backlog_id AS story_key,
  backlog_title AS story_title,
  item_type,
  sequence_no,
  verification_status AS status,
  last_verified_at AS last_run_at,
  verification_source->>'build_id' AS build_id,
  (verification_source->>'coverage_pct')::numeric AS coverage_pct,
  verification_source->>'test_run_id' AS test_run_id,
  acceptance_criteria,
  priority,
  parent_id
FROM sd_backlog_map
WHERE item_type IN ('story', 'task');

CREATE OR REPLACE VIEW v_sd_release_gate AS
SELECT
  sd_id AS sd_key,
  COUNT(*) AS total_stories,
  COUNT(*) FILTER (WHERE verification_status = 'passing') AS passing_count,
  COUNT(*) FILTER (WHERE verification_status = 'failing') AS failing_count,
  COUNT(*) FILTER (WHERE verification_status = 'not_run') AS not_run_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE verification_status = 'passing') /
    NULLIF(COUNT(*), 0), 2) AS passing_pct,
  (COUNT(*) FILTER (WHERE verification_status = 'passing') = COUNT(*)
    AND COUNT(*) > 0) AS ready
FROM sd_backlog_map
WHERE item_type = 'story'
GROUP BY sd_id;

COMMIT;
