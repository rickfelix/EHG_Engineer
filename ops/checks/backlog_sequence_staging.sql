\set ON_ERROR_STOP on
\timing on

-- Backlog Sequencing v1 (read-only)
-- Rationale:
-- - Use real staging data.
-- - Exclude broken items (orphans / PRD contract violations).
-- - Score = 0.6 * normalized priority + 0.4 * PRD completeness - dependency penalty.
-- - Accepts both priority vocabularies: {P0..P3} or {High,Medium,Low}.
-- - Flags dependency issues (dangling refs & simple two-cycles) and penalizes them.

-- 0) Prepare dependency issue flags (temp table), dynamic columns where present.
DO $$
DECLARE col text;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS dep_bad(backlog_id uuid PRIMARY KEY) ON COMMIT DROP;

  -- Columns we care about; only act if column exists.
  FOR col IN SELECT unnest(ARRAY['parent_id','depends_on','blocked_by','predecessor_id']) LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='sd_backlog_map' AND column_name=col
    ) THEN
      -- Dangling references: set but target missing
      EXECUTE format($f$
        INSERT INTO dep_bad(backlog_id)
        SELECT s.backlog_id
        FROM sd_backlog_map s
        LEFT JOIN sd_backlog_map t ON t.backlog_id = s.%I
        WHERE s.%I IS NOT NULL AND t.backlog_id IS NULL
        ON CONFLICT DO NOTHING;
      $f$, col, col);

      -- 2-cycles: A→B and B→A, record A only
      EXECUTE format($f$
        INSERT INTO dep_bad(backlog_id)
        SELECT a.backlog_id
        FROM sd_backlog_map a
        JOIN sd_backlog_map b ON b.backlog_id = a.%I
        WHERE a.%I IS NOT NULL
          AND b.%I IS NOT NULL
          AND b.%I = a.backlog_id
          AND a.backlog_id < b.backlog_id
        ON CONFLICT DO NOTHING;
      $f$, col, col, col, col);
    END IF;
  END LOOP;
END $$;

-- 1) Priority normalization
WITH priority_map AS (
  SELECT 'P0' AS v, 4::numeric AS s UNION ALL
  SELECT 'P1', 3 UNION ALL
  SELECT 'P2', 2 UNION ALL
  SELECT 'P3', 1 UNION ALL
  SELECT 'High', 3 UNION ALL
  SELECT 'Medium', 2 UNION ALL
  SELECT 'Low', 1
),
-- 2) PRDs that pass the contract checks (same rules as your asserts)
prd_ok AS (
  SELECT p.id, p.completeness_score, p.risk_rating
  FROM product_requirements_v2 p
  JOIN strategic_directives_v2 sd ON sd.id = p.sd_id
  WHERE p.completeness_score BETWEEN 0 AND 100
    AND p.risk_rating IN ('low','medium','high')
),
candidates AS (
  SELECT
    b.backlog_id,
    b.sd_key,
    b.prd_id,
    COALESCE(b.title, b.description) AS title,
    b.item_type,
    b.status,
    b.priority,
    pm.s AS priority_n,
    po.completeness_score,
    (po.completeness_score::numeric / 100.0) AS completeness_n,
    (d.backlog_id IS NOT NULL) AS has_dep_issue,
    -- scoring: 0.6 priority + 0.4 completeness - 0.5 penalty if dep issue
    (0.6 * COALESCE(pm.s,0)
     + 0.4 * COALESCE(po.completeness_score::numeric,0) / 100.0
     - CASE WHEN d.backlog_id IS NOT NULL THEN 0.5 ELSE 0 END)::numeric
    AS sequence_score
  FROM sd_backlog_map b
  JOIN prd_ok po         ON po.id = b.prd_id              -- drop orphans & bad PRDs
  LEFT JOIN priority_map pm ON pm.v = b.priority
  LEFT JOIN dep_bad d    ON d.backlog_id = b.backlog_id
)
\copy (
  SELECT
    row_number() over (order by sequence_score desc, priority_n desc, completeness_n desc) as suggested_rank,
    backlog_id, sd_key, prd_id, title, item_type, status, priority,
    priority_n, completeness_score, has_dep_issue, sequence_score
  FROM candidates
  ORDER BY suggested_rank
) TO 'sequence_candidates.csv' WITH CSV HEADER;