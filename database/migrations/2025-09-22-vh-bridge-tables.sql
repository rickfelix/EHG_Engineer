-- VH Namespace Bridge Infrastructure for Vision Alignment Pipeline
-- Date: 2025-09-22
-- Purpose: Create minimal vh_* tables and views required by Vision/WSJF workflows
-- Risk: LOW - All CREATE IF NOT EXISTS, no destructive operations

\set ON_ERROR_STOP on
\timing on

BEGIN;

-- 1. Create vh schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS vh;

-- 2. Core vh_ventures table (foundation for governance tracking)
CREATE TABLE IF NOT EXISTS vh_ventures (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    status text DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),

    -- Governance trace columns (from existing migration 202509221335)
    sd_id uuid,
    prd_id uuid,
    backlog_id uuid,
    gate_status text,

    -- Additional metadata for venture tracking
    owner_email text,
    priority text CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    metadata jsonb DEFAULT '{}'::jsonb
);

-- 3. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_vh_ventures_sd_id ON vh_ventures(sd_id);
CREATE INDEX IF NOT EXISTS idx_vh_ventures_prd_id ON vh_ventures(prd_id);
CREATE INDEX IF NOT EXISTS idx_vh_ventures_status ON vh_ventures(status);
CREATE INDEX IF NOT EXISTS idx_vh_ventures_created_at ON vh_ventures(created_at DESC);

-- 4. Update trigger for vh_ventures
CREATE OR REPLACE FUNCTION vh_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_vh_ventures_updated_at
    BEFORE UPDATE ON vh_ventures
    FOR EACH ROW
    EXECUTE FUNCTION vh_update_updated_at();

-- 5. Optional: Create vh_stage_catalog for stage tracking
CREATE TABLE IF NOT EXISTS vh_stage_catalog (
    stage text PRIMARY KEY,
    description text,
    qa_gate_min integer DEFAULT 0,
    sort_order integer DEFAULT 0,
    active boolean DEFAULT true
);

-- 6. Insert default stage catalog entries if table is empty
INSERT INTO vh_stage_catalog (stage, description, qa_gate_min, sort_order)
SELECT * FROM (VALUES
    ('ideation', 'Initial concept and idea formation', 0, 1),
    ('validation', 'Market and technical validation', 1, 2),
    ('development', 'Active development phase', 2, 3),
    ('testing', 'Quality assurance and testing', 3, 4),
    ('deployment', 'Production deployment', 4, 5),
    ('monitoring', 'Post-deployment monitoring', 5, 6)
) AS default_stages(stage, description, qa_gate_min, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM vh_stage_catalog);

-- 7. Create v_vh_governance_snapshot view (required by WSJF workflows)
CREATE OR REPLACE VIEW v_vh_governance_snapshot AS
SELECT
    v.id AS venture_id,
    v.name AS venture_name,
    v.sd_id,
    v.prd_id,
    v.backlog_id,
    COALESCE(v.gate_status, 'pending') AS gate_status,
    v.status AS venture_status,
    v.priority,
    v.owner_email,
    v.created_at AS venture_created_at,
    v.updated_at AS last_sync_at,

    -- Link to strategic directive if available
    sd.title AS sd_title,
    sd.status AS sd_status,
    sd.execution_order,

    -- Governance readiness indicators
    CASE
        WHEN v.sd_id IS NOT NULL AND v.prd_id IS NOT NULL THEN 'complete'
        WHEN v.sd_id IS NOT NULL THEN 'partial'
        ELSE 'missing'
    END AS governance_readiness

FROM vh_ventures v
LEFT JOIN strategic_directives_v2 sd ON sd.id = v.sd_id;

-- 8. Grant appropriate permissions (adjust as needed for your security model)
-- These are basic permissions - adjust based on your actual user roles
GRANT USAGE ON SCHEMA vh TO public;
GRANT SELECT ON ALL TABLES IN SCHEMA vh TO public;
GRANT SELECT ON v_vh_governance_snapshot TO public;

-- 9. Comments for documentation
COMMENT ON SCHEMA vh IS 'VH (Venture Hub) namespace for venture governance tracking and Vision Alignment Pipeline compatibility';
COMMENT ON TABLE vh_ventures IS 'Core ventures table with governance trace columns for Vision/WSJF workflow compatibility';
COMMENT ON VIEW v_vh_governance_snapshot IS 'Governance snapshot view required by Vision Alignment and WSJF workflows';

-- 10. Verification and reporting
DO $$
DECLARE
    venture_count integer;
    snapshot_count integer;
BEGIN
    SELECT count(*) INTO venture_count FROM vh_ventures;
    SELECT count(*) INTO snapshot_count FROM v_vh_governance_snapshot;

    RAISE NOTICE 'VH Bridge Infrastructure created successfully:';
    RAISE NOTICE '  - vh_ventures table: % records', venture_count;
    RAISE NOTICE '  - v_vh_governance_snapshot view: % records', snapshot_count;
    RAISE NOTICE '  - Stage catalog: % stages', (SELECT count(*) FROM vh_stage_catalog);
END $$;

COMMIT;

-- Migration verification
\echo '✅ Migration 2025-09-22-vh-bridge-tables.sql completed successfully'
\echo '🏗️  VH namespace bridge infrastructure ready for Vision Alignment Pipeline'
\echo '📊 v_vh_governance_snapshot view available for WSJF workflows'