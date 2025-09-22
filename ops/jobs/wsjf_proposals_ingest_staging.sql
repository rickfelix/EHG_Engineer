\set ON_ERROR_STOP on
\timing on

-- Tunables (override in workflow via -v)
\set DRY_RUN 1
\set MAX_MOVE 2
\set CSV_PATH 'ops/checks/out/wsjf_recommendations.csv'
\set PROPOSED_BY 'wsjf'

BEGIN;

-- 1) Review surface table (create if missing)
CREATE TABLE IF NOT EXISTS eng_sequence_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id uuid NOT NULL REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
  venture_id uuid,
  current_execution_order int,
  proposed_execution_order int NOT NULL,
  wsjf_score numeric,
  rationale text,
  proposed_by text NOT NULL DEFAULT 'wsjf',
  proposed_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','rejected','invalid','applied')),
  violation text
);

CREATE UNIQUE INDEX IF NOT EXISTS eng_sequence_proposals_uniq
  ON eng_sequence_proposals(sd_id, proposed_execution_order, proposed_by);

CREATE INDEX IF NOT EXISTS eng_sequence_proposals_status_idx
  ON eng_sequence_proposals(status);

-- 2) Load CSV into a temp table
DROP TABLE IF EXISTS _wsjf_csv;
CREATE TEMP TABLE _wsjf_csv (
  venture_id text,
  sd_id uuid,
  current_execution_order int,
  suggested_execution_order int,
  wsjf_score numeric,
  rationale text
);

\echo Loading WSJF CSV from :CSV_PATH
\copy _wsjf_csv FROM :'CSV_PATH' WITH (FORMAT csv, HEADER true);

-- 3) Validate & annotate against live SDs
DROP TABLE IF EXISTS _wsjf_validated;
CREATE TEMP TABLE _wsjf_validated AS
WITH sd AS (
  SELECT id AS sd_id, execution_order AS db_execution_order
  FROM strategic_directives_v2
),
j AS (
  SELECT c.*, s.db_execution_order
  FROM _wsjf_csv c
  LEFT JOIN sd s USING (sd_id)
)
SELECT
  j.venture_id,
  j.sd_id,
  j.current_execution_order,
  j.suggested_execution_order,
  j.wsjf_score,
  j.rationale,
  j.db_execution_order,
  CASE
    WHEN j.sd_id IS NULL OR j.db_execution_order IS NULL THEN 'sd_not_found'
    WHEN j.current_execution_order IS NOT NULL AND j.current_execution_order <> j.db_execution_order THEN 'stale_current'
    WHEN j.db_execution_order IS NULL THEN 'no_current'
    WHEN abs(j.suggested_execution_order - j.db_execution_order) > :MAX_MOVE::int THEN 'max_move_exceeded'
    ELSE NULL
  END AS violation
FROM j;

-- 4) Insert proposals (both valid and invalid, but mark invalid)
--    Upsert is conservative: do not overwrite manually curated statuses.
INSERT INTO eng_sequence_proposals (
  sd_id, venture_id, current_execution_order, proposed_execution_order,
  wsjf_score, rationale, proposed_by, status, violation
)
SELECT
  sd_id,
  NULLIF(venture_id,'')::uuid,
  db_execution_order,
  suggested_execution_order,
  wsjf_score,
  rationale,
  :'PROPOSED_BY',
  CASE WHEN violation IS NULL THEN 'pending' ELSE 'invalid' END,
  violation
FROM _wsjf_validated v
ON CONFLICT (sd_id, proposed_execution_order, proposed_by)
DO NOTHING;

-- 5) Reporting (for artifact)
\copy (
  WITH ins AS (
    SELECT sd_id, proposed_execution_order, status, violation, proposed_at
    FROM eng_sequence_proposals
    WHERE proposed_by = :'PROPOSED_BY'
      AND proposed_at > now() - interval '10 minutes'
  )
  SELECT * FROM ins
  ORDER BY status, proposed_execution_order
) TO 'ops/checks/out/wsjf_ingest_results.csv' WITH CSV HEADER;

-- 6) Commit vs rollback
\echo DRY_RUN=:DRY_RUN  MAX_MOVE=:MAX_MOVE
\if :DRY_RUN = '1'
  \echo "*** DRY RUN: rolling back proposals ingest"
  ROLLBACK;
\else
  \echo "*** COMMIT: proposals ingested"
  COMMIT;
\endif