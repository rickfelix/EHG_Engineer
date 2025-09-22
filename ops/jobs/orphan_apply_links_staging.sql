-- Apply curated orphan→PRD links in STAGING only.
-- Idempotent; transactional; DRY_RUN supported.
\set ON_ERROR_STOP on
\set DRY_RUN :DRY_RUN

BEGIN;

-- 0) Input table from CSV: ops/inbox/orphan_links.csv
-- Expected headers: backlog_id,chosen_prd_id,action,comment
CREATE TEMP TABLE orphan_links_in (
  backlog_id     uuid NOT NULL,
  chosen_prd_id  uuid,
  action         text DEFAULT 'link',   -- 'link' | 'archive' | 'ignore' (only 'link' applied)
  comment        text
) ON COMMIT DROP;

\copy orphan_links_in (backlog_id,chosen_prd_id,action,comment)
  FROM 'ops/inbox/orphan_links.csv' WITH CSV HEADER;

-- 1) Sanity checks
-- a) Supported actions
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM orphan_links_in WHERE action NOT IN ('link','archive','ignore')
  ) THEN
    RAISE EXCEPTION 'Unsupported action present; only link/archive/ignore allowed';
  END IF;
END $$;

-- b) No duplicate backlog_id instructions
DO $$
BEGIN
  IF EXISTS (
    SELECT backlog_id FROM orphan_links_in
    GROUP BY backlog_id HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate backlog_id instructions detected';
  END IF;
END $$;

-- 2) Compute valid link candidates
WITH valid_links AS (
  SELECT i.backlog_id, i.chosen_prd_id
  FROM orphan_links_in i
  JOIN sd_backlog_map b ON b.backlog_id = i.backlog_id
  JOIN product_requirements_v2 p ON p.id = i.chosen_prd_id
  WHERE i.action = 'link'
    AND i.chosen_prd_id IS NOT NULL
    AND b.prd_id IS NULL             -- must still be an orphan
)
-- 3) Apply links
, upd AS (
  UPDATE sd_backlog_map b
  SET prd_id = v.chosen_prd_id
  FROM valid_links v
  WHERE b.backlog_id = v.backlog_id
  RETURNING b.backlog_id, v.chosen_prd_id
)
-- 4) Report results (psql prints rows)
SELECT 'linked' AS op, COUNT(*) AS rows_changed FROM upd;

-- 5) Report skipped items for operator feedback
-- Skipped: missing PRD, not orphan anymore, or non-'link' action
WITH reasons AS (
  SELECT i.backlog_id,
         CASE
           WHEN i.action <> 'link' THEN 'non_link_action'
           WHEN i.chosen_prd_id IS NULL THEN 'no_prd_supplied'
           WHEN NOT EXISTS (SELECT 1 FROM sd_backlog_map b WHERE b.backlog_id = i.backlog_id) THEN 'backlog_not_found'
           WHEN EXISTS (SELECT 1 FROM sd_backlog_map b WHERE b.backlog_id = i.backlog_id AND b.prd_id IS NOT NULL) THEN 'not_orphan'
           WHEN NOT EXISTS (SELECT 1 FROM product_requirements_v2 p WHERE p.id = i.chosen_prd_id) THEN 'prd_not_found'
           ELSE 'other'
         END AS skip_reason
  FROM orphan_links_in i
  WHERE NOT EXISTS (
    SELECT 1 FROM sd_backlog_map b
    JOIN product_requirements_v2 p ON p.id = i.chosen_prd_id
    WHERE b.backlog_id = i.backlog_id
      AND b.prd_id IS NULL
      AND i.action = 'link'
      AND i.chosen_prd_id IS NOT NULL
  )
)
SELECT 'skipped' AS op, skip_reason, COUNT(*) AS rows
FROM reasons
GROUP BY skip_reason
ORDER BY skip_reason;

-- Commit or rollback
\if :DRY_RUN
  ROLLBACK;
  \echo 'DRY RUN: orphan link changes rolled back'
\else
  COMMIT;
  \echo 'APPLIED: orphan link changes committed'
\endif