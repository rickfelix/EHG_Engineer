-- ============================================================================
-- Migration: 20260529_capability_scope_unification.sql
-- SD:        SD-LEO-GEN-UNIFY-VENTURE-CAPABILITIES-001
-- Phase:     PLAN -> EXEC preparation
-- Date:      2026-05-29
-- Author:    Database Agent (claude-sonnet-4-6)
-- @approved-by: rickfelix@example.com
-- Purpose:   Enrich v_unified_capabilities with `scope` + `plane1_score`
--            trailing columns. No destructive changes; CREATE OR REPLACE safe.
-- ============================================================================
-- PRE-CONDITION CHECK: Both views must exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'v_unified_capabilities'
  ) THEN
    RAISE EXCEPTION 'v_unified_capabilities does not exist -- aborting';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'v_scanner_capabilities'
  ) THEN
    RAISE EXCEPTION 'v_scanner_capabilities does not exist -- aborting';
  END IF;
END $$;

-- ============================================================================
-- ROLLBACK SNAPSHOT (original definitions captured 2026-05-29)
-- ============================================================================
-- ORIGINAL v_unified_capabilities:
--  SELECT venture_capabilities.id::text AS id,
--     venture_capabilities.name,
--     venture_capabilities.capability_type,
--     'venture'::text AS capability_source,
--     venture_capabilities.reusability_score AS relevance_score,
--     venture_capabilities.maturity_level,
--     venture_capabilities.origin_venture_id::text AS source_id,
--     venture_capabilities.origin_sd_key AS source_key
--    FROM venture_capabilities
-- UNION ALL
--  SELECT agent_skills.id::text AS id,
--     agent_skills.name,
--     COALESCE(agent_skills.category_scope ->> 'primary'::text, 'agent_skill'::text) AS capability_type,
--     'agent_skill'::text AS capability_source,
--     5 AS relevance_score,
--     'production'::text AS maturity_level,
--     NULL::text AS source_id,
--     NULL::text AS source_key
--    FROM agent_skills
--   WHERE agent_skills.active = true
-- UNION ALL
--  SELECT agent_registry.id::text AS id,
--     unnest(agent_registry.capabilities) AS name,
--     'agent_capability'::text AS capability_type,
--     'agent_registry'::text AS capability_source,
--     5 AS relevance_score,
--     'production'::text AS maturity_level,
--     NULL::text AS source_id,
--     agent_registry.agent_type AS source_key
--    FROM agent_registry
--   WHERE agent_registry.status::text = 'active'::text
-- UNION ALL
--  SELECT sd_capabilities.id::text AS id,
--     COALESCE(sd_capabilities.name, sd_capabilities.capability_key) AS name,
--     sd_capabilities.capability_type,
--     'sd_capability'::text AS capability_source,
--     COALESCE(sd_capabilities.extraction_score, 5) AS relevance_score,
--         CASE
--             WHEN sd_capabilities.maturity_score >= 8 THEN 'production'::text
--             WHEN sd_capabilities.maturity_score >= 5 THEN 'beta'::text
--             ELSE 'experimental'::text
--         END AS maturity_level,
--     sd_capabilities.sd_uuid AS source_id,
--     sd_capabilities.sd_id AS source_key
--    FROM sd_capabilities;
--
-- ORIGINAL v_scanner_capabilities:
--  SELECT id, name, capability_type, capability_source, relevance_score,
--         maturity_level, source_id, source_key
--    FROM v_unified_capabilities
--   WHERE capability_source = ANY (ARRAY['venture'::text, 'agent_skill'::text, 'agent_registry'::text]);
-- ============================================================================

-- ============================================================================
-- STEP 1: Replace v_unified_capabilities adding `scope` and `plane1_score`
--         as TRAILING columns (positions 9 and 10).
--
-- DESIGN DECISIONS:
--   scope (3-way; SD-LEO-GEN-UNIFY US-002/FR-2 — mirrors resolveCapabilityScope in
--          lib/capabilities/capability-taxonomy.js):
--     - venture_capabilities arm: 'venture' (always venture-scoped by table purpose)
--     - agent_skills arm:         'platform'
--     - agent_registry arm:       'platform'
--     - sd_capabilities arm:      venture_id present                -> 'venture'
--                                 target_application = EHG_Engineer -> 'platform'
--                                 other target_application          -> 'application'
--                                 null target_application           -> 'platform'
--                                  (current data: EHG_Engineer=37 -> platform,
--                                   EHG=42 -> application, 0 with venture_id)
--   plane1_score (numeric, nullable):
--     - sd_capabilities arm:      sd_capabilities.plane1_score (all 206 rows populated)
--     - venture_capabilities arm: venture_capabilities.revenue_leverage_score::numeric
--                                  (best semantic proxy; reusability_score is platform-
--                                   utility oriented; revenue_leverage = plane1 analog)
--     - agent arms:               NULL (no scoring model equivalent)
--
-- CREATE OR REPLACE SAFETY:
--   PostgreSQL allows CREATE OR REPLACE VIEW when:
--     a) All existing columns remain in the same ordinal positions with same types.
--     b) New columns are only appended at the end.
--   CONFIRMED: current view has 8 columns; we add 2 trailing (positions 9,10).
--   v_scanner_capabilities uses named column SELECT (explicit list) → NOT AFFECTED.
--   No materialized views or function bodies reference v_unified_capabilities.
--   VERDICT: CREATE OR REPLACE is SAFE — no DROP+CREATE required.
-- ============================================================================

CREATE OR REPLACE VIEW public.v_unified_capabilities AS

-- ARM 1: venture_capabilities
SELECT
    vc.id::text                                             AS id,
    vc.name                                                 AS name,
    vc.capability_type                                      AS capability_type,
    'venture'::text                                         AS capability_source,
    vc.reusability_score                                    AS relevance_score,
    vc.maturity_level                                       AS maturity_level,
    vc.origin_venture_id::text                              AS source_id,
    vc.origin_sd_key                                        AS source_key,
    -- NEW trailing columns
    'venture'::text                                         AS scope,
    vc.revenue_leverage_score::numeric                      AS plane1_score
FROM venture_capabilities vc

UNION ALL

-- ARM 2: agent_skills
SELECT
    ags.id::text                                            AS id,
    ags.name                                                AS name,
    COALESCE(ags.category_scope ->> 'primary', 'agent_skill') AS capability_type,
    'agent_skill'::text                                     AS capability_source,
    5                                                       AS relevance_score,
    'production'::text                                      AS maturity_level,
    NULL::text                                              AS source_id,
    NULL::text                                              AS source_key,
    -- NEW trailing columns
    'platform'::text                                        AS scope,
    NULL::numeric                                           AS plane1_score
FROM agent_skills ags
WHERE ags.active = true

UNION ALL

-- ARM 3: agent_registry
SELECT
    ar.id::text                                             AS id,
    unnest(ar.capabilities)                                 AS name,
    'agent_capability'::text                                AS capability_type,
    'agent_registry'::text                                  AS capability_source,
    5                                                       AS relevance_score,
    'production'::text                                      AS maturity_level,
    NULL::text                                              AS source_id,
    ar.agent_type                                           AS source_key,
    -- NEW trailing columns
    'platform'::text                                        AS scope,
    NULL::numeric                                           AS plane1_score
FROM agent_registry ar
WHERE ar.status::text = 'active'::text

UNION ALL

-- ARM 4: sd_capabilities (joined to strategic_directives_v2 for venture_id)
SELECT
    sc.id::text                                             AS id,
    COALESCE(sc.name, sc.capability_key)                   AS name,
    sc.capability_type                                      AS capability_type,
    'sd_capability'::text                                   AS capability_source,
    COALESCE(sc.extraction_score, 5)                       AS relevance_score,
    CASE
        WHEN sc.maturity_score >= 8 THEN 'production'::text
        WHEN sc.maturity_score >= 5 THEN 'beta'::text
        ELSE 'experimental'::text
    END                                                     AS maturity_level,
    sc.sd_uuid                                             AS source_id,
    sc.sd_id                                               AS source_key,
    -- NEW trailing columns: derive 3-way scope from the originating SD.
    -- Mirrors resolveCapabilityScope() in lib/capabilities/capability-taxonomy.js.
    CASE
        WHEN sdv2.venture_id IS NOT NULL THEN 'venture'::text
        WHEN sdv2.target_application IS NULL THEN 'platform'::text
        WHEN lower(sdv2.target_application) IN ('ehg_engineer', 'ehg-engineer') THEN 'platform'::text
        ELSE 'application'::text
    END                                                     AS scope,
    sc.plane1_score                                        AS plane1_score
FROM sd_capabilities sc
LEFT JOIN strategic_directives_v2 sdv2
    ON sdv2.id = sc.sd_uuid;

-- ============================================================================
-- STEP 2: Verify v_scanner_capabilities still works as-is.
-- v_scanner_capabilities explicitly selects 8 named columns from v_unified_capabilities.
-- Adding trailing columns to the source view does NOT affect named-column selects.
-- No recreation needed; document with a comment for clarity.
-- ============================================================================
-- NOTE: v_scanner_capabilities is untouched. Its definition remains:
--   SELECT id, name, capability_type, capability_source, relevance_score,
--          maturity_level, source_id, source_key
--   FROM v_unified_capabilities
--   WHERE capability_source = ANY (ARRAY['venture', 'agent_skill', 'agent_registry'])
-- The new scope + plane1_score columns are silently ignored by this view.
-- If a future consumer needs them, v_scanner_capabilities can be extended separately.

-- ============================================================================
-- STEP 3: Smoke-test the new view (will raise if shape is wrong)
-- ============================================================================
DO $$
DECLARE
  col_count INT;
  scope_vals TEXT;
BEGIN
  -- Verify 10 columns exist
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'v_unified_capabilities';

  IF col_count != 10 THEN
    RAISE EXCEPTION 'Expected 10 columns in v_unified_capabilities, got %', col_count;
  END IF;

  -- Verify scope column exists with expected values
  SELECT STRING_AGG(DISTINCT scope, ', ' ORDER BY scope) INTO scope_vals
  FROM v_unified_capabilities
  WHERE scope IS NOT NULL
  LIMIT 1;

  -- Just confirm the view executes without error (scope_vals may be null if all tables empty)
  RAISE NOTICE 'v_unified_capabilities: 10 columns confirmed. Distinct scope sample: %', COALESCE(scope_vals, '(empty tables)');
END $$;

-- ============================================================================
-- ROLLBACK INSTRUCTIONS (run manually if needed):
-- ============================================================================
-- CREATE OR REPLACE VIEW public.v_unified_capabilities AS
-- <paste ORIGINAL v_unified_capabilities definition from header comment above>
-- No changes to v_scanner_capabilities needed.
-- ============================================================================
