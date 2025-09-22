-- Vision Alignment Checks for STAGING
-- Read-only queries comparing vision rubric to actual database state
-- Two-app boundary: vh_* (EHG) and v_eng_*/eng_* (EHG_Engineering)
-- Source: docs/vision/rubric.yaml

\set ON_ERROR_STOP on
\timing on

-- Initialize temp schema
DO $$
BEGIN
  -- Ensure temp schema exists by creating a dummy temp table
  CREATE TEMP TABLE IF NOT EXISTS _temp_init (dummy INTEGER);
END $$;

-- ============================================================================
-- 1) Dynamic Discovery of User Stories Table
-- ============================================================================
DO $$
BEGIN
  -- Try vh_user_stories first
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='vh_user_stories') THEN
    EXECUTE $q$CREATE TEMP TABLE user_stories AS
      SELECT
        id AS story_id,
        venture_id,
        prd_id,
        sd_id,
        title,
        acceptance_criteria_json,
        state,
        priority,
        story_points,
        created_at
      FROM vh_user_stories$q$;

  -- Try generic user_stories
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_stories') THEN
    EXECUTE $q$CREATE TEMP TABLE user_stories AS
      SELECT
        COALESCE(story_id, id) AS story_id,
        venture_id,
        prd_id,
        sd_id,
        title,
        acceptance_criteria_json,
        state,
        priority,
        story_points,
        created_at
      FROM user_stories$q$;

  -- Fallback: search for any table with 'story' in name
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public'
    AND table_name LIKE '%story%'
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public'
      AND table_name = tables.table_name
      AND column_name IN ('story_id', 'id', 'prd_id', 'acceptance_criteria')
    )
  ) THEN
    -- Use the first matching table
    EXECUTE $q$CREATE TEMP TABLE user_stories AS
      SELECT
        COALESCE(story_id, id, uuid_generate_v4()::text) AS story_id,
        venture_id,
        prd_id,
        sd_id,
        COALESCE(title, name, description) AS title,
        COALESCE(acceptance_criteria_json, acceptance_criteria, '[]'::jsonb) AS acceptance_criteria_json,
        COALESCE(state, status, 'unknown') AS state,
        priority,
        story_points,
        created_at
      FROM $q$ || (
        SELECT table_name FROM information_schema.tables
        WHERE table_schema='public' AND table_name LIKE '%story%'
        LIMIT 1
      );

  -- No stories table found - create empty
  ELSE
    CREATE TEMP TABLE user_stories (
      story_id TEXT,
      venture_id UUID,
      prd_id TEXT,
      sd_id TEXT,
      title TEXT,
      acceptance_criteria_json JSONB,
      state TEXT,
      priority TEXT,
      story_points INTEGER,
      created_at TIMESTAMPTZ
    );
  END IF;
END $$;

-- ============================================================================
-- 2) Load Governance Views/Tables
-- ============================================================================

-- Stage Progress
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='v_vh_stage_progress') THEN
    EXECUTE $q$CREATE TEMP TABLE stage_progress AS
      SELECT * FROM v_vh_stage_progress$q$;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='vh_stage_progress') THEN
    EXECUTE $q$CREATE TEMP TABLE stage_progress AS
      SELECT * FROM vh_stage_progress$q$;
  ELSE
    CREATE TEMP TABLE stage_progress (
      venture_id UUID,
      stage TEXT,
      gate_met BOOLEAN,
      qa_gate_min INTEGER,
      created_at TIMESTAMPTZ
    );
  END IF;
END $$;

-- Governance Snapshot
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='v_vh_governance_snapshot') THEN
    EXECUTE $q$CREATE TEMP TABLE governance_snapshot AS
      SELECT * FROM v_vh_governance_snapshot$q$;
  ELSE
    CREATE TEMP TABLE governance_snapshot (
      venture_id UUID,
      sd_id TEXT,
      prd_id TEXT,
      backlog_id TEXT,
      gate_status TEXT,
      last_sync_at TIMESTAMPTZ
    );
  END IF;
END $$;

-- Ventures
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='vh_ventures') THEN
    EXECUTE $q$CREATE TEMP TABLE ventures AS
      SELECT
        id AS venture_id,
        COALESCE(name, title, 'Venture ' || LEFT(id::text, 8)) AS venture_name,
        status,
        created_at
      FROM vh_ventures$q$;
  ELSE
    -- Discover ventures from other tables
    CREATE TEMP TABLE ventures AS
      SELECT DISTINCT
        venture_id,
        'Venture ' || LEFT(venture_id::text, 8) AS venture_name,
        'unknown' AS status,
        NOW() AS created_at
      FROM (
        SELECT venture_id FROM stage_progress WHERE venture_id IS NOT NULL
        UNION
        SELECT venture_id FROM governance_snapshot WHERE venture_id IS NOT NULL
        UNION
        SELECT venture_id FROM user_stories WHERE venture_id IS NOT NULL
      ) v;
  END IF;
END $$;

-- Strategic Directives
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='strategic_directives_v2') THEN
    EXECUTE $q$CREATE TEMP TABLE strategic_directives AS
      SELECT
        id AS sd_id,
        COALESCE(sd_key, id) AS sd_key,
        title,
        status,
        priority,
        owner,
        decision_log_ref,
        evidence_ref,
        created_at
      FROM strategic_directives_v2$q$;
  ELSE
    CREATE TEMP TABLE strategic_directives (
      sd_id TEXT,
      sd_key TEXT,
      title TEXT,
      status TEXT,
      priority TEXT,
      owner TEXT,
      decision_log_ref TEXT,
      evidence_ref TEXT,
      created_at TIMESTAMPTZ
    );
  END IF;
END $$;

-- Product Requirements
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='product_requirements_v2') THEN
    EXECUTE $q$CREATE TEMP TABLE product_requirements AS
      SELECT
        id AS prd_id,
        directive_id AS sd_id,
        title,
        status,
        priority,
        acceptance_criteria,
        test_scenarios,
        completeness_score,
        risk_rating,
        created_at
      FROM product_requirements_v2$q$;
  ELSE
    CREATE TEMP TABLE product_requirements (
      prd_id TEXT,
      sd_id TEXT,
      title TEXT,
      status TEXT,
      priority TEXT,
      acceptance_criteria JSONB,
      test_scenarios JSONB,
      completeness_score INTEGER,
      risk_rating TEXT,
      created_at TIMESTAMPTZ
    );
  END IF;
END $$;

-- ============================================================================
-- 3) Compute Vision Alignment Metrics
-- ============================================================================

-- A. Quality Gate Pass Rate (Target: 85%)
CREATE TEMP TABLE quality_metrics AS
WITH gate_stats AS (
  SELECT
    venture_id,
    COUNT(*) AS total_stages,
    COUNT(*) FILTER (WHERE gate_met = true) AS passed_gates,
    COUNT(*) FILTER (WHERE gate_met = false) AS failed_gates,
    CASE
      WHEN COUNT(*) > 0 THEN
        ROUND(100.0 * COUNT(*) FILTER (WHERE gate_met = true) / COUNT(*), 2)
      ELSE NULL
    END AS gate_pass_rate
  FROM stage_progress
  GROUP BY venture_id
)
SELECT
  v.venture_id,
  v.venture_name,
  COALESCE(gs.gate_pass_rate, -1) AS gate_pass_rate,
  CASE
    WHEN gs.gate_pass_rate IS NULL THEN 'unknown'
    WHEN gs.gate_pass_rate >= 85 THEN 'pass'
    WHEN gs.gate_pass_rate >= 70 THEN 'warning'
    ELSE 'fail'
  END AS quality_status
FROM ventures v
LEFT JOIN gate_stats gs ON gs.venture_id = v.venture_id;

-- B. Story Coverage and AC Completeness (Target: 80%)
CREATE TEMP TABLE story_metrics AS
WITH story_stats AS (
  SELECT
    COALESCE(s.venture_id, p.venture_id, d.venture_id) AS venture_id,
    s.sd_id,
    s.prd_id,
    COUNT(DISTINCT s.story_id) AS total_stories,
    COUNT(DISTINCT s.story_id) FILTER (
      WHERE s.acceptance_criteria_json IS NOT NULL
      AND s.acceptance_criteria_json::text != '[]'
      AND s.acceptance_criteria_json::text != '{}'
    ) AS stories_with_ac,
    COUNT(DISTINCT s.story_id) FILTER (WHERE s.prd_id IS NOT NULL) AS stories_with_prd,
    COUNT(DISTINCT s.story_id) FILTER (WHERE s.sd_id IS NOT NULL) AS stories_with_sd
  FROM user_stories s
  LEFT JOIN product_requirements p ON p.prd_id = s.prd_id
  LEFT JOIN strategic_directives d ON d.sd_id = COALESCE(s.sd_id, p.sd_id)
  GROUP BY COALESCE(s.venture_id, p.venture_id, d.venture_id), s.sd_id, s.prd_id
)
SELECT
  venture_id,
  sd_id,
  prd_id,
  total_stories,
  stories_with_ac,
  stories_with_prd,
  stories_with_sd,
  CASE
    WHEN total_stories > 0 THEN
      ROUND(100.0 * stories_with_ac / total_stories, 2)
    ELSE NULL
  END AS ac_coverage_pct,
  CASE
    WHEN total_stories > 0 THEN
      ROUND(100.0 * stories_with_prd / total_stories, 2)
    ELSE NULL
  END AS prd_linkage_pct,
  CASE
    WHEN total_stories > 0 THEN
      ROUND(100.0 * stories_with_sd / total_stories, 2)
    ELSE NULL
  END AS sd_linkage_pct
FROM story_stats;

-- C. Governance Presence at Stages
CREATE TEMP TABLE governance_metrics AS
WITH gov_presence AS (
  SELECT
    v.venture_id,
    v.venture_name,
    COUNT(DISTINCT sp.stage) AS total_stages,
    COUNT(DISTINCT sp.stage) FILTER (WHERE gs.sd_id IS NOT NULL) AS stages_with_sd,
    COUNT(DISTINCT sp.stage) FILTER (WHERE gs.prd_id IS NOT NULL) AS stages_with_prd,
    EXISTS(SELECT 1 FROM strategic_directives WHERE owner IS NOT NULL LIMIT 1) AS has_owner_field,
    EXISTS(SELECT 1 FROM strategic_directives WHERE evidence_ref IS NOT NULL LIMIT 1) AS has_evidence_field
  FROM ventures v
  LEFT JOIN stage_progress sp ON sp.venture_id = v.venture_id
  LEFT JOIN governance_snapshot gs ON gs.venture_id = v.venture_id
  GROUP BY v.venture_id, v.venture_name
)
SELECT
  venture_id,
  venture_name,
  total_stages,
  stages_with_sd,
  stages_with_prd,
  CASE
    WHEN total_stages > 0 AND stages_with_sd = total_stages AND stages_with_prd = total_stages THEN 'pass'
    WHEN total_stages > 0 AND (stages_with_sd > 0 OR stages_with_prd > 0) THEN 'partial'
    WHEN total_stages = 0 THEN 'unknown'
    ELSE 'fail'
  END AS governance_status,
  has_owner_field,
  has_evidence_field
FROM gov_presence;

-- ============================================================================
-- 4) Export Vision Alignment Reports
-- ============================================================================

-- Overview: Per-venture alignment status
\copy (
  SELECT
    v.venture_id,
    v.venture_name,
    qm.gate_pass_rate,
    qm.quality_status,
    COALESCE(
      (SELECT ROUND(AVG(ac_coverage_pct), 2) FROM story_metrics WHERE venture_id = v.venture_id),
      -1
    ) AS avg_ac_coverage_pct,
    gm.governance_status,
    gm.stages_with_sd,
    gm.stages_with_prd,
    gm.total_stages,
    CASE
      WHEN qm.quality_status = 'unknown' OR gm.governance_status = 'unknown' THEN 'insufficient_data'
      WHEN qm.quality_status IN ('pass', 'warning') AND gm.governance_status IN ('pass', 'partial') THEN 'aligned'
      WHEN qm.quality_status = 'fail' OR gm.governance_status = 'fail' THEN 'misaligned'
      ELSE 'partial'
    END AS overall_alignment,
    NOW() AS assessment_timestamp
  FROM ventures v
  LEFT JOIN quality_metrics qm ON qm.venture_id = v.venture_id
  LEFT JOIN governance_metrics gm ON gm.venture_id = v.venture_id
  ORDER BY v.venture_name
) TO 'ops/checks/out/vision_alignment_overview.csv' WITH CSV HEADER;

-- Gaps: Specific unmet criteria
\copy (
  WITH gaps AS (
    -- Quality gaps
    SELECT
      venture_id,
      venture_name,
      'quality' AS pillar,
      'gate_pass_rate' AS metric,
      gate_pass_rate::text AS actual_value,
      '85' AS target_value,
      'Quality gate pass rate below 85% target' AS reason
    FROM quality_metrics
    WHERE gate_pass_rate < 85 AND gate_pass_rate >= 0

    UNION ALL

    -- AC Coverage gaps
    SELECT
      venture_id,
      venture_name,
      'quality' AS pillar,
      'ac_coverage' AS metric,
      ROUND(AVG(ac_coverage_pct), 2)::text AS actual_value,
      '80' AS target_value,
      'Story acceptance criteria coverage below 80% target' AS reason
    FROM story_metrics sm
    JOIN ventures v ON v.venture_id = sm.venture_id
    WHERE ac_coverage_pct < 80
    GROUP BY sm.venture_id, v.venture_name

    UNION ALL

    -- Governance gaps
    SELECT
      venture_id,
      venture_name,
      'governance' AS pillar,
      'sd_prd_presence' AS metric,
      governance_status AS actual_value,
      'pass' AS target_value,
      'Missing SD/PRD linkage at venture stages' AS reason
    FROM governance_metrics
    WHERE governance_status = 'fail'

    UNION ALL

    -- Trace chain gaps
    SELECT
      venture_id,
      venture_name,
      'governance' AS pillar,
      'trace_chain' AS metric,
      ROUND(AVG(sd_linkage_pct), 2)::text AS actual_value,
      '80' AS target_value,
      'SD to story linkage below 80% target' AS reason
    FROM story_metrics sm
    JOIN ventures v ON v.venture_id = sm.venture_id
    WHERE sd_linkage_pct < 80
    GROUP BY sm.venture_id, v.venture_name
  )
  SELECT
    venture_id,
    venture_name,
    pillar,
    metric,
    actual_value,
    target_value,
    reason,
    CASE
      WHEN pillar = 'quality' AND metric = 'gate_pass_rate' AND actual_value::numeric < 70 THEN 'critical'
      WHEN pillar = 'quality' AND metric = 'gate_pass_rate' AND actual_value::numeric < 85 THEN 'warning'
      WHEN pillar = 'governance' AND actual_value = 'fail' THEN 'high'
      ELSE 'medium'
    END AS urgency
  FROM gaps
  ORDER BY urgency, venture_name, pillar
) TO 'ops/checks/out/vision_alignment_gaps.csv' WITH CSV HEADER;

-- Story Coverage: Detailed per SD/PRD
\copy (
  SELECT
    sm.venture_id,
    v.venture_name,
    sm.sd_id,
    sd.title AS sd_title,
    sm.prd_id,
    pr.title AS prd_title,
    sm.total_stories,
    sm.stories_with_ac,
    sm.ac_coverage_pct,
    sm.stories_with_prd,
    sm.prd_linkage_pct,
    sm.stories_with_sd,
    sm.sd_linkage_pct,
    CASE
      WHEN sm.ac_coverage_pct >= 80 AND sm.prd_linkage_pct >= 80 AND sm.sd_linkage_pct >= 80 THEN 'good'
      WHEN sm.ac_coverage_pct >= 60 OR sm.prd_linkage_pct >= 60 OR sm.sd_linkage_pct >= 60 THEN 'fair'
      ELSE 'poor'
    END AS coverage_quality
  FROM story_metrics sm
  LEFT JOIN ventures v ON v.venture_id = sm.venture_id
  LEFT JOIN strategic_directives sd ON sd.sd_id = sm.sd_id
  LEFT JOIN product_requirements pr ON pr.prd_id = sm.prd_id
  WHERE sm.total_stories > 0
  ORDER BY v.venture_name, sd.sd_key, pr.prd_id
) TO 'ops/checks/out/vision_story_coverage.csv' WITH CSV HEADER;

-- Trace Matrix: Linkage verification
\copy (
  WITH trace AS (
    SELECT DISTINCT
      COALESCE(us.venture_id, gs.venture_id) AS venture_id,
      COALESCE(us.sd_id, pr.sd_id, gs.sd_id) AS sd_id,
      COALESCE(us.prd_id, gs.prd_id) AS prd_id,
      us.story_id,
      gs.backlog_id,
      CASE WHEN COALESCE(us.sd_id, pr.sd_id, gs.sd_id) IS NOT NULL THEN true ELSE false END AS has_sd,
      CASE WHEN COALESCE(us.prd_id, gs.prd_id) IS NOT NULL THEN true ELSE false END AS has_prd,
      CASE WHEN us.story_id IS NOT NULL THEN true ELSE false END AS has_story,
      CASE WHEN gs.backlog_id IS NOT NULL THEN true ELSE false END AS has_backlog,
      CASE
        WHEN us.acceptance_criteria_json IS NOT NULL
        AND us.acceptance_criteria_json::text NOT IN ('[]', '{}', 'null')
        THEN true
        ELSE false
      END AS has_ac
    FROM user_stories us
    FULL OUTER JOIN governance_snapshot gs ON gs.venture_id = us.venture_id
    LEFT JOIN product_requirements pr ON pr.prd_id = COALESCE(us.prd_id, gs.prd_id)
  )
  SELECT
    t.venture_id,
    v.venture_name,
    t.sd_id,
    t.prd_id,
    t.story_id,
    t.backlog_id,
    t.has_sd,
    t.has_prd,
    t.has_story,
    t.has_backlog,
    t.has_ac,
    CASE
      WHEN t.has_sd AND t.has_prd AND t.has_story AND t.has_ac THEN 'complete'
      WHEN t.has_sd AND t.has_prd THEN 'partial'
      WHEN t.has_sd OR t.has_prd OR t.has_story THEN 'incomplete'
      ELSE 'missing'
    END AS trace_status
  FROM trace t
  LEFT JOIN ventures v ON v.venture_id = t.venture_id
  WHERE t.venture_id IS NOT NULL
  ORDER BY v.venture_name, t.sd_id, t.prd_id, t.story_id
) TO 'ops/checks/out/vision_trace_matrix.csv' WITH CSV HEADER;

-- Unknown Metrics: What couldn't be measured
\copy (
  WITH unknowns AS (
    SELECT 'user_stories_table' AS metric_name,
           CASE WHEN EXISTS (SELECT 1 FROM user_stories LIMIT 1) THEN 'found' ELSE 'missing' END AS status
    UNION ALL
    SELECT 'stage_progress_view',
           CASE WHEN EXISTS (SELECT 1 FROM stage_progress LIMIT 1) THEN 'found' ELSE 'missing' END
    UNION ALL
    SELECT 'governance_snapshot_view',
           CASE WHEN EXISTS (SELECT 1 FROM governance_snapshot LIMIT 1) THEN 'found' ELSE 'missing' END
    UNION ALL
    SELECT 'strategic_directives_table',
           CASE WHEN EXISTS (SELECT 1 FROM strategic_directives LIMIT 1) THEN 'found' ELSE 'missing' END
    UNION ALL
    SELECT 'product_requirements_table',
           CASE WHEN EXISTS (SELECT 1 FROM product_requirements LIMIT 1) THEN 'found' ELSE 'missing' END
    UNION ALL
    SELECT 'ventures_table',
           CASE WHEN EXISTS (SELECT 1 FROM ventures LIMIT 1) THEN 'found' ELSE 'missing' END
    UNION ALL
    -- Vision metrics we can't calculate without data
    SELECT 'automation_coverage', 'not_implemented' -- Requires agent execution tracking
    UNION ALL
    SELECT 'agent_alignment', 'not_implemented' -- Requires rubric scoring data
    UNION ALL
    SELECT 'rule_of_40', 'not_implemented' -- Requires revenue/cost data
    UNION ALL
    SELECT 'burn_multiple', 'not_implemented' -- Requires financial data
    UNION ALL
    SELECT 'nrr_grr', 'not_implemented' -- Requires revenue retention data
  )
  SELECT
    metric_name,
    status,
    CASE
      WHEN status = 'missing' THEN 'Table/view not found in database'
      WHEN status = 'not_implemented' THEN 'Metric calculation not yet available'
      ELSE 'Metric available'
    END AS reason,
    CASE
      WHEN metric_name IN ('user_stories_table', 'stage_progress_view') AND status = 'missing' THEN 'high'
      WHEN status = 'missing' THEN 'medium'
      ELSE 'low'
    END AS impact
  FROM unknowns
  WHERE status != 'found'
  ORDER BY
    CASE impact WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
    metric_name
) TO 'ops/checks/out/vision_metrics_unknown.csv' WITH CSV HEADER;

-- ============================================================================
-- 8) Venture Story AC Coverage (read-only)
-- ============================================================================
-- Dynamically discovers a user stories table.
-- Derives venture_id via direct column or via governance snapshot join on prd_id.
-- Emits per-venture totals and AC coverage (% non-empty acceptance_criteria_json).

-- 8a) Discover stories source into a common temp "stories_src"
DO $$
DECLARE found boolean := false;
BEGIN
  -- Try vh_user_stories
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='vh_user_stories') THEN
    EXECUTE $q$CREATE TEMP TABLE stories_src AS SELECT * FROM vh_user_stories$q$;
    found := true;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_stories') THEN
    EXECUTE $q$CREATE TEMP TABLE stories_src AS SELECT * FROM user_stories$q$;
    found := true;
  ELSE
    -- Fallback: first table with 'story' in name that has at least one of {id,story_id}
    PERFORM 1 FROM information_schema.tables t
      WHERE t.table_schema='public' AND t.table_type='BASE TABLE' AND t.table_name ILIKE '%story%'
      LIMIT 1;
    IF FOUND THEN
      EXECUTE (
        SELECT format('CREATE TEMP TABLE stories_src AS SELECT * FROM %I', (SELECT t.table_name FROM information_schema.tables t
          WHERE t.table_schema='public' AND t.table_type='BASE TABLE' AND t.table_name ILIKE '%story%' LIMIT 1))
      );
      found := true;
    END IF;
  END IF;

  IF NOT found THEN
    CREATE TEMP TABLE stories_src(); -- empty shell; downstream queries will yield header-only CSV
  END IF;
END $$;

-- 8b) Normalize to "stories_normalized" with common columns we care about
CREATE TEMP TABLE stories_normalized (
  story_id uuid,
  prd_id uuid,
  sd_id uuid,
  venture_id uuid,
  acceptance_criteria_json jsonb
);

DO $$
BEGIN
  -- Check which columns exist in stories_src
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='pg_temp' AND table_name='stories_src' LIMIT 1) THEN
    -- Build dynamic INSERT based on available columns
    EXECUTE (
      'INSERT INTO stories_normalized (story_id, prd_id, sd_id, venture_id, acceptance_criteria_json) ' ||
      'SELECT ' ||
      CASE
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='pg_temp' AND table_name='stories_src' AND column_name='story_id') THEN 'story_id::uuid'
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='pg_temp' AND table_name='stories_src' AND column_name='id') THEN 'id::uuid'
        ELSE 'NULL::uuid'
      END || ', ' ||
      CASE
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='pg_temp' AND table_name='stories_src' AND column_name='prd_id') THEN 'prd_id::uuid'
        ELSE 'NULL::uuid'
      END || ', ' ||
      CASE
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='pg_temp' AND table_name='stories_src' AND column_name='sd_id') THEN 'sd_id::uuid'
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='pg_temp' AND table_name='stories_src' AND column_name='directive_id') THEN 'directive_id::uuid'
        ELSE 'NULL::uuid'
      END || ', ' ||
      CASE
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='pg_temp' AND table_name='stories_src' AND column_name='venture_id') THEN 'venture_id::uuid'
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='pg_temp' AND table_name='stories_src' AND column_name='company_id') THEN 'company_id::uuid'
        ELSE 'NULL::uuid'
      END || ', ' ||
      CASE
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='pg_temp' AND table_name='stories_src' AND column_name='acceptance_criteria_json') THEN
          'CASE WHEN acceptance_criteria_json::text IN ('''', ''null'') THEN NULL ELSE acceptance_criteria_json::jsonb END'
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='pg_temp' AND table_name='stories_src' AND column_name='acceptance_criteria') THEN
          'CASE WHEN acceptance_criteria::text IN ('''', ''null'') THEN NULL ELSE acceptance_criteria::jsonb END'
        ELSE 'NULL::jsonb'
      END ||
      ' FROM stories_src'
    );
  END IF;
END $$;

-- 8c) Governance snapshot for venture mapping (if stories lack venture_id but have prd_id)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM stories_normalized WHERE venture_id IS NOT NULL) THEN
    IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='v_vh_governance_snapshot') THEN
      -- Backfill venture_id via PRD/SD join
      UPDATE stories_normalized s
      SET venture_id = g.venture_id
      FROM v_vh_governance_snapshot g
      WHERE s.venture_id IS NULL
        AND ( (s.prd_id IS NOT NULL AND g.prd_id::uuid = s.prd_id)
           OR (s.sd_id  IS NOT NULL AND g.sd_id::uuid  = s.sd_id) );
    ELSIF EXISTS (SELECT 1 FROM governance_snapshot) THEN
      -- Use the temp table version
      UPDATE stories_normalized s
      SET venture_id = g.venture_id
      FROM governance_snapshot g
      WHERE s.venture_id IS NULL
        AND ( (s.prd_id IS NOT NULL AND g.prd_id::text = s.prd_id::text)
           OR (s.sd_id  IS NOT NULL AND g.sd_id::text  = s.sd_id::text) );
    END IF;
  END IF;
END $$;

-- 8d) Per-venture AC coverage
\copy (
  WITH base AS (
    SELECT venture_id,
           COUNT(*) AS stories_total,
           COUNT(*) FILTER (WHERE acceptance_criteria_json IS NOT NULL AND acceptance_criteria_json::text NOT IN ('[]','{}','')) AS stories_with_ac
    FROM stories_normalized
    WHERE venture_id IS NOT NULL
    GROUP BY venture_id
  )
  SELECT venture_id,
         stories_total,
         stories_with_ac,
         CASE WHEN stories_total > 0 THEN ROUND(100.0 * stories_with_ac::numeric / stories_total, 1) ELSE NULL END AS ac_coverage_pct
  FROM base
  ORDER BY ac_coverage_pct NULLS LAST, stories_total DESC
) TO 'ops/checks/out/vision_story_coverage.csv' WITH CSV HEADER;

-- 8e) Update unknown metrics tracker
\copy (
  SELECT 'story_ac_coverage_per_venture' AS metric_name,
         CASE WHEN EXISTS (SELECT 1 FROM stories_normalized WHERE venture_id IS NOT NULL) THEN 'available' ELSE 'unknown' END AS status,
         CASE WHEN EXISTS (SELECT 1 FROM stories_normalized WHERE venture_id IS NOT NULL)
              THEN 'Per-venture AC coverage calculated'
              ELSE 'No venture-linked stories found'
         END AS reason,
         'medium' AS impact
  UNION ALL
  SELECT metric_name, status, reason, impact FROM (
    WITH unknowns AS (
      SELECT 'user_stories_table' AS metric_name,
             CASE WHEN EXISTS (SELECT 1 FROM user_stories LIMIT 1) THEN 'found' ELSE 'missing' END AS status
      UNION ALL
      SELECT 'stage_progress_view',
             CASE WHEN EXISTS (SELECT 1 FROM stage_progress LIMIT 1) THEN 'found' ELSE 'missing' END
      UNION ALL
      SELECT 'governance_snapshot_view',
             CASE WHEN EXISTS (SELECT 1 FROM governance_snapshot LIMIT 1) THEN 'found' ELSE 'missing' END
      UNION ALL
      SELECT 'strategic_directives_table',
             CASE WHEN EXISTS (SELECT 1 FROM strategic_directives LIMIT 1) THEN 'found' ELSE 'missing' END
      UNION ALL
      SELECT 'product_requirements_table',
             CASE WHEN EXISTS (SELECT 1 FROM product_requirements LIMIT 1) THEN 'found' ELSE 'missing' END
      UNION ALL
      SELECT 'ventures_table',
             CASE WHEN EXISTS (SELECT 1 FROM ventures LIMIT 1) THEN 'found' ELSE 'missing' END
      UNION ALL
      -- Vision metrics we can't calculate without data
      SELECT 'automation_coverage', 'not_implemented' -- Requires agent execution tracking
      UNION ALL
      SELECT 'agent_alignment', 'not_implemented' -- Requires rubric scoring data
      UNION ALL
      SELECT 'rule_of_40', 'not_implemented' -- Requires revenue/cost data
      UNION ALL
      SELECT 'burn_multiple', 'not_implemented' -- Requires financial data
      UNION ALL
      SELECT 'nrr_grr', 'not_implemented' -- Requires revenue retention data
    )
    SELECT
      metric_name,
      status,
      CASE
        WHEN status = 'missing' THEN 'Table/view not found in database'
        WHEN status = 'not_implemented' THEN 'Metric calculation not yet available'
        ELSE 'Metric available'
      END AS reason,
      CASE
        WHEN metric_name IN ('user_stories_table', 'stage_progress_view') AND status = 'missing' THEN 'high'
        WHEN status = 'missing' THEN 'medium'
        ELSE 'low'
      END AS impact
    FROM unknowns
    WHERE status != 'found'
  ) existing_unknowns
  ORDER BY
    CASE impact WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
    metric_name
) TO 'ops/checks/out/vision_metrics_unknown.csv' WITH CSV HEADER;

-- Summary statistics
DO $$
DECLARE
  venture_count INTEGER;
  avg_gate_pass NUMERIC;
  avg_ac_coverage NUMERIC;
  gaps_count INTEGER;
  venture_ac_coverage NUMERIC;
BEGIN
  SELECT COUNT(DISTINCT venture_id) INTO venture_count FROM ventures;
  SELECT AVG(gate_pass_rate) INTO avg_gate_pass FROM quality_metrics WHERE gate_pass_rate >= 0;
  SELECT AVG(ac_coverage_pct) INTO avg_ac_coverage FROM story_metrics WHERE ac_coverage_pct IS NOT NULL;
  SELECT COUNT(*) INTO gaps_count FROM (
    SELECT venture_id FROM quality_metrics WHERE gate_pass_rate < 85 AND gate_pass_rate >= 0
    UNION
    SELECT venture_id FROM governance_metrics WHERE governance_status = 'fail'
  ) g;

  -- New: venture-level AC coverage
  SELECT AVG(ac_pct) INTO venture_ac_coverage FROM (
    SELECT venture_id,
           CASE WHEN COUNT(*) > 0
                THEN 100.0 * COUNT(*) FILTER (WHERE acceptance_criteria_json IS NOT NULL AND acceptance_criteria_json::text NOT IN ('[]','{}','')) / COUNT(*)
                ELSE NULL
           END AS ac_pct
    FROM stories_normalized
    WHERE venture_id IS NOT NULL
    GROUP BY venture_id
  ) v WHERE ac_pct IS NOT NULL;

  RAISE NOTICE 'Vision Alignment Summary:';
  RAISE NOTICE '  Ventures evaluated: %', venture_count;
  RAISE NOTICE '  Avg gate pass rate: %', COALESCE(ROUND(avg_gate_pass, 2), -1);
  RAISE NOTICE '  Avg AC coverage (SD/PRD level): %', COALESCE(ROUND(avg_ac_coverage, 2), -1);
  RAISE NOTICE '  Avg AC coverage (venture level): %', COALESCE(ROUND(venture_ac_coverage, 2), -1);
  RAISE NOTICE '  Ventures with gaps: %', gaps_count;
END $$;