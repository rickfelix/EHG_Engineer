-- @approved-by: codestreetlabs@gmail.com
--
-- 20260621_v_sd_next_candidates_deps_satisfied_live.sql
--
-- SD-REFILL-002WFTGJ
--
-- REGRESSION/incomplete-coverage: v_sd_next_candidates.deps_satisfied reported TRUE for clearly
-- dep-blocked SDs. The view computed deps_satisfied from the BASELINE SNAPSHOT
-- (sd_baseline_items.dependencies_snapshot), which is a point-in-time copy taken at baseline
-- creation. The authoritative claim-time guard (lib/fleet/claim-eligibility.cjs / sd-start
-- CLAIM-VALIDITY) computes dep_blocked from strategic_directives_v2.dependencies DIRECTLY (live).
-- So when an SD's dependencies are added/changed AFTER the snapshot, the view shows deps_satisfied=
-- true while the guard correctly blocks the claim — workers self-claim a view-'ready' SD, get
-- bounced at claim time, and churn (no breach, but wasted cycles). Documented live instances:
-- INITIATIVE-BACKBONE-CANONICAL-001 (deps on REVIVE-EVA-MASTER/MAKE-EHG-ENGINEER/MAKE-EHG-CHAIRMAN,
-- all draft/LEAD), UNBLOCK-PORTFOLIO-WIDE-001, SURFACE-PORTFOLIO-PERFORMANCE-001.
--
-- FIX: align the view's deps_satisfied with the authoritative source — read LIVE
-- strategic_directives_v2.dependencies (joined per baseline item) instead of the stale
-- dependencies_snapshot. The ref-parsing, the non-completed EXISTS check, the COALESCE(...,true)
-- empty-deps default, the readiness_priority CASE, the TEST-%/SD-DEMO-% exclusions, and the ORDER BY
-- are all preserved VERBATIM from the live definition (pg_get_viewdef('public.v_sd_next_candidates')
-- as of 2026-06-21). The ONLY change is the dependency_status CTE: it now JOINs
-- strategic_directives_v2 sdx ON sdx.sd_key = bi_1.sd_id and reads sdx.dependencies in place of
-- bi_1.dependencies_snapshot. The added INNER JOIN loses no rows the outer query would keep — the
-- outer query already INNER JOINs strategic_directives_v2 on the same key.

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
                            WHEN jsonb_typeof(sdx.dependencies) = 'array'::text THEN sdx.dependencies
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
             JOIN strategic_directives_v2 sdx ON sdx.sd_key = bi_1.sd_id
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

-- Rollback (manual): re-run CREATE OR REPLACE VIEW with the dependency_status CTE reading
--   bi_1.dependencies_snapshot (drop the `JOIN strategic_directives_v2 sdx ON sdx.sd_key = bi_1.sd_id`
--   and revert the jsonb_typeof/THEN source back to bi_1.dependencies_snapshot).
