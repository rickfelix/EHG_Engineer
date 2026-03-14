-- Migration: EVA Translation Gates
-- Date: 2026-03-11
-- Purpose: Create table for translation fidelity gate results in the EVA pipeline.
--          Each gate checks upstream artifacts against downstream artifacts to detect
--          translation gaps (e.g., brainstorm themes lost in vision, vision requirements
--          missing from architecture).

-- ============================================================================
-- Table: eva_translation_gates
-- Stores translation fidelity gate results for the EVA pipeline.
-- Each row represents one gate execution comparing source artifacts to a target artifact.
-- ============================================================================

CREATE TABLE IF NOT EXISTS eva_translation_gates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gate_type TEXT NOT NULL CHECK (gate_type IN (
        'brainstorm_to_vision',
        'vision_to_architecture',
        'architecture_to_sd'
    )),
    source_refs JSONB NOT NULL DEFAULT '[]',   -- Array of {type, id, key} for upstream artifacts
    target_ref JSONB NOT NULL DEFAULT '{}',    -- {type, id, key} for downstream artifact
    coverage_score INTEGER NOT NULL CHECK (coverage_score >= 0 AND coverage_score <= 100),
    gaps JSONB NOT NULL DEFAULT '[]',           -- Array of {item, source, severity} for unaddressed items
    passed BOOLEAN NOT NULL,
    metadata JSONB DEFAULT '{}',               -- LLM reasoning, model used, duration
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE eva_translation_gates IS 'Translation fidelity gate results for the EVA pipeline. Each gate checks upstream artifacts against downstream artifacts to detect translation gaps.';
COMMENT ON COLUMN eva_translation_gates.gate_type IS 'Type of translation gate: brainstorm_to_vision, vision_to_architecture, or architecture_to_sd';
COMMENT ON COLUMN eva_translation_gates.source_refs IS 'Array of upstream artifact references, each as {type, id, key}';
COMMENT ON COLUMN eva_translation_gates.target_ref IS 'Single downstream artifact reference as {type, id, key}';
COMMENT ON COLUMN eva_translation_gates.coverage_score IS 'Percentage (0-100) of upstream items addressed in the downstream artifact';
COMMENT ON COLUMN eva_translation_gates.gaps IS 'Array of unaddressed items, each as {item, source, severity}';
COMMENT ON COLUMN eva_translation_gates.passed IS 'Whether the gate passed (true) or failed (false) based on coverage threshold';
COMMENT ON COLUMN eva_translation_gates.metadata IS 'Additional context: LLM reasoning, model used, execution duration, etc.';

-- ============================================================================
-- Indexes
-- ============================================================================

-- Index on gate_type for filtering by gate stage
CREATE INDEX IF NOT EXISTS idx_translation_gates_gate_type
    ON eva_translation_gates (gate_type);

-- GIN index on target_ref for JSONB containment queries (e.g., find gates for a specific artifact)
CREATE INDEX IF NOT EXISTS idx_translation_gates_target_ref
    ON eva_translation_gates USING GIN (target_ref);

-- Index on created_at DESC for recent-first queries
CREATE INDEX IF NOT EXISTS idx_translation_gates_created_at
    ON eva_translation_gates (created_at DESC);

-- ============================================================================
-- Auto-update trigger for updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_eva_translation_gates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_eva_translation_gates_updated_at ON eva_translation_gates;
CREATE TRIGGER trg_eva_translation_gates_updated_at
    BEFORE UPDATE ON eva_translation_gates
    FOR EACH ROW
    EXECUTE FUNCTION update_eva_translation_gates_updated_at();

-- ============================================================================
-- RLS Policies
-- ============================================================================

-- Enable RLS
ALTER TABLE eva_translation_gates ENABLE ROW LEVEL SECURITY;

-- Service role: full CRUD access
CREATE POLICY service_role_all_eva_translation_gates
    ON eva_translation_gates
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Authenticated users: read-only access
CREATE POLICY authenticated_select_eva_translation_gates
    ON eva_translation_gates
    FOR SELECT
    TO authenticated
    USING (true);

-- Anon users: read-only access (for dashboard queries)
CREATE POLICY anon_select_eva_translation_gates
    ON eva_translation_gates
    FOR SELECT
    TO anon
    USING (true);

-- ============================================================================
-- Rollback SQL (reference only - do not execute)
-- ============================================================================
-- DROP POLICY IF EXISTS anon_select_eva_translation_gates ON eva_translation_gates;
-- DROP POLICY IF EXISTS authenticated_select_eva_translation_gates ON eva_translation_gates;
-- DROP POLICY IF EXISTS service_role_all_eva_translation_gates ON eva_translation_gates;
-- ALTER TABLE eva_translation_gates DISABLE ROW LEVEL SECURITY;
-- DROP TRIGGER IF EXISTS trg_eva_translation_gates_updated_at ON eva_translation_gates;
-- DROP FUNCTION IF EXISTS update_eva_translation_gates_updated_at();
-- DROP INDEX IF EXISTS idx_translation_gates_created_at;
-- DROP INDEX IF EXISTS idx_translation_gates_target_ref;
-- DROP INDEX IF EXISTS idx_translation_gates_gate_type;
-- DROP TABLE IF EXISTS eva_translation_gates;
