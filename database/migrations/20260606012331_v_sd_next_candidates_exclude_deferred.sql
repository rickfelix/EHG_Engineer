-- @approved-by: codestreetlabs@gmail.com
--
-- 20260606012331_v_sd_next_candidates_exclude_deferred.sql
--
-- SD-LEO-INFRA-PARKED-STATUS-REPLACE-001
--
-- Make status='deferred' the canonical "parked" state by excluding it from the
-- work-selection view v_sd_next_candidates. Previously the final WHERE blocklist
-- only excluded 'completed' and 'cancelled'; a parked (deferred) SD therefore
-- still surfaced as next-candidate work. This adds 'deferred' to the blocklist
-- so parked SDs disappear from the queue but remain queryable/recoverable.
--
-- The view body below is reproduced EXACTLY from the live definition
-- (pg_get_viewdef('public.v_sd_next_candidates')) as of 2026-06-06; the ONLY
-- change is the final WHERE array:
--   ARRAY['completed','cancelled']  ->  ARRAY['completed','cancelled','deferred']
-- Both the CASE/readiness_priority expression and the ORDER BY are preserved
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
                   FROM jsonb_array_elements_text(bi_1.dependencies_snapshot) dep(value)
                  WHERE NOT (EXISTS ( SELECT 1
                           FROM strategic_directives_v2 sd2
                          WHERE sd2.sd_key = split_part(dep.value, ' '::text, 1) AND sd2.status::text = 'completed'::text))), true) AS deps_satisfied
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
            WHEN ds.deps_satisfied AND (sd.status::text = ANY (ARRAY['draft'::character varying, 'active'::character varying]::text[])) THEN 3
            WHEN sd.progress_percentage > 0 AND sd.progress_percentage < 100 THEN 4
            ELSE 5
        END AS readiness_priority
   FROM sd_baseline_items bi
     JOIN strategic_directives_v2 sd ON bi.sd_id = sd.sd_key
     JOIN dependency_status ds ON bi.sd_id = ds.sd_id
     LEFT JOIN sd_execution_actuals ea ON bi.sd_id = ea.sd_id AND ea.baseline_id = (( SELECT active_baseline.id
           FROM active_baseline))
  WHERE bi.baseline_id = (( SELECT active_baseline.id
           FROM active_baseline)) AND (sd.status::text <> ALL (ARRAY['completed'::character varying, 'cancelled'::character varying, 'deferred'::character varying]::text[]))
  ORDER BY (
        CASE
            WHEN sd.is_working_on = true THEN 1
            WHEN ea.status = 'in_progress'::text THEN 2
            WHEN ds.deps_satisfied AND (sd.status::text = ANY (ARRAY['draft'::character varying, 'active'::character varying]::text[])) THEN 3
            WHEN sd.progress_percentage > 0 AND sd.progress_percentage < 100 THEN 4
            ELSE 5
        END), bi.sequence_rank;

COMMIT;

-- Rollback (manual): re-run CREATE OR REPLACE VIEW with the final WHERE array
-- restored to ARRAY['completed'::character varying, 'cancelled'::character varying]::text[].
