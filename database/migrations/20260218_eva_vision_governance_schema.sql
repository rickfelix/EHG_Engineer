-- ============================================================================
-- Migration: EVA Vision Governance System — Database Schema
-- SD: SD-MAN-INFRA-VISION-GOVERNANCE-DATABASE-001
-- Date: 2026-02-18
-- Description: Foundation schema for automated Vision → Architecture → Build →
--              Score → Correct governance loop. 4 new tables + 6 column additions
--              across 3 existing tables. All changes are backward-compatible
--              (additive only, nullable FKs, no columns removed).
--
-- MIGRATION ORDER (FK dependency-driven — DO NOT reorder steps 1-3):
--   Step 1: CREATE eva_vision_documents
--   Step 2: CREATE eva_architecture_plans (depends on step 1)
--   Step 3: CREATE eva_vision_scores (depends on steps 1-2)
--   Step 4: CREATE eva_vision_iterations (depends on step 1)
--   Step 5: ALTER strategic_directives_v2 (depends on step 3)
--   Step 6: ALTER ventures (depends on steps 1-2)
--   Step 7: ALTER leo_adrs (depends on step 2)
--   Step 8: Enable RLS + create policies on all 4 new tables
--   Step 9: Create indexes
--   Step 10: Add triggers + comments
--
-- ROLLBACK (see bottom of file)
-- ============================================================================

-- ============================================================================
-- STEP 1: eva_vision_documents
-- Stores L1 (EHG portfolio) and L2 (venture-specific) vision documents.
-- Self-referential parent_vision_id links L2 visions to L1 parent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS eva_vision_documents (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vision_key            VARCHAR(100) UNIQUE NOT NULL,           -- e.g. VISION-EHG-L1-001
  level                 VARCHAR(2)  NOT NULL CHECK (level IN ('L1', 'L2')),
  venture_id            UUID        REFERENCES ventures(id) ON DELETE SET NULL,
  content               TEXT        NOT NULL,                   -- Full vision document
  extracted_dimensions  JSONB,                                  -- LLM-extracted scoring dimensions
  version               INTEGER     NOT NULL DEFAULT 1,
  status                VARCHAR(20) NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'active', 'superseded', 'archived')),
  chairman_approved     BOOLEAN     NOT NULL DEFAULT false,
  chairman_approved_at  TIMESTAMPTZ,
  parent_vision_id      UUID        REFERENCES eva_vision_documents(id) ON DELETE SET NULL,
  source_file_path      TEXT,                                   -- Original seeding file path
  source_brainstorm_id  UUID,                                   -- Soft ref to brainstorm_sessions.id
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            TEXT
);

COMMENT ON TABLE eva_vision_documents IS
  'Stores EHG portfolio (L1) and venture-specific (L2) vision documents for the EVA Vision Governance System. L2 visions link to L1 via parent_vision_id.';

COMMENT ON COLUMN eva_vision_documents.vision_key IS
  'Unique human-readable key, e.g. VISION-EHG-L1-001, VISION-SOLARA-L2-001';

COMMENT ON COLUMN eva_vision_documents.extracted_dimensions IS
  'LLM-extracted scoring dimensions with weights. Format: [{"name":"...", "weight":0.15, "description":"..."}]';

COMMENT ON COLUMN eva_vision_documents.source_brainstorm_id IS
  'Intentional soft reference (no FK constraint) to brainstorm_sessions.id. Brainstorm sessions may be deleted independently.';

-- ============================================================================
-- STEP 2: eva_architecture_plans
-- Architecture documents linked to vision. ON DELETE RESTRICT prevents orphaning.
-- ============================================================================

CREATE TABLE IF NOT EXISTS eva_architecture_plans (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_key              VARCHAR(100) UNIQUE NOT NULL,           -- e.g. ARCH-EVA-001
  vision_id             UUID        NOT NULL REFERENCES eva_vision_documents(id) ON DELETE RESTRICT,
  venture_id            UUID        REFERENCES ventures(id) ON DELETE SET NULL,
  content               TEXT        NOT NULL,                   -- Full architecture document
  extracted_dimensions  JSONB,                                  -- LLM-extracted structural dimensions
  version               INTEGER     NOT NULL DEFAULT 1,
  status                VARCHAR(20) NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'active', 'superseded', 'archived')),
  chairman_approved     BOOLEAN     NOT NULL DEFAULT false,
  chairman_approved_at  TIMESTAMPTZ,
  adr_ids               JSONB,                                  -- Soft array of leo_adrs UUIDs: ["uuid1","uuid2"]
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            TEXT
);

COMMENT ON TABLE eva_architecture_plans IS
  'Architecture Plans linked to Vision documents. ON DELETE RESTRICT on vision_id prevents deleting a vision that has architecture plans.';

COMMENT ON COLUMN eva_architecture_plans.adr_ids IS
  'Intentional soft reference array. No FK enforcement on JSONB array elements. Format: ["uuid1", "uuid2"]. For integrity guarantees, consider eva_architecture_plan_adrs junction table in future.';

-- ============================================================================
-- STEP 3: eva_vision_scores
-- Append-only scoring records. rubric_snapshot is frozen at score time.
-- sd_id is a soft TEXT reference to SD keys (not a FK).
-- ============================================================================

CREATE TABLE IF NOT EXISTS eva_vision_scores (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vision_id         UUID        NOT NULL REFERENCES eva_vision_documents(id) ON DELETE RESTRICT,
  arch_plan_id      UUID        REFERENCES eva_architecture_plans(id) ON DELETE SET NULL,
  sd_id             TEXT,                                       -- Soft ref to SD key string (e.g. SD-EVA-FEAT-001)
  iteration         INTEGER     NOT NULL DEFAULT 1,
  total_score       INTEGER     NOT NULL CHECK (total_score >= 0 AND total_score <= 100),
  dimension_scores  JSONB       NOT NULL,                       -- Per-dimension scores + reasoning
  threshold_action  VARCHAR(20) NOT NULL
                    CHECK (threshold_action IN ('accept', 'minor_sd', 'gap_closure_sd', 'escalate')),
  generated_sd_ids  JSONB,                                      -- Array of corrective SD keys
  rubric_snapshot   JSONB       NOT NULL,                       -- Frozen rubric dimensions used
  scored_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        TEXT
);

COMMENT ON TABLE eva_vision_scores IS
  'Append-only scoring records. rubric_snapshot is frozen at score time for immutable audit trail. sd_id is an intentional soft TEXT reference to SD keys — no FK to allow async SD creation.';

COMMENT ON COLUMN eva_vision_scores.dimension_scores IS
  'Per-dimension scoring. Format: [{"dimension":"...", "score":72, "weight":0.15, "reasoning":"..."}]';

COMMENT ON COLUMN eva_vision_scores.threshold_action IS
  'Action taken based on score: accept (>=85), minor_sd (70-84), gap_closure_sd (50-69), escalate (<50)';

-- ============================================================================
-- STEP 4: eva_vision_iterations
-- Scoring cycle history. UNIQUE(vision_id, iteration_number).
-- ============================================================================

CREATE TABLE IF NOT EXISTS eva_vision_iterations (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vision_id               UUID        NOT NULL REFERENCES eva_vision_documents(id) ON DELETE RESTRICT,
  iteration_number        INTEGER     NOT NULL,
  trigger_type            VARCHAR(50),                          -- 'manual', 'auto_batch', 'sd_completion'
  sds_scored              INTEGER     NOT NULL DEFAULT 0,
  sds_accepted            INTEGER     NOT NULL DEFAULT 0,
  sds_generated           INTEGER     NOT NULL DEFAULT 0,
  portfolio_score         INTEGER     CHECK (portfolio_score >= 0 AND portfolio_score <= 100),
  gap_analysis            JSONB,                                -- Dimension-level gap breakdown
  vision_version_before   INTEGER,
  vision_version_after    INTEGER,
  started_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at            TIMESTAMPTZ,                          -- NULL until iteration completes
  UNIQUE (vision_id, iteration_number)
);

COMMENT ON TABLE eva_vision_iterations IS
  'Tracks scoring cycle history. UNIQUE(vision_id, iteration_number) ensures one record per cycle. completed_at is NULL until the iteration scoring run finishes.';

-- ============================================================================
-- STEP 5: ALTER strategic_directives_v2
-- Add 3 nullable columns for per-SD vision alignment tracking.
-- ADD COLUMN with NULL default = metadata-only in PG 11+ (no table rewrite).
-- ============================================================================

ALTER TABLE strategic_directives_v2
  ADD COLUMN IF NOT EXISTS vision_score          INTEGER
    CHECK (vision_score >= 0 AND vision_score <= 100),
  ADD COLUMN IF NOT EXISTS vision_score_action   VARCHAR(20)
    CHECK (vision_score_action IN ('accept', 'minor_sd', 'gap_closure_sd', 'escalate')),
  ADD COLUMN IF NOT EXISTS vision_origin_score_id UUID
    REFERENCES eva_vision_scores(id) ON DELETE SET NULL;

COMMENT ON COLUMN strategic_directives_v2.vision_score IS
  'Vision alignment score (0-100) from most recent eva/score run for this SD.';

COMMENT ON COLUMN strategic_directives_v2.vision_score_action IS
  'Action classification from last vision score: accept, minor_sd, gap_closure_sd, or escalate.';

COMMENT ON COLUMN strategic_directives_v2.vision_origin_score_id IS
  'If this SD was generated as a corrective action, links back to the eva_vision_scores record that triggered its creation.';

-- ============================================================================
-- STEP 6: ALTER ventures
-- Add 2 nullable FK columns. Keep vision_alignment TEXT (backward compatible).
-- ============================================================================

ALTER TABLE ventures
  ADD COLUMN IF NOT EXISTS vision_id            UUID
    REFERENCES eva_vision_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS architecture_plan_id UUID
    REFERENCES eva_architecture_plans(id) ON DELETE SET NULL;

COMMENT ON COLUMN ventures.vision_id IS
  'FK to eva_vision_documents. Replaces free-text vision_alignment over time. vision_alignment TEXT kept for backward compatibility until data migration + column drop in a future SD.';

COMMENT ON COLUMN ventures.architecture_plan_id IS
  'FK to eva_architecture_plans. Links venture to its formal Architecture Plan.';

-- ============================================================================
-- STEP 7: ALTER leo_adrs
-- Add 1 nullable FK column. ON DELETE SET NULL preserves ADRs when plan deleted.
-- ============================================================================

ALTER TABLE leo_adrs
  ADD COLUMN IF NOT EXISTS architecture_plan_id UUID
    REFERENCES eva_architecture_plans(id) ON DELETE SET NULL;

COMMENT ON COLUMN leo_adrs.architecture_plan_id IS
  'FK to eva_architecture_plans. Links individual ADRs to their parent Architecture Plan for traceability.';

-- ============================================================================
-- STEP 8: Enable RLS + Create Policies
-- Pattern: service_role ALL + authenticated SELECT (consistent with 31 existing EVA tables)
-- ============================================================================

ALTER TABLE eva_vision_documents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE eva_architecture_plans  ENABLE ROW LEVEL SECURITY;
ALTER TABLE eva_vision_scores       ENABLE ROW LEVEL SECURITY;
ALTER TABLE eva_vision_iterations   ENABLE ROW LEVEL SECURITY;

-- eva_vision_documents policies
CREATE POLICY "eva_vision_docs_service_role_all" ON eva_vision_documents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "eva_vision_docs_authenticated_select" ON eva_vision_documents
  FOR SELECT TO authenticated USING (true);

-- eva_architecture_plans policies
CREATE POLICY "eva_arch_plans_service_role_all" ON eva_architecture_plans
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "eva_arch_plans_authenticated_select" ON eva_architecture_plans
  FOR SELECT TO authenticated USING (true);

-- eva_vision_scores policies
CREATE POLICY "eva_vision_scores_service_role_all" ON eva_vision_scores
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "eva_vision_scores_authenticated_select" ON eva_vision_scores
  FOR SELECT TO authenticated USING (true);

-- eva_vision_iterations policies
CREATE POLICY "eva_vision_iterations_service_role_all" ON eva_vision_iterations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "eva_vision_iterations_authenticated_select" ON eva_vision_iterations
  FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- STEP 9: Indexes
-- Partial indexes (WHERE IS NOT NULL) avoid bloating sparse FK columns.
-- GIN index on dimension_scores enables JSONB containment queries.
-- ============================================================================

-- eva_vision_documents
CREATE INDEX IF NOT EXISTS idx_eva_vision_docs_level
  ON eva_vision_documents (level);

CREATE INDEX IF NOT EXISTS idx_eva_vision_docs_venture
  ON eva_vision_documents (venture_id)
  WHERE venture_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eva_vision_docs_status
  ON eva_vision_documents (status);

CREATE INDEX IF NOT EXISTS idx_eva_vision_docs_parent
  ON eva_vision_documents (parent_vision_id)
  WHERE parent_vision_id IS NOT NULL;

-- eva_architecture_plans
CREATE INDEX IF NOT EXISTS idx_eva_arch_plans_vision
  ON eva_architecture_plans (vision_id);

CREATE INDEX IF NOT EXISTS idx_eva_arch_plans_venture
  ON eva_architecture_plans (venture_id)
  WHERE venture_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eva_arch_plans_status
  ON eva_architecture_plans (status);

-- eva_vision_scores
CREATE INDEX IF NOT EXISTS idx_eva_vision_scores_vision
  ON eva_vision_scores (vision_id);

CREATE INDEX IF NOT EXISTS idx_eva_vision_scores_sd
  ON eva_vision_scores (sd_id)
  WHERE sd_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eva_vision_scores_action
  ON eva_vision_scores (threshold_action);

CREATE INDEX IF NOT EXISTS idx_eva_vision_scores_scored_at
  ON eva_vision_scores (scored_at DESC);

CREATE INDEX IF NOT EXISTS idx_eva_vision_scores_dimensions
  ON eva_vision_scores USING GIN (dimension_scores);

-- eva_vision_iterations
CREATE INDEX IF NOT EXISTS idx_eva_vision_iterations_vision
  ON eva_vision_iterations (vision_id);

-- Column additions on existing tables
CREATE INDEX IF NOT EXISTS idx_sd_v2_vision_score
  ON strategic_directives_v2 (vision_score)
  WHERE vision_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sd_v2_vision_action
  ON strategic_directives_v2 (vision_score_action)
  WHERE vision_score_action IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ventures_vision
  ON ventures (vision_id)
  WHERE vision_id IS NOT NULL;

-- ============================================================================
-- STEP 10: Triggers + Table Comments
-- Auto-update updated_at on eva_vision_documents and eva_architecture_plans.
-- eva_vision_scores and eva_vision_iterations are append-only (no updated_at).
-- ============================================================================

-- Verify update_updated_at_column() function exists before creating triggers
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column'
  ) THEN
    -- Trigger for eva_vision_documents
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'update_eva_vision_documents_updated_at'
    ) THEN
      EXECUTE '
        CREATE TRIGGER update_eva_vision_documents_updated_at
          BEFORE UPDATE ON eva_vision_documents
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
      ';
    END IF;

    -- Trigger for eva_architecture_plans
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'update_eva_architecture_plans_updated_at'
    ) THEN
      EXECUTE '
        CREATE TRIGGER update_eva_architecture_plans_updated_at
          BEFORE UPDATE ON eva_architecture_plans
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
      ';
    END IF;
  ELSE
    RAISE NOTICE 'update_updated_at_column() function not found — skipping updated_at triggers. Create them manually if needed.';
  END IF;
END;
$$;

-- ============================================================================
-- ROLLBACK (run in REVERSE order to avoid FK violations)
-- ============================================================================
/*
-- Step R1: Drop triggers
DROP TRIGGER IF EXISTS update_eva_vision_documents_updated_at ON eva_vision_documents;
DROP TRIGGER IF EXISTS update_eva_architecture_plans_updated_at ON eva_architecture_plans;

-- Step R2: Drop indexes on new tables (implicitly dropped with tables)
-- Drop indexes on existing tables
DROP INDEX IF EXISTS idx_sd_v2_vision_score;
DROP INDEX IF EXISTS idx_sd_v2_vision_action;
DROP INDEX IF EXISTS idx_ventures_vision;

-- Step R3: Drop policies (implicitly dropped with tables for new tables)

-- Step R4: Disable RLS (implicitly dropped with tables for new tables)

-- Step R5: ALTER TABLE drops (reverse of steps 5-7)
ALTER TABLE leo_adrs
  DROP COLUMN IF EXISTS architecture_plan_id;

ALTER TABLE ventures
  DROP COLUMN IF EXISTS vision_id,
  DROP COLUMN IF EXISTS architecture_plan_id;

ALTER TABLE strategic_directives_v2
  DROP COLUMN IF EXISTS vision_score,
  DROP COLUMN IF EXISTS vision_score_action,
  DROP COLUMN IF EXISTS vision_origin_score_id;

-- Step R6: Drop tables in REVERSE FK order
-- (eva_vision_iterations and eva_vision_scores before eva_architecture_plans,
--  eva_architecture_plans before eva_vision_documents)
DROP TABLE IF EXISTS eva_vision_iterations;
DROP TABLE IF EXISTS eva_vision_scores;
DROP TABLE IF EXISTS eva_architecture_plans;
DROP TABLE IF EXISTS eva_vision_documents;
*/
