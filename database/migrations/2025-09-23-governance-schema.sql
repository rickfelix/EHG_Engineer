-- ============================================================================
-- SD-GOVERNANCE-001: Strategic Directive Schema Implementation
-- PRD: c4c8a657-f0d3-4b67-a9b6-503715078e36
-- Created: 2025-09-23
-- Agent: EXEC
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- PHASE 1: Core Governance Tables
-- ============================================================================

-- Note: strategic_directives_v2 already exists, adding governance enhancements
ALTER TABLE strategic_directives_v2
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS parent_sd_id VARCHAR(50) REFERENCES strategic_directives_v2(id),
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS archived_by VARCHAR(100),
ADD COLUMN IF NOT EXISTS governance_metadata JSONB DEFAULT '{}'::jsonb;

-- Create indexes for governance queries
CREATE INDEX IF NOT EXISTS idx_sd_parent ON strategic_directives_v2(parent_sd_id);
CREATE INDEX IF NOT EXISTS idx_sd_is_active ON strategic_directives_v2(is_active);
CREATE INDEX IF NOT EXISTS idx_sd_version ON strategic_directives_v2(version);
CREATE INDEX IF NOT EXISTS idx_sd_archived_at ON strategic_directives_v2(archived_at);

-- ============================================================================
-- User Stories Table (New)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_stories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    story_key VARCHAR(50) UNIQUE NOT NULL,
    prd_id VARCHAR(100) REFERENCES product_requirements_v2(id) ON DELETE CASCADE,
    sd_id VARCHAR(50) REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,

    -- Story Details
    title VARCHAR(500) NOT NULL,
    user_role VARCHAR(100) NOT NULL,
    user_want TEXT NOT NULL,
    user_benefit TEXT NOT NULL,

    -- Story Metadata
    story_points INTEGER,
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low', 'minimal')),
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'in_progress', 'testing', 'completed', 'blocked')),
    sprint VARCHAR(50),

    -- Acceptance Criteria
    acceptance_criteria JSONB DEFAULT '[]'::jsonb,
    definition_of_done JSONB DEFAULT '[]'::jsonb,

    -- Dependencies
    depends_on UUID[] DEFAULT '{}',
    blocks UUID[] DEFAULT '{}',

    -- Implementation Details
    technical_notes TEXT,
    implementation_approach TEXT,
    test_scenarios JSONB DEFAULT '[]'::jsonb,

    -- Audit Trail
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) DEFAULT 'SYSTEM',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(100),
    completed_at TIMESTAMP,
    completed_by VARCHAR(100),

    -- Metrics
    actual_points INTEGER,
    time_spent_hours DECIMAL(10,2),

    -- Constraints
    CONSTRAINT valid_story_key CHECK (story_key ~ '^[A-Z0-9-]+:US-[0-9]{3,}$')
);

-- Indexes for user stories
CREATE INDEX idx_stories_prd ON user_stories(prd_id);
CREATE INDEX idx_stories_sd ON user_stories(sd_id);
CREATE INDEX idx_stories_status ON user_stories(status);
CREATE INDEX idx_stories_priority ON user_stories(priority);
CREATE INDEX idx_stories_sprint ON user_stories(sprint);
CREATE INDEX idx_stories_created ON user_stories(created_at DESC);

-- ============================================================================
-- State Machine for SD Lifecycle
-- ============================================================================

CREATE TYPE sd_state AS ENUM (
    'draft',
    'pending_review',
    'approved',
    'active',
    'in_progress',
    'testing',
    'completed',
    'archived',
    'rejected'
);

-- State transition table
CREATE TABLE IF NOT EXISTS sd_state_transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_state sd_state NOT NULL,
    to_state sd_state NOT NULL,
    role_required VARCHAR(50),
    conditions JSONB DEFAULT '{}'::jsonb,
    UNIQUE(from_state, to_state)
);

-- Insert valid state transitions
INSERT INTO sd_state_transitions (from_state, to_state, role_required) VALUES
    ('draft', 'pending_review', 'PLAN'),
    ('pending_review', 'approved', 'LEAD'),
    ('pending_review', 'rejected', 'LEAD'),
    ('approved', 'active', 'LEAD'),
    ('active', 'in_progress', 'EXEC'),
    ('in_progress', 'testing', 'EXEC'),
    ('testing', 'completed', 'PLAN'),
    ('completed', 'archived', 'LEAD'),
    ('rejected', 'draft', 'PLAN')
ON CONFLICT (from_state, to_state) DO NOTHING;

-- ============================================================================
-- Audit Trail Implementation
-- ============================================================================

CREATE TABLE IF NOT EXISTS governance_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name VARCHAR(100) NOT NULL,
    record_id VARCHAR(100) NOT NULL,
    operation VARCHAR(20) NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE', 'STATE_CHANGE')),
    old_values JSONB,
    new_values JSONB,
    changed_by VARCHAR(100),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    change_reason TEXT,
    ip_address INET,
    user_agent TEXT
);

-- Index for audit queries
CREATE INDEX idx_audit_table ON governance_audit_log(table_name);
CREATE INDEX idx_audit_record ON governance_audit_log(record_id);
CREATE INDEX idx_audit_timestamp ON governance_audit_log(changed_at DESC);
CREATE INDEX idx_audit_user ON governance_audit_log(changed_by);

-- ============================================================================
-- Trigger Functions for Audit Trail
-- ============================================================================

CREATE OR REPLACE FUNCTION governance_audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO governance_audit_log (
            table_name, record_id, operation, new_values, changed_by
        ) VALUES (
            TG_TABLE_NAME, NEW.id::text, TG_OP, row_to_json(NEW), COALESCE(NEW.created_by, 'SYSTEM')
        );
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO governance_audit_log (
            table_name, record_id, operation, old_values, new_values, changed_by
        ) VALUES (
            TG_TABLE_NAME, NEW.id::text, TG_OP, row_to_json(OLD), row_to_json(NEW), COALESCE(NEW.updated_by, 'SYSTEM')
        );
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO governance_audit_log (
            table_name, record_id, operation, old_values, changed_by
        ) VALUES (
            TG_TABLE_NAME, OLD.id::text, TG_OP, row_to_json(OLD), 'SYSTEM'
        );
        RETURN OLD;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Apply audit triggers
CREATE TRIGGER audit_strategic_directives
    AFTER INSERT OR UPDATE OR DELETE ON strategic_directives_v2
    FOR EACH ROW EXECUTE FUNCTION governance_audit_trigger();

CREATE TRIGGER audit_product_requirements
    AFTER INSERT OR UPDATE OR DELETE ON product_requirements_v2
    FOR EACH ROW EXECUTE FUNCTION governance_audit_trigger();

CREATE TRIGGER audit_user_stories
    AFTER INSERT OR UPDATE OR DELETE ON user_stories
    FOR EACH ROW EXECUTE FUNCTION governance_audit_trigger();

-- ============================================================================
-- Auto-update timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sd_timestamp
    BEFORE UPDATE ON strategic_directives_v2
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_prd_timestamp
    BEFORE UPDATE ON product_requirements_v2
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_story_timestamp
    BEFORE UPDATE ON user_stories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- Version Control Function
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_version()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.version IS NOT NULL THEN
        NEW.version = OLD.version + 1;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER version_strategic_directives
    BEFORE UPDATE ON strategic_directives_v2
    FOR EACH ROW
    WHEN (OLD IS DISTINCT FROM NEW)
    EXECUTE FUNCTION increment_version();

-- ============================================================================
-- Validation Functions
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_sd_hierarchy()
RETURNS TRIGGER AS $$
DECLARE
    parent_count INTEGER;
BEGIN
    -- Prevent circular references
    IF NEW.parent_sd_id IS NOT NULL THEN
        WITH RECURSIVE hierarchy AS (
            SELECT id, parent_sd_id FROM strategic_directives_v2 WHERE id = NEW.parent_sd_id
            UNION ALL
            SELECT s.id, s.parent_sd_id
            FROM strategic_directives_v2 s
            JOIN hierarchy h ON s.id = h.parent_sd_id
        )
        SELECT COUNT(*) INTO parent_count FROM hierarchy WHERE id = NEW.id;

        IF parent_count > 0 THEN
            RAISE EXCEPTION 'Circular reference detected in SD hierarchy';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_sd_hierarchy
    BEFORE INSERT OR UPDATE ON strategic_directives_v2
    FOR EACH ROW
    WHEN (NEW.parent_sd_id IS NOT NULL)
    EXECUTE FUNCTION validate_sd_hierarchy();

-- ============================================================================
-- Materialized Views for Performance
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_sd_summary AS
SELECT
    s.id,
    s.sd_key,
    s.title,
    s.status,
    s.priority,
    s.version,
    COUNT(DISTINCT p.id) as prd_count,
    COUNT(DISTINCT us.id) as story_count,
    MAX(p.updated_at) as last_prd_update,
    MAX(us.updated_at) as last_story_update
FROM strategic_directives_v2 s
LEFT JOIN product_requirements_v2 p ON (s.id = p.sd_id OR s.id = p.directive_id)
LEFT JOIN user_stories us ON us.sd_id = s.id
GROUP BY s.id, s.sd_key, s.title, s.status, s.priority, s.version;

CREATE UNIQUE INDEX idx_mv_sd_summary_id ON mv_sd_summary(id);
CREATE INDEX idx_mv_sd_summary_status ON mv_sd_summary(status);

-- Refresh function
CREATE OR REPLACE FUNCTION refresh_sd_summary()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_sd_summary;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Grant Permissions (adjust based on your roles)
-- ============================================================================

-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;

-- ============================================================================
-- Migration Validation
-- ============================================================================

DO $$
DECLARE
    table_count INTEGER;
    index_count INTEGER;
    trigger_count INTEGER;
BEGIN
    -- Count created objects
    SELECT COUNT(*) INTO table_count FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('user_stories', 'sd_state_transitions', 'governance_audit_log');

    SELECT COUNT(*) INTO trigger_count FROM information_schema.triggers
    WHERE trigger_schema = 'public' AND trigger_name LIKE 'audit_%';

    RAISE NOTICE 'Governance schema migration completed: % tables, % triggers', table_count, trigger_count;
END $$;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================