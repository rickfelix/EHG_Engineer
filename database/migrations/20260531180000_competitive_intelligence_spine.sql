-- =============================================================================
-- Migration: 20260531180000_competitive_intelligence_spine.sql
-- SD: SD-COMPETITIVE-INTELLIGENCE-ACROSS-THE-ORCH-001-A (Child A)
-- Purpose: Create the data spine for the Competitive Intelligence feature.
--          Two new tables: competitor_intelligence + ci_snapshots.
--          ADDITIVE ONLY — no existing tables are altered, dropped, or touched.
-- Author: Principal Database Architect sub-agent
-- Date: 2026-05-31
-- Reversible: YES — see companion DOWN script
--             20260531180000_competitive_intelligence_spine_DOWN.sql
-- =============================================================================

-- RLS POLICY PATTERN (mirrors `competitors` table):
--   - service_role: ALL (unrestricted)
--   - public role: SELECT/INSERT/UPDATE/DELETE scoped to rows where
--       venture_id IN (SELECT id FROM ventures WHERE created_by = auth.uid())
--   - Pre-seed rows (venture_id IS NULL) are accessible to service_role only
--     until the venture link is attached.
--   Source: SELECT * FROM pg_policies WHERE tablename = 'competitors';

-- =============================================================================
-- TABLE 1: competitor_intelligence
-- =============================================================================
-- Operator-owned competitive-intelligence asset.
-- ONE row per competitor analysis, OPTIONALLY linked to a venture.
-- Stage-0 teardown produces rows BEFORE a venture exists (venture_id nullable).
-- The venture link is attached later when the venture is seeded.
-- =============================================================================

CREATE TABLE IF NOT EXISTS competitor_intelligence (
    id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Nullable: Stage-0 pre-seed records have no venture yet.
    -- Set to NULL (not deleted) when the referenced venture is removed.
    venture_id               uuid        NULL
        REFERENCES ventures(id) ON DELETE SET NULL,

    -- FK to global_competitors: table EXISTS (confirmed via information_schema).
    -- Set to NULL when the referenced global competitor record is removed.
    global_competitor_id     uuid        NULL
        REFERENCES global_competitors(id) ON DELETE SET NULL,

    competitor_url           text,
    competitor_name          text,

    -- How this record was produced.
    source                   text        NOT NULL DEFAULT 'manual'
        CHECK (source IN ('teardown', 'differentiation_research', 'discovery', 'manual')),

    -- Four-bucket framework: facts / assumptions / simulations / unknowns.
    four_buckets             jsonb,

    -- Structured competitive analysis: company / product / market / swot.
    competitive_intelligence jsonb,

    -- Slot for Child E board output (differentiation strategy).
    differentiation_strategy jsonb       NULL,

    -- Slot for Child E delta gate result.
    differentiation_delta    numeric     NULL,

    -- Data sanitization state.
    sanitization_status      text        NOT NULL DEFAULT 'pending'
        CHECK (sanitization_status IN ('pending', 'passed', 'flagged')),

    -- Quality metadata: confidence_score, data_quality, etc.
    quality                  jsonb,

    -- Operator who created the record; nullable for system/service writes.
    created_by               uuid        NULL,

    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE competitor_intelligence IS
    'Operator-owned competitive-intelligence asset. One row per competitor analysis. '
    'venture_id is nullable because Stage-0 teardown produces these records before a '
    'venture is seeded; the link is attached later. '
    'SD: SD-COMPETITIVE-INTELLIGENCE-ACROSS-THE-ORCH-001-A';

COMMENT ON COLUMN competitor_intelligence.venture_id IS
    'Nullable FK to ventures.id. NULL for pre-seed Stage-0 records.';
COMMENT ON COLUMN competitor_intelligence.global_competitor_id IS
    'Nullable FK to global_competitors.id (table confirmed present). '
    'ON DELETE SET NULL keeps the CI record even if the global competitor is removed.';
COMMENT ON COLUMN competitor_intelligence.four_buckets IS
    'Four-bucket framework storage: {facts, assumptions, simulations, unknowns}';
COMMENT ON COLUMN competitor_intelligence.competitive_intelligence IS
    'Structured analysis: {company, product, market, swot}';
COMMENT ON COLUMN competitor_intelligence.differentiation_strategy IS
    'Slot for Child E board output; NULL until Child E writes here.';
COMMENT ON COLUMN competitor_intelligence.differentiation_delta IS
    'Slot for Child E delta gate numeric result; NULL until Child E writes here.';
COMMENT ON COLUMN competitor_intelligence.quality IS
    'Quality metadata: {confidence_score, data_quality}';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_competitor_intelligence_venture_id
    ON competitor_intelligence(venture_id);

CREATE INDEX IF NOT EXISTS idx_competitor_intelligence_created_by
    ON competitor_intelligence(created_by);

CREATE INDEX IF NOT EXISTS idx_competitor_intelligence_global_competitor_id
    ON competitor_intelligence(global_competitor_id);

CREATE INDEX IF NOT EXISTS idx_competitor_intelligence_sanitization_status
    ON competitor_intelligence(sanitization_status);

-- updated_at auto-touch trigger (reuses the existing house function
-- update_updated_at_column — confirmed present in pg_proc; same convention
-- used by execution_sequences_v2, hap_blocks_v2, sdip_submissions, etc.)
CREATE OR REPLACE TRIGGER trg_competitor_intelligence_updated_at
    BEFORE UPDATE ON competitor_intelligence
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- RLS for competitor_intelligence
-- Mirrors the `competitors` table policy pattern exactly.
-- =============================================================================

ALTER TABLE competitor_intelligence ENABLE ROW LEVEL SECURITY;

-- 1. service_role: unrestricted full access (mirrors "Service role full access competitors")
CREATE POLICY ci_service_role_all ON competitor_intelligence
    AS PERMISSIVE
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 2. Authenticated users can SELECT their own venture's records.
--    Pre-seed rows (venture_id IS NULL) are visible only to service_role until linked.
--    (Mirrors "Users can view own venture competitors")
CREATE POLICY ci_select_own_venture ON competitor_intelligence
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING (
        venture_id IN (
            SELECT id FROM ventures WHERE created_by = auth.uid()
        )
    );

-- 3. Authenticated users can INSERT records for their own ventures.
--    Pre-seed inserts (venture_id IS NULL) must go through service_role.
--    (Mirrors "Users can insert own venture competitors")
CREATE POLICY ci_insert_own_venture ON competitor_intelligence
    AS PERMISSIVE
    FOR INSERT
    TO public
    WITH CHECK (
        venture_id IN (
            SELECT id FROM ventures WHERE created_by = auth.uid()
        )
    );

-- 4. Authenticated users can UPDATE their own venture's records.
--    (Mirrors "Users can update own venture competitors")
CREATE POLICY ci_update_own_venture ON competitor_intelligence
    AS PERMISSIVE
    FOR UPDATE
    TO public
    USING (
        venture_id IN (
            SELECT id FROM ventures WHERE created_by = auth.uid()
        )
    );

-- 5. Authenticated users can DELETE their own venture's records.
--    (Mirrors "Users can delete own venture competitors")
CREATE POLICY ci_delete_own_venture ON competitor_intelligence
    AS PERMISSIVE
    FOR DELETE
    TO public
    USING (
        venture_id IN (
            SELECT id FROM ventures WHERE created_by = auth.uid()
        )
    );

-- =============================================================================
-- TABLE 2: ci_snapshots
-- =============================================================================
-- Point-in-time history of a competitor_intelligence record.
-- Append-only: CASCADE on parent deletion keeps history consistent
-- (rows are removed when the parent CI record is removed).
-- =============================================================================

CREATE TABLE IF NOT EXISTS ci_snapshots (
    id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

    -- FK to parent CI record; CASCADE so history is removed with the parent.
    competitor_intelligence_id  uuid        NOT NULL
        REFERENCES competitor_intelligence(id) ON DELETE CASCADE,

    captured_at                 timestamptz NOT NULL DEFAULT now(),

    -- Full point-in-time copy of the competitor_intelligence row at capture time.
    snapshot                    jsonb       NOT NULL,

    -- Computed diff vs the immediately prior snapshot; NULL for the first snapshot.
    diff_from_prior             jsonb       NULL,

    -- What triggered this snapshot.
    source                      text
        CHECK (source IN ('refresh', 'seed', 'enrichment')),

    created_at                  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ci_snapshots IS
    'Point-in-time history snapshots for competitor_intelligence records. '
    'Append-only; rows cascade-delete when the parent CI record is deleted. '
    'SD: SD-COMPETITIVE-INTELLIGENCE-ACROSS-THE-ORCH-001-A';

COMMENT ON COLUMN ci_snapshots.snapshot IS
    'Full point-in-time copy of the competitor_intelligence row at capture time.';
COMMENT ON COLUMN ci_snapshots.diff_from_prior IS
    'Computed JSON diff vs the immediately prior snapshot. NULL for first snapshot.';
COMMENT ON COLUMN ci_snapshots.source IS
    'What triggered this snapshot: refresh | seed | enrichment';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ci_snapshots_competitor_intelligence_id
    ON ci_snapshots(competitor_intelligence_id);

CREATE INDEX IF NOT EXISTS idx_ci_snapshots_captured_at
    ON ci_snapshots(captured_at);

-- =============================================================================
-- RLS for ci_snapshots
-- Mirrors the `competitors` table policy pattern.
-- Snapshots are scoped to users who own the parent CI record's venture.
-- The join-through-competitor_intelligence makes the ownership chain explicit.
-- =============================================================================

ALTER TABLE ci_snapshots ENABLE ROW LEVEL SECURITY;

-- 1. service_role: unrestricted full access
CREATE POLICY ci_snapshots_service_role_all ON ci_snapshots
    AS PERMISSIVE
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 2. SELECT: visible when the parent CI record belongs to user's venture.
CREATE POLICY ci_snapshots_select_own_venture ON ci_snapshots
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING (
        competitor_intelligence_id IN (
            SELECT ci.id
            FROM competitor_intelligence ci
            JOIN ventures v ON v.id = ci.venture_id
            WHERE v.created_by = auth.uid()
        )
    );

-- 3. INSERT: allowed when the parent CI record belongs to user's venture.
CREATE POLICY ci_snapshots_insert_own_venture ON ci_snapshots
    AS PERMISSIVE
    FOR INSERT
    TO public
    WITH CHECK (
        competitor_intelligence_id IN (
            SELECT ci.id
            FROM competitor_intelligence ci
            JOIN ventures v ON v.id = ci.venture_id
            WHERE v.created_by = auth.uid()
        )
    );

-- 4. UPDATE: allowed when parent belongs to user's venture.
CREATE POLICY ci_snapshots_update_own_venture ON ci_snapshots
    AS PERMISSIVE
    FOR UPDATE
    TO public
    USING (
        competitor_intelligence_id IN (
            SELECT ci.id
            FROM competitor_intelligence ci
            JOIN ventures v ON v.id = ci.venture_id
            WHERE v.created_by = auth.uid()
        )
    );

-- 5. DELETE: allowed when parent belongs to user's venture.
CREATE POLICY ci_snapshots_delete_own_venture ON ci_snapshots
    AS PERMISSIVE
    FOR DELETE
    TO public
    USING (
        competitor_intelligence_id IN (
            SELECT ci.id
            FROM competitor_intelligence ci
            JOIN ventures v ON v.id = ci.venture_id
            WHERE v.created_by = auth.uid()
        )
    );

-- =============================================================================
-- END OF MIGRATION
-- To roll back: run 20260531180000_competitive_intelligence_spine_DOWN.sql
-- =============================================================================
