\set ON_ERROR_STOP on
\timing on

-- Expected number of stages
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_temp) THEN
    -- no-op; ensure temp schema exists
    PERFORM 1;
  END IF;
END $$;

-- 0) Discover/compose a stage catalog (prefer explicit catalog; fallback to distinct stages in progress view)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='vh_stage_catalog') THEN
    EXECUTE $q$CREATE TEMP TABLE stage_catalog AS
      SELECT COALESCE(stage_key::text, stage_name::text, stage::text) AS stage,
             COALESCE(order_index, row_number() OVER (ORDER BY COALESCE(stage_name, stage))) AS order_index
      FROM vh_stage_catalog$q$;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='vh_stages') THEN
    EXECUTE $q$CREATE TEMP TABLE stage_catalog AS
      SELECT COALESCE(stage_name::text, stage::text) AS stage,
             COALESCE(sort_order, row_number() OVER (ORDER BY COALESCE(stage_name, stage))) AS order_index
      FROM vh_stages$q$;
  ELSIF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='v_vh_stage_progress') THEN
    EXECUTE $q$CREATE TEMP TABLE stage_catalog AS
      SELECT DISTINCT stage::text AS stage,
             row_number() OVER (ORDER BY stage::text) AS order_index
      FROM v_vh_stage_progress$q$;
  ELSE
    CREATE TEMP TABLE stage_catalog(stage text, order_index int);
  END IF;
END $$;

-- Stage catalog check (expect 49, but do not fail)
\copy (
  WITH x AS (
    SELECT COUNT(*) AS actual FROM stage_catalog
  )
  SELECT 49 AS expected, actual, 
         CASE WHEN actual=49 THEN 'ok'
              WHEN actual=0 THEN 'missing_catalog'
              ELSE 'count_mismatch'
         END AS status
  FROM x
) TO 'ops/checks/out/vh_stage_catalog_check.csv' WITH CSV HEADER;

-- 1) Stage progress table (if view exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='v_vh_stage_progress') THEN
    EXECUTE $q$CREATE TEMP TABLE stage_progress AS
      SELECT venture_id, stage::text AS stage, gate_met, qa_gate_min
      FROM v_vh_stage_progress$q$;
  ELSE
    CREATE TEMP TABLE stage_progress(venture_id uuid, stage text, gate_met boolean, qa_gate_min integer);
  END IF;
END $$;

-- 2) Governance snapshot agg by venture (if view exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='v_vh_governance_snapshot') THEN
    EXECUTE $q$CREATE TEMP TABLE gov_agg AS
      SELECT venture_id,
             BOOL_OR(sd_id IS NOT NULL)  AS has_sd,
             BOOL_OR(prd_id IS NOT NULL) AS has_prd,
             MAX(last_sync_at)           AS last_sync_at
      FROM v_vh_governance_snapshot
      GROUP BY venture_id$q$;
  ELSE
    CREATE TEMP TABLE gov_agg(venture_id uuid, has_sd boolean, has_prd boolean, last_sync_at timestamptz);
  END IF;
END $$;

-- 3) Ventures universe (best-effort discovery)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='vh_ventures') THEN
    EXECUTE $q$CREATE TEMP TABLE ventures AS
      SELECT venture_id FROM vh_ventures$q$;
  ELSE
    -- fallback to whatever appears in stage_progress or governance snapshot
    CREATE TEMP TABLE ventures AS
      SELECT DISTINCT venture_id FROM stage_progress WHERE venture_id IS NOT NULL
      UNION
      SELECT DISTINCT venture_id FROM gov_agg       WHERE venture_id IS NOT NULL;
  END IF;
END $$;

-- 4) Ventures without any governance linkage (no SD and no PRD)
\copy (
  SELECT v.venture_id
  FROM ventures v
  LEFT JOIN gov_agg g ON g.venture_id = v.venture_id
  WHERE COALESCE(g.has_sd,false) = false AND COALESCE(g.has_prd,false) = false
) TO 'ops/checks/out/vh_ventures_without_governance.csv' WITH CSV HEADER;

-- 5) Stage coverage gaps: for each (venture, stage) seen in progress/catalog, flag missing SD/PRD
\copy (
  WITH universe AS (
    SELECT sp.venture_id, c.stage
    FROM stage_progress sp
    JOIN stage_catalog c ON TRUE
    WHERE sp.venture_id IS NOT NULL
  ), g AS (
    SELECT venture_id, COALESCE(has_sd,false) AS has_sd, COALESCE(has_prd,false) AS has_prd
    FROM gov_agg
  )
  SELECT u.venture_id, u.stage,
         NOT g.has_sd AS missing_sd,
         NOT g.has_prd AS missing_prd
  FROM universe u
  LEFT JOIN g ON g.venture_id = u.venture_id
  WHERE (NOT g.has_sd) OR (NOT g.has_prd)
) TO 'ops/checks/out/vh_stage_coverage_gaps.csv' WITH CSV HEADER;

-- 6) Stage readiness: gate_met vs qa_gate_min per venture-stage (if available)
\copy (
  SELECT sp.venture_id, sp.stage, sp.qa_gate_min, sp.gate_met
  FROM stage_progress sp
) TO 'ops/checks/out/vh_stage_readiness.csv' WITH CSV HEADER;

-- 7) Recommendations for missing governance (read-only)
-- Produces vh_ideation_recommendations.csv suggesting SD/PRD additions per venture-stage.
-- Attempts to include venture_name if available.

DO $$
DECLARE has_name boolean := false; has_title boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='vh_ventures' AND column_name='name'
  ) INTO has_name;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='vh_ventures' AND column_name='title'
  ) INTO has_title;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='vh_ventures') THEN
    IF has_name THEN
      EXECUTE $q$CREATE TEMP TABLE venture_label AS
        SELECT venture_id, NULLIF(trim(name::text),'') AS venture_name
        FROM vh_ventures$q$;
    ELSIF has_title THEN
      EXECUTE $q$CREATE TEMP TABLE venture_label AS
        SELECT venture_id, NULLIF(trim(title::text),'') AS venture_name
        FROM vh_ventures$q$;
    ELSE
      EXECUTE $q$CREATE TEMP TABLE venture_label AS
        SELECT venture_id, NULL::text AS venture_name
        FROM vh_ventures$q$;
    END IF;
  ELSE
    -- fallback: use discovered ventures
    EXECUTE $q$CREATE TEMP TABLE venture_label AS
      SELECT venture_id, NULL::text AS venture_name
      FROM ventures$q$;
  END IF;

  -- Backfill label if null
  EXECUTE $q$UPDATE venture_label
          SET venture_name = COALESCE(venture_name, 'Venture ' || LEFT(venture_id::text, 8))$q$;
END $$;

-- Coverage universe (same logic as stage_coverage_gaps)
WITH universe AS (
  SELECT sp.venture_id, c.stage
  FROM stage_progress sp
  JOIN stage_catalog c ON TRUE
  WHERE sp.venture_id IS NOT NULL
),
g AS (
  SELECT venture_id,
         COALESCE(has_sd,false)  AS has_sd,
         COALESCE(has_prd,false) AS has_prd
  FROM gov_agg
),
needs AS (
  SELECT u.venture_id, u.stage,
         (NOT g.has_sd)  AS missing_sd,
         (NOT g.has_prd) AS missing_prd
  FROM universe u
  LEFT JOIN g ON g.venture_id = u.venture_id
  WHERE (NOT g.has_sd) OR (NOT g.has_prd)
),
readiness AS (
  SELECT venture_id, stage, gate_met, qa_gate_min
  FROM stage_progress
),
recos AS (
  SELECT
    n.venture_id,
    vl.venture_name,
    n.stage,
    CASE
      WHEN (NOT COALESCE(r.gate_met,false)) THEN 'high'
      WHEN n.missing_sd AND n.missing_prd         THEN 'high'
      WHEN n.missing_sd OR  n.missing_prd         THEN 'medium'
      ELSE 'low'
    END AS urgency,
    CASE WHEN n.missing_sd  THEN 'SD'  END AS rec_type_sd,
    CASE WHEN n.missing_prd THEN 'PRD' END AS rec_type_prd
  FROM needs n
  LEFT JOIN readiness r  ON r.venture_id = n.venture_id AND r.stage = n.stage
  LEFT JOIN venture_label vl ON vl.venture_id = n.venture_id
),
expanded AS (
  -- one row per missing artifact
  SELECT venture_id, venture_name, stage, urgency, 'SD' AS rec_type FROM recos WHERE rec_type_sd  = 'SD'
  UNION ALL
  SELECT venture_id, venture_name, stage, urgency, 'PRD' AS rec_type FROM recos WHERE rec_type_prd = 'PRD'
),
suggest AS (
  SELECT
    venture_id,
    venture_name,
    stage,
    rec_type,
    urgency,
    CASE rec_type
      WHEN 'SD'  THEN format('Stage %s: Draft Strategic Directive for %s', stage, venture_name)
      WHEN 'PRD' THEN format('Stage %s: Author PRD for %s',               stage, venture_name)
    END AS suggested_title,
    CASE rec_type
      WHEN 'SD'  THEN 'No SD linked for this venture; create directive to formalize scope and constraints'
      WHEN 'PRD' THEN 'No PRD linked for this venture; author PRD with acceptance criteria to enable backlog'
    END AS reason,
    CASE rec_type
      WHEN 'SD'  THEN 'governance'
      WHEN 'PRD' THEN 'product'
    END AS suggested_type
  FROM expanded
)
\copy (
  SELECT
    venture_id,
    venture_name,
    stage,
    rec_type,
    urgency,
    suggested_type,
    suggested_title,
    reason
  FROM suggest
  ORDER BY urgency DESC, venture_name, stage, rec_type
) TO 'ops/checks/out/vh_ideation_recommendations.csv' WITH CSV HEADER;