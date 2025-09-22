\set ON_ERROR_STOP on
\timing on

-- Tunables (override via -v in workflow)
\set DRY_RUN 1
\set MAX_MOVE 2
\set PER_VENTURE_LIMIT 3
\set MIN_SCORE 0
\set PROPOSED_BY 'wsjf'

BEGIN;

-- Ensure review-surface table exists (no-op if already created)
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

-- Candidate set: pending, clean (no violation), within MAX_MOVE, score ≥ MIN_SCORE,
-- and target execution_order not already occupied by another SD.
DROP TABLE IF EXISTS _candidates;
CREATE TEMP TABLE _candidates AS
SELECT
  p.id,
  p.sd_id,
  p.venture_id,
  p.current_execution_order,
  p.proposed_execution_order,
  p.wsjf_score,
  p.rationale
FROM eng_sequence_proposals p
JOIN strategic_directives_v2 s ON s.id = p.sd_id
LEFT JOIN strategic_directives_v2 tgt
  ON tgt.execution_order = p.proposed_execution_order
  AND tgt.id <> p.sd_id
WHERE p.proposed_by = :'PROPOSED_BY'
  AND p.status = 'pending'
  AND p.violation IS NULL
  AND p.wsjf_score >= :MIN_SCORE::numeric
  AND (p.current_execution_order IS NULL
       OR abs(p.proposed_execution_order - p.current_execution_order) <= :MAX_MOVE::int)
  AND tgt.id IS NULL;  -- target slot free or same SD

-- Rank within venture (NULL venture_id grouped together)
DROP TABLE IF EXISTS _ranked;
CREATE TEMP TABLE _ranked AS
SELECT c.*,
       ROW_NUMBER() OVER (
         PARTITION BY COALESCE(c.venture_id, '00000000-0000-0000-0000-000000000000'::uuid)
         ORDER BY c.wsjf_score DESC NULLS LAST, c.proposed_execution_order ASC
       ) AS rnk
FROM _candidates c;

-- Pick top N per venture
DROP TABLE IF EXISTS _to_accept;
CREATE TEMP TABLE _to_accept AS
SELECT * FROM _ranked WHERE rnk <= :PER_VENTURE_LIMIT::int;

-- Mark them accepted
UPDATE eng_sequence_proposals p
SET status = 'accepted', proposed_at = now()
FROM _to_accept a
WHERE p.id = a.id
  AND p.status = 'pending';

-- Results for artifact
\copy (
  SELECT p.venture_id, p.sd_id, p.current_execution_order, p.proposed_execution_order,
         p.wsjf_score, p.status, p.violation, p.proposed_at
  FROM eng_sequence_proposals p
  WHERE p.proposed_by = :'PROPOSED_BY'
    AND p.status IN ('accepted','pending','invalid')
  ORDER BY p.status DESC, p.venture_id NULLS LAST, p.proposed_execution_order
) TO 'ops/checks/out/wsjf_bulk_accept_results.csv' WITH CSV HEADER;

\echo DRY_RUN=:DRY_RUN  MAX_MOVE=:MAX_MOVE  PER_VENTURE_LIMIT=:PER_VENTURE_LIMIT  MIN_SCORE=:MIN_SCORE
\if :DRY_RUN = '1'
  \echo '*** DRY RUN: rolling back bulk-accept'
  ROLLBACK;
\else
  \echo '*** COMMIT: bulk-accept persisted'
  COMMIT;
\endif