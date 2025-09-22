\set ON_ERROR_STOP on
\timing on

-- Tunables (override via -v in workflow)
\set W_BV 1.0
\set W_TC 1.0
\set W_RR 1.0
\set W_JS 1.0
\set MAX_MOVE 3

-- --- Optional helpers: table/column existence checks via catalog queries are
-- done inline using EXISTS predicates to keep this script portable.

-- Venture mapping (optional view)
CREATE TEMP TABLE _sd_venture AS
SELECT DISTINCT s.id AS sd_id, gs.venture_id
FROM strategic_directives_v2 s
LEFT JOIN v_vh_governance_snapshot gs ON gs.sd_id = s.id;

-- PRD metrics per SD (handle both sd_id and directive_id columns)
CREATE TEMP TABLE _prd_metrics AS
WITH prd_unified AS (
  SELECT p.*,
         -- Unify both column names for compatibility
         COALESCE(
           CASE
             WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name='product_requirements_v2'
                         AND column_name='sd_id')
             THEN p.sd_id::text
             ELSE NULL
           END,
           CASE
             WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name='product_requirements_v2'
                         AND column_name='directive_id')
             THEN p.directive_id::text
             ELSE NULL
           END
         ) AS sd_id_unified
  FROM product_requirements_v2 p
)
SELECT prd.sd_id_unified AS sd_id,
       AVG(NULLIF(prd.completeness_score,0))                 AS prd_completeness_avg,  -- 0..100
       AVG(CASE lower(prd.risk_rating)
             WHEN 'low' THEN 0
             WHEN 'medium' THEN 0.5
             WHEN 'high' THEN 1
             ELSE 0.5 END)                                       AS prd_risk_avg           -- 0..1
FROM prd_unified prd
WHERE prd.sd_id_unified IS NOT NULL
GROUP BY prd.sd_id_unified;

-- Story AC coverage per SD (if a stories table exists). We try vh_user_stories first.
DO $
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_tables WHERE tablename='vh_user_stories') THEN
    CREATE TEMP TABLE _stories_norm AS
    SELECT s.id::uuid AS story_id,
           s.prd_id::uuid,
           s.sd_id::uuid,
           NULLIF(trim(CAST(s.acceptance_criteria_json AS text)),'') AS ac_json
    FROM vh_user_stories s;
  ELSIF EXISTS (SELECT 1 FROM pg_catalog.pg_tables WHERE tablename='user_stories') THEN
    CREATE TEMP TABLE _stories_norm AS
    SELECT s.id::uuid AS story_id,
           s.prd_id::uuid,
           s.sd_id::uuid,
           NULLIF(trim(CAST(s.acceptance_criteria_json AS text)),'') AS ac_json
    FROM user_stories s;
  ELSE
    CREATE TEMP TABLE _stories_norm (story_id uuid, prd_id uuid, sd_id uuid, ac_json text);
  END IF;
END $;

CREATE TEMP TABLE _ac_by_sd AS
WITH prd_unified AS (
  SELECT p.id,
         COALESCE(
           CASE
             WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name='product_requirements_v2'
                         AND column_name='sd_id')
             THEN p.sd_id::text
             ELSE NULL
           END,
           CASE
             WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name='product_requirements_v2'
                         AND column_name='directive_id')
             THEN p.directive_id::text
             ELSE NULL
           END
         ) AS sd_id_unified
  FROM product_requirements_v2 p
)
SELECT COALESCE(sn.sd_id::text, prd.sd_id_unified) AS sd_id,
       COUNT(*)::int AS stories_total,
       COUNT(*) FILTER (WHERE ac_json IS NOT NULL AND ac_json <> '[]')::int AS stories_with_ac
FROM _stories_norm sn
LEFT JOIN prd_unified prd ON prd.id = sn.prd_id
GROUP BY COALESCE(sn.sd_id::text, prd.sd_id_unified);

-- Gate pass rate per venture (optional view)
CREATE TEMP TABLE _gate_by_v AS
SELECT venture_id,
       AVG(CASE WHEN lower(gate_met) IN ('t','true','1','yes') THEN 1.0 ELSE 0.0 END) AS gate_pass_rate
FROM v_vh_stage_progress
GROUP BY venture_id;

-- Dependency extraction from sd_backlog_map (handle optional dep columns)
CREATE TEMP TABLE _deps_acc(backlog_id uuid, dep_value uuid, dep_col text);

INSERT INTO _deps_acc
SELECT backlog_id, depends_on, 'depends_on'
FROM sd_backlog_map
WHERE EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name='sd_backlog_map' AND column_name='depends_on'
) AND depends_on IS NOT NULL;

INSERT INTO _deps_acc
SELECT backlog_id, blocked_by, 'blocked_by'
FROM sd_backlog_map
WHERE EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name='sd_backlog_map' AND column_name='blocked_by'
) AND blocked_by IS NOT NULL;

INSERT INTO _deps_acc
SELECT backlog_id, parent_id, 'parent_id'
FROM sd_backlog_map
WHERE EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name='sd_backlog_map' AND column_name='parent_id'
) AND parent_id IS NOT NULL;

INSERT INTO _deps_acc
SELECT backlog_id, predecessor_id, 'predecessor_id'
FROM sd_backlog_map
WHERE EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name='sd_backlog_map' AND column_name='predecessor_id'
) AND predecessor_id IS NOT NULL;

CREATE TEMP VIEW _deps AS SELECT * FROM _deps_acc;

-- Map backlog items to SD (for dep degrees)
CREATE TEMP TABLE _backlog_by_sd AS
SELECT b.backlog_id, b.sd_id
FROM sd_backlog_map b
WHERE b.sd_id IS NOT NULL;

CREATE TEMP TABLE _dep_signals AS
WITH out_dep AS (
  SELECT s.sd_id, COUNT(*)::int AS out_deg
  FROM _backlog_by_sd s
  JOIN _deps d ON d.backlog_id = s.backlog_id
  GROUP BY s.sd_id
),
in_dep AS (
  SELECT s2.sd_id, COUNT(*)::int AS in_deg
  FROM _backlog_by_sd s2
  JOIN _deps d ON d.dep_value = s2.backlog_id
  GROUP BY s2.sd_id
)
SELECT COALESCE(o.sd_id, i.sd_id) AS sd_id,
       COALESCE(o.out_deg,0) AS out_deg,
       COALESCE(i.in_deg,0)  AS in_deg
FROM out_dep o
FULL OUTER JOIN in_dep i USING (sd_id);

-- Consolidated SD metrics (note: uses execution_order, not strategic_directive_sequence)
CREATE TEMP TABLE _sd_metrics AS
SELECT s.id AS sd_id,
       s.execution_order AS current_execution_order,
       v.venture_id,
       COALESCE(pm.prd_completeness_avg,0) AS prd_completeness_avg,   -- 0..100
       COALESCE(pm.prd_risk_avg,0.5)       AS prd_risk_avg,           -- 0..1
       COALESCE(ac.stories_total,0)        AS stories_total,
       COALESCE(ac.stories_with_ac,0)      AS stories_with_ac,
       COALESCE(gv.gate_pass_rate,0.0)     AS gate_pass_rate,
       COALESCE(ds.out_deg,0)              AS out_deg,
       COALESCE(ds.in_deg,0)               AS in_deg
FROM strategic_directives_v2 s
LEFT JOIN _sd_venture v ON v.sd_id = s.id
LEFT JOIN _prd_metrics pm ON pm.sd_id = s.id
LEFT JOIN _ac_by_sd ac ON ac.sd_id = s.id
LEFT JOIN _gate_by_v gv ON gv.venture_id = v.venture_id
LEFT JOIN _dep_signals ds ON ds.sd_id = s.id;

-- Compute WSJF proxy
CREATE TEMP TABLE _wsjf AS
WITH base AS (
  SELECT m.*,
         CASE WHEN stories_total > 0
              THEN (stories_with_ac::numeric / stories_total)
              ELSE NULL END AS ac_cov,
         NULLIF(m.prd_completeness_avg,0) AS prd_comp_safe
  FROM _sd_metrics m
),
norm AS (
  SELECT *,
         (COALESCE(out_deg,0))::numeric              AS bv_unblock,
         (1.0 - COALESCE(ac_cov,0.0))::numeric       AS bv_cov_gap,
         (1.0 - COALESCE(gate_pass_rate,0.0))::numeric AS tc_gate,
         COALESCE(prd_risk_avg,0.5)::numeric         AS rr_risk,
         (1.0 - COALESCE(prd_completeness_avg,0)/100.0)::numeric AS js_incomp,
         COALESCE(in_deg,0)::numeric                 AS js_in_deg
  FROM base
),
score AS (
  SELECT *,
    ( :W_BV * (bv_unblock*0.5 + bv_cov_gap*0.5) ) +
    ( :W_TC * (tc_gate*0.7 + bv_cov_gap*0.3) )   +
    ( :W_RR * (rr_risk*0.6 + bv_cov_gap*0.4) )   AS numerator,
    ( :W_JS * (GREATEST(js_incomp*0.7 + LEAST(js_in_deg,5)*0.3, 0.05)) ) AS denom
  FROM norm
)
SELECT sd_id, venture_id, current_execution_order,
       (numerator / denom) AS wsjf_score,
       CONCAT(
         'unblocks=', out_deg,
         '; in_deg=', in_deg,
         '; gate_pass=', to_char(COALESCE(gate_pass_rate,0.0),'FM0.00'),
         '; ac_cov=', to_char(COALESCE(ac_cov,0.0),'FM0.00'),
         '; prd_comp=', to_char(COALESCE(prd_completeness_avg,0.0),'FM00')
       ) AS rationale
FROM score;

-- Rank within venture and propose bounded movement around current_execution_order
CREATE TEMP TABLE _ranked AS
SELECT sd_id, venture_id, current_execution_order, wsjf_score, rationale,
       ROW_NUMBER() OVER (PARTITION BY venture_id ORDER BY wsjf_score DESC NULLS LAST) AS wsjf_rank
FROM _wsjf;

-- Suggested execution_order: gently nudge toward WSJF rank, capped by ±MAX_MOVE
CREATE TEMP TABLE _suggest AS
SELECT sd_id, venture_id, current_execution_order, wsjf_score, rationale, wsjf_rank,
       CASE
         WHEN current_execution_order IS NULL THEN wsjf_rank
         ELSE
           GREATEST(1,
             LEAST(
               current_execution_order + :MAX_MOVE::int,
               GREATEST(1, wsjf_rank - :MAX_MOVE::int)
             )
           )
       END AS suggested_execution_order
FROM _ranked;

\copy (
  SELECT venture_id, sd_id, current_execution_order, suggested_execution_order, wsjf_score, rationale
  FROM _suggest
  ORDER BY venture_id NULLS LAST, suggested_execution_order ASC, wsjf_score DESC
) TO 'ops/checks/out/wsjf_recommendations.csv' WITH CSV HEADER;