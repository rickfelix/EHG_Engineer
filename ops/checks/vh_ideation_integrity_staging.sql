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