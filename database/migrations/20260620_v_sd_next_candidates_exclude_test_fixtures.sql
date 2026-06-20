-- @approved-by: codestreetlabs@gmail.com
--
-- 20260620_v_sd_next_candidates_exclude_test_fixtures.sql
--
-- SD-LEO-FEAT-TEST-FIXTURE-SDS-001
--
-- Test-fixture SDs (TEST-*, SD-DEMO-RACE-*/SD-DEMO-*) created transiently by race-condition /
-- lifecycle tests leak into v_sd_next_candidates, so an autonomous worker's self_claim grabs a
-- phantom (often already-dropped) SD — wasting a claim cycle and, for remediation fixtures, a
-- LEAD review. This adds two key-prefix exclusions to the work-selection view so fixture SDs never
-- surface as next-candidate work. Real SDs are unaffected: every genuine SD is prefixed by a
-- category (SD-LEO-*, SD-EHG-*, SD-FDBK-*, SD-MAN-*, QF-*, ...); neither 'TEST-%' nor 'SD-DEMO-%'
-- matches them — notably SD-LEO-FEAT-TEST-FIXTURE-SDS-001 (this SD) starts with SD-LEO- and is NOT
-- excluded.
--
-- The view body below is reproduced EXACTLY from the live definition
-- (pg_get_viewdef('public.v_sd_next_candidates') as of 2026-06-20); the ONLY change is the two added
-- final-WHERE predicates:
--   AND sd.sd_key NOT LIKE 'TEST-%'
--   AND sd.sd_key NOT LIKE 'SD-DEMO-%'
-- The dependency_status CTE, the CASE/readiness_priority expression, and the ORDER BY are preserved
-- verbatim. No other behavior is altered.

BEGIN;

CREATE OR REPLACE VIEW public.v_sd_next_candidates AS
 WITH active_baseline AS (
         SELECT sd_execution_baselines.id
           FROM sd_execution_baselines
          WHERE sd_execution_baselines.is_active = true
         LIMIT 1
        ), dependency_status AS (
         SELECT bi_1.sd_id,
            bi_1.sequence_rank,
            bi_1.track,
            bi_1.dependencies_snapshot,
            COALESCE(( SELECT count(*) = 0
                   FROM jsonb_array_elements(
                        CASE
                            WHEN jsonb_typeof(bi_1.dependencies_snapshot) = 'array'::text THEN bi_1.dependencies_snapshot
                            ELSE '[]'::jsonb
                        END) dep(value)
                     CROSS JOIN LATERAL ( SELECT
                                CASE
                                    WHEN jsonb_typeof(dep.value) = 'string'::text THEN split_part(dep.value #>> '{}'::text[], ' '::text, 1)
                                    WHEN jsonb_typeof(dep.value) = 'object'::text THEN COALESCE(dep.value ->> 'sd_key'::text, dep.value ->> 'sd_id'::text, dep.value ->> 'orchestrator'::text)
                                    ELSE NULL::text
                                END AS ref) r
                  WHERE r.ref IS NOT NULL AND lower(r.ref) <> 'none'::text AND (EXISTS ( SELECT 1
                           FROM strategic_directives_v2 sd2
                          WHERE (sd2.sd_key = r.ref OR sd2.id::text = r.ref) AND sd2.status::text <> 'completed'::text))), true) AS deps_satisfied
           FROM sd_baseline_items bi_1
          WHERE bi_1.baseline_id = (( SELECT active_baseline.id
                   FROM active_baseline))
        )
 SELECT bi.sd_id,
    sd.title,
    sd.priority,
    sd.status,
    sd.progress_percentage,
    bi.sequence_rank,
    bi.track,
    bi.track_name,
    bi.estimated_effort_hours,
    bi.dependency_health_score,
    ds.deps_satisfied,
    ea.status AS execution_status,
    sd.is_working_on,
        CASE
            WHEN sd.is_working_on = true THEN 1
            WHEN ea.status = 'in_progress'::text THEN 2
            WHEN ds.deps_satisfied AND (sd.status::text = ANY (ARRAY['draft'::character varying::text, 'active'::character varying::text])) THEN 3
            WHEN sd.progress_percentage > 0 AND sd.progress_percentage < 100 THEN 4
            ELSE 5
        END AS readiness_priority
   FROM sd_baseline_items bi
     JOIN strategic_directives_v2 sd ON bi.sd_id = sd.sd_key
     JOIN dependency_status ds ON bi.sd_id = ds.sd_id
     LEFT JOIN sd_execution_actuals ea ON bi.sd_id = ea.sd_id AND ea.baseline_id = (( SELECT active_baseline.id
           FROM active_baseline))
  WHERE bi.baseline_id = (( SELECT active_baseline.id
           FROM active_baseline)) AND (sd.status::text <> ALL (ARRAY['completed'::character varying::text, 'cancelled'::character varying::text, 'deferred'::character varying::text]))
    AND sd.sd_key NOT LIKE 'TEST-%'
    AND sd.sd_key NOT LIKE 'SD-DEMO-%'
  ORDER BY (
        CASE
            WHEN sd.is_working_on = true THEN 1
            WHEN ea.status = 'in_progress'::text THEN 2
            WHEN ds.deps_satisfied AND (sd.status::text = ANY (ARRAY['draft'::character varying::text, 'active'::character varying::text])) THEN 3
            WHEN sd.progress_percentage > 0 AND sd.progress_percentage < 100 THEN 4
            ELSE 5
        END), bi.sequence_rank;

COMMIT;

-- Rollback (manual): re-run CREATE OR REPLACE VIEW with the two
--   AND sd.sd_key NOT LIKE 'TEST-%' / 'SD-DEMO-%'
-- predicates removed from the final WHERE.
