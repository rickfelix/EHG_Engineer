-- Staging-only normalization fixes. Idempotent. Low-risk only.
-- Guards and dry-run controlled by the workflow (vars).
\set ON_ERROR_STOP on
\set DRY_RUN :DRY_RUN  -- psql -v DRY_RUN=1|0

BEGIN;

-- --- PRD CONTRACT FIXES (product_requirements_v2) ---

-- 1) Clamp completeness_score to [0,100]
WITH upd AS (
  UPDATE product_requirements_v2 p
  SET completeness_score = LEAST(100, GREATEST(0, p.completeness_score))
  WHERE p.completeness_score IS NOT NULL
    AND (p.completeness_score < 0 OR p.completeness_score > 100)
  RETURNING 1
)
SELECT 'fix_prd_completeness', COUNT(*) AS rows_changed FROM upd;

-- 2) Default invalid/null risk_rating -> 'medium'
WITH upd AS (
  UPDATE product_requirements_v2 p
  SET risk_rating = 'medium'
  WHERE p.risk_rating IS NULL
     OR p.risk_rating NOT IN ('low','medium','high')
  RETURNING 1
)
SELECT 'fix_prd_risk', COUNT(*) AS rows_changed FROM upd;

-- 3) Normalize empty/missing acceptance_criteria_json -> '[]'
WITH upd AS (
  UPDATE product_requirements_v2 p
  SET acceptance_criteria_json = '[]'::jsonb
  WHERE p.acceptance_criteria_json IS NULL
     OR p.acceptance_criteria_json::text IN ('{}','[]','')
  RETURNING 1
)
SELECT 'fix_prd_acceptance', COUNT(*) AS rows_changed FROM upd;


-- --- BACKLOG SHAPE FIXES (sd_backlog_map) ---

-- Normalize common priority variants; keep legit sets; fallback to lowest.
-- Accepted sets: P0..P3 or High/Medium/Low
-- Map lowercase & synonyms; anything else -> 'P3'
WITH norm AS (
  SELECT
    backlog_id,
    CASE
      WHEN priority IN ('P0','P1','P2','P3','High','Medium','Low') THEN priority
      WHEN lower(priority) = 'p0' THEN 'P0'
      WHEN lower(priority) = 'p1' THEN 'P1'
      WHEN lower(priority) = 'p2' THEN 'P2'
      WHEN lower(priority) = 'p3' THEN 'P3'
      WHEN lower(priority) = 'high' THEN 'High'
      WHEN lower(priority) = 'medium' THEN 'Medium'
      WHEN lower(priority) = 'low' THEN 'Low'
      ELSE 'P3'
    END AS new_priority
  FROM sd_backlog_map
  WHERE priority IS NULL
     OR priority NOT IN ('P0','P1','P2','P3','High','Medium','Low')
),
upd AS (
  UPDATE sd_backlog_map b
  SET priority = n.new_priority
  FROM norm n
  WHERE b.backlog_id = n.backlog_id
    AND b.priority IS DISTINCT FROM n.new_priority
  RETURNING 1
)
SELECT 'fix_backlog_priority', COUNT(*) AS rows_changed FROM upd;

-- NOTE: We intentionally DO NOT auto-fill type/state/qa_floor, and we DO NOT link orphans here.

-- Commit or rollback based on DRY_RUN
\if :DRY_RUN
  ROLLBACK;
  \echo 'DRY RUN: changes rolled back'
\else
  COMMIT;
  \echo 'APPLIED: changes committed'
\endif