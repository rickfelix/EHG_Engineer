-- @approved-by:codestreetlabs@gmail.com
-- SD-LEO-ORCH-ADAM-PLAN-KEEPER-001-E (FR-4): repoint v_okr_hierarchy off the
-- dormant legacy strategic_vision row (a5ecb994, code EHG-2028) onto the
-- canonical chairman-approved eva_vision_documents L1 (VISION-EHG-L1-001).
--
-- Output column shape is PRESERVED exactly (vision_id, vision_code,
-- vision_title, vision_statement + objective/KR columns + progress_pct) so
-- downstream consumers are unaffected; only the VALUES change (that is the
-- repoint). Source mappings:
--   vision_code      <- vd.vision_key                    (legacy: sv.code)
--   vision_title     <- first markdown H1 line of content (legacy: sv.title;
--                       eva_vision_documents has no title column)
--   vision_statement <- the 'final one-line takeaway' section, markdown
--                       wrapper stripped                  (legacy: sv.statement)
--
-- Objectives join is DUAL-COLUMN (o.eva_vision_id OR o.vision_id): the A1a
-- substrate (SD-LEO-INFRA-INITIATIVE-BACKBONE-CANONICAL-001, PR #4538)
-- backfilled eva_vision_id = canonical for all 8 existing objectives (whose
-- vision_id still carries the legacy id until sibling -D's cutover), while the
-- repointed OKR generator writes vision_id = canonical for NEW objectives.
-- Either column matching keeps every objective visible through the cutover.
--
-- Validated via BEGIN…ROLLBACK round-trip before apply; applied via
-- apply-migration.js 3-factor prod guard. Prior body documented (defanged)
-- at the bottom for rollback.

CREATE OR REPLACE VIEW v_okr_hierarchy AS
SELECT vd.id AS vision_id,
    vd.vision_key::text AS vision_code,  -- ::text — legacy sv.code was text; C-O-R VIEW cannot change column types
    regexp_replace(split_part(replace(vd.content, chr(13), ''), chr(10), 1), '^#+\s*', '') AS vision_title,
    trim(BOTH FROM regexp_replace(regexp_replace(replace(COALESCE(vd.sections ->> 'part_xii_the_final_oneline_takeaway', ''), '**', ''), '^[>\s]+', ''), '\n+\s*---\s*$', '')) AS vision_statement,
    o.id AS objective_id,
    o.code AS objective_code,
    o.title AS objective_title,
    o.cadence,
    o.period,
    o.is_active AS objective_active,
    kr.id AS kr_id,
    kr.code AS kr_code,
    kr.title AS kr_title,
    kr.metric_type,
    kr.baseline_value,
    kr.current_value,
    kr.target_value,
    kr.unit,
    kr.direction,
    kr.confidence,
    kr.status AS kr_status,
    kr.is_active AS kr_active,
    kr.vision_dimension_code,
    kr.source_type,
        CASE
            WHEN kr.target_value = kr.baseline_value THEN
            CASE
                WHEN kr.current_value >= kr.target_value THEN 100
                ELSE 0
            END::numeric
            ELSE LEAST(100::numeric, GREATEST(0::numeric, round((kr.current_value - COALESCE(kr.baseline_value, 0::numeric)) / NULLIF(kr.target_value - COALESCE(kr.baseline_value, 0::numeric), 0::numeric) * 100::numeric)))
        END AS progress_pct
   FROM eva_vision_documents vd
     LEFT JOIN objectives o ON (o.eva_vision_id = vd.id OR o.vision_id = vd.id)
     LEFT JOIN key_results kr ON kr.objective_id = o.id
  WHERE vd.vision_key = 'VISION-EHG-L1-001'
    AND vd.status = 'active'
    AND vd.chairman_approved = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- DOWN / ROLLBACK — prior PRODUCTION body (pg_get_viewdef, 2026-06-10).
-- Header defanged for check-migration-readiness.mjs (it parses commented SQL;
-- lesson from PR #4540). To restore, reassemble: CREATE OR REPLACE VIEW
-- v_okr_hierarchy AS + the SELECT below.
--
-- [DOWN] SELECT sv.id AS vision_id,
--     sv.code AS vision_code,
--     sv.title AS vision_title,
--     sv.statement AS vision_statement,
--     o.id AS objective_id,
--     o.code AS objective_code,
--     o.title AS objective_title,
--     o.cadence, o.period, o.is_active AS objective_active,
--     kr.id AS kr_id, kr.code AS kr_code, kr.title AS kr_title,
--     kr.metric_type, kr.baseline_value, kr.current_value, kr.target_value,
--     kr.unit, kr.direction, kr.confidence, kr.status AS kr_status,
--     kr.is_active AS kr_active, kr.vision_dimension_code, kr.source_type,
--     CASE WHEN kr.target_value = kr.baseline_value THEN
--       CASE WHEN kr.current_value >= kr.target_value THEN 100 ELSE 0 END::numeric
--     ELSE LEAST(100::numeric, GREATEST(0::numeric, round((kr.current_value - COALESCE(kr.baseline_value, 0::numeric)) / NULLIF(kr.target_value - COALESCE(kr.baseline_value, 0::numeric), 0::numeric) * 100::numeric)))
--     END AS progress_pct
--   FROM strategic_vision sv
--     LEFT JOIN objectives o ON o.vision_id = sv.id
--     LEFT JOIN key_results kr ON kr.objective_id = o.id
--   WHERE sv.is_active = true;
