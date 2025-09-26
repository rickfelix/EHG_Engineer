-- Documentation Monitor Sub-Agent Database Schema
-- Monitors folder structures and enforces database-first approach
-- Integrated with LEO Protocol workflow
-- Date: 2025-09-24

-- ============================================================================
-- DOCUMENTATION TRACKING TABLES
-- ============================================================================

-- 1. Documentation inventory table
CREATE TABLE IF NOT EXISTS documentation_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- File identification
    file_path TEXT NOT NULL UNIQUE,
    file_name TEXT NOT NULL,
    file_type TEXT, -- md, json, yaml, etc.
    file_size INTEGER,

    -- Classification
    doc_category TEXT CHECK (doc_category IN (
        'STRATEGIC', 'TECHNICAL', 'OPERATIONAL', 'REFERENCE',
        'TUTORIAL', 'API', 'ARCHITECTURE', 'RETROSPECTIVE',
        'HANDOFF', 'PRD', 'UNKNOWN'
    )),

    -- Relationship to LEO Protocol
    related_sd_id TEXT REFERENCES strategic_directives_v2(id),
    related_agent TEXT CHECK (related_agent IN ('LEAD', 'PLAN', 'EXEC', 'ALL', NULL)),

    -- Content analysis
    last_modified TIMESTAMPTZ,
    content_hash TEXT, -- For change detection
    is_database_first BOOLEAN DEFAULT false, -- True if this is just a view of DB data
    should_be_in_database BOOLEAN DEFAULT false, -- True if this violates DB-first

    -- Health metrics
    documentation_complete BOOLEAN DEFAULT false,
    last_reviewed TIMESTAMPTZ,
    review_required BOOLEAN DEFAULT false,

    -- Status
    status TEXT CHECK (status IN ('ACTIVE', 'ARCHIVED', 'DEPRECATED', 'VIOLATION')) DEFAULT 'ACTIVE',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Folder structure monitoring
CREATE TABLE IF NOT EXISTS folder_structure_snapshot (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Folder identification
    folder_path TEXT NOT NULL,
    folder_name TEXT NOT NULL,
    parent_path TEXT,

    -- Metrics
    file_count INTEGER DEFAULT 0,
    subfolder_count INTEGER DEFAULT 0,
    total_size_bytes BIGINT DEFAULT 0,

    -- Classification
    folder_purpose TEXT CHECK (folder_purpose IN (
        'DOCUMENTATION', 'SOURCE_CODE', 'SCRIPTS', 'DATABASE',
        'ARCHIVE', 'CONFIG', 'TESTS', 'BUILD', 'TEMP', 'UNKNOWN'
    )),

    -- LEO Protocol alignment
    owned_by_agent TEXT CHECK (owned_by_agent IN ('LEAD', 'PLAN', 'EXEC', 'SHARED', NULL)),

    -- Health status
    is_organized BOOLEAN DEFAULT true,
    has_violations BOOLEAN DEFAULT false,
    needs_cleanup BOOLEAN DEFAULT false,

    snapshot_date TIMESTAMPTZ DEFAULT NOW(),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Documentation violations tracking
CREATE TABLE IF NOT EXISTS documentation_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Violation details
    violation_type TEXT NOT NULL CHECK (violation_type IN (
        'FILE_INSTEAD_OF_DB', -- Created file when should use DB
        'MISSING_DOCUMENTATION', -- Required docs not found
        'ORPHANED_FILE', -- File with no purpose
        'WRONG_LOCATION', -- File in wrong folder
        'DUPLICATE_CONTENT', -- Same content in file and DB
        'OUTDATED_CONTENT', -- Documentation not updated
        'NO_TEMPLATE_COMPLIANCE', -- Doesn't follow template
        'UNAUTHORIZED_CREATION' -- Agent created file outside scope
    )),

    -- Context
    file_path TEXT,
    folder_path TEXT,
    responsible_agent TEXT CHECK (responsible_agent IN ('LEAD', 'PLAN', 'EXEC', 'UNKNOWN')),
    related_sd_id TEXT REFERENCES strategic_directives_v2(id),

    -- LEO Protocol event that triggered this
    leo_event_type TEXT,
    leo_event_details JSONB,

    -- Violation metadata
    severity TEXT CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')) DEFAULT 'MEDIUM',
    detected_at TIMESTAMPTZ DEFAULT NOW(),

    -- Resolution
    resolution_status TEXT CHECK (resolution_status IN (
        'PENDING', 'IN_PROGRESS', 'RESOLVED', 'IGNORED', 'ESCALATED'
    )) DEFAULT 'PENDING',
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    auto_resolved BOOLEAN DEFAULT false,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Documentation health checks
CREATE TABLE IF NOT EXISTS documentation_health_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Check identification
    check_type TEXT NOT NULL CHECK (check_type IN (
        'COVERAGE', -- Documentation coverage
        'QUALITY', -- Documentation quality
        'ORGANIZATION', -- Folder organization
        'COMPLIANCE', -- Database-first compliance
        'FRESHNESS', -- Up-to-date check
        'COMPLETENESS' -- All required sections present
    )),

    -- Scope
    scope TEXT CHECK (scope IN ('GLOBAL', 'SD', 'AGENT', 'FOLDER')) DEFAULT 'GLOBAL',
    scope_identifier TEXT, -- SD ID, agent name, or folder path

    -- Results
    check_passed BOOLEAN DEFAULT false,
    score INTEGER CHECK (score >= 0 AND score <= 100),
    issues_found INTEGER DEFAULT 0,
    issues_resolved INTEGER DEFAULT 0,

    -- Detailed findings
    findings JSONB DEFAULT '{}',
    recommendations JSONB DEFAULT '[]',

    -- LEO Protocol integration
    triggered_by_event TEXT,
    related_handoff_id TEXT,

    check_date TIMESTAMPTZ DEFAULT NOW(),
    next_check_date TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. LEO Protocol file audit trail
CREATE TABLE IF NOT EXISTS leo_protocol_file_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Agent activity
    agent_type TEXT NOT NULL CHECK (agent_type IN ('LEAD', 'PLAN', 'EXEC', 'SUB_AGENT')),
    agent_id TEXT,

    -- File operation
    operation TEXT NOT NULL CHECK (operation IN (
        'CREATE', 'MODIFY', 'DELETE', 'MOVE', 'ARCHIVE'
    )),
    file_path TEXT NOT NULL,

    -- LEO Protocol context
    leo_phase TEXT CHECK (leo_phase IN ('PLANNING', 'IMPLEMENTATION', 'VERIFICATION', 'APPROVAL')),
    handoff_id TEXT,
    sd_id TEXT REFERENCES strategic_directives_v2(id),

    -- Compliance check
    is_authorized BOOLEAN DEFAULT false,
    violates_database_first BOOLEAN DEFAULT false,

    -- Audit details
    operation_timestamp TIMESTAMPTZ DEFAULT NOW(),
    operation_details JSONB,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Documentation templates
CREATE TABLE IF NOT EXISTS documentation_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    template_name TEXT NOT NULL UNIQUE,
    template_type TEXT NOT NULL,
    description TEXT,

    -- Template structure
    required_sections JSONB NOT NULL,
    optional_sections JSONB DEFAULT '[]',

    -- LEO Protocol alignment
    applicable_to_agent TEXT CHECK (applicable_to_agent IN ('LEAD', 'PLAN', 'EXEC', 'ALL')),
    applicable_to_phase TEXT,

    -- Template content
    template_content TEXT,
    example_content TEXT,

    -- Metadata
    is_active BOOLEAN DEFAULT true,
    version INTEGER DEFAULT 1,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX idx_doc_inventory_category ON documentation_inventory(doc_category);
CREATE INDEX idx_doc_inventory_status ON documentation_inventory(status);
CREATE INDEX idx_doc_inventory_violations ON documentation_inventory(should_be_in_database);
CREATE INDEX idx_doc_inventory_sd_id ON documentation_inventory(related_sd_id);

CREATE INDEX idx_folder_snapshot_purpose ON folder_structure_snapshot(folder_purpose);
CREATE INDEX idx_folder_snapshot_violations ON folder_structure_snapshot(has_violations);

CREATE INDEX idx_violations_type ON documentation_violations(violation_type);
CREATE INDEX idx_violations_severity ON documentation_violations(severity);
CREATE INDEX idx_violations_status ON documentation_violations(resolution_status);
CREATE INDEX idx_violations_agent ON documentation_violations(responsible_agent);

CREATE INDEX idx_health_checks_type ON documentation_health_checks(check_type);
CREATE INDEX idx_health_checks_passed ON documentation_health_checks(check_passed);

CREATE INDEX idx_audit_agent ON leo_protocol_file_audit(agent_type);
CREATE INDEX idx_audit_violations ON leo_protocol_file_audit(violates_database_first);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON leo_protocol_file_audit(operation_timestamp);

-- ============================================================================
-- VIEWS FOR MONITORING
-- ============================================================================

-- View for current violations
CREATE OR REPLACE VIEW v_active_documentation_violations AS
SELECT
    v.*,
    di.file_name,
    di.doc_category,
    sd.title as sd_title
FROM documentation_violations v
LEFT JOIN documentation_inventory di ON v.file_path = di.file_path
LEFT JOIN strategic_directives_v2 sd ON v.related_sd_id = sd.id
WHERE v.resolution_status IN ('PENDING', 'IN_PROGRESS')
ORDER BY
    CASE v.severity
        WHEN 'CRITICAL' THEN 1
        WHEN 'HIGH' THEN 2
        WHEN 'MEDIUM' THEN 3
        WHEN 'LOW' THEN 4
    END,
    v.detected_at DESC;

-- View for agent compliance
CREATE OR REPLACE VIEW v_agent_documentation_compliance AS
SELECT
    agent_type,
    COUNT(*) as total_operations,
    COUNT(CASE WHEN violates_database_first THEN 1 END) as violations,
    COUNT(CASE WHEN is_authorized THEN 1 END) as authorized_ops,
    ROUND(
        (COUNT(CASE WHEN NOT violates_database_first THEN 1 END)::NUMERIC /
         COUNT(*)::NUMERIC) * 100
    )::NUMERIC(5,2) as compliance_rate
FROM leo_protocol_file_audit
GROUP BY agent_type
ORDER BY compliance_rate DESC;

-- View for documentation health summary
CREATE OR REPLACE VIEW v_documentation_health_summary AS
SELECT
    check_type,
    COUNT(*) as total_checks,
    AVG(score) as avg_score,
    COUNT(CASE WHEN check_passed THEN 1 END) as passed_checks,
    SUM(issues_found) as total_issues,
    SUM(issues_resolved) as total_resolved,
    MAX(check_date) as last_check_date
FROM documentation_health_checks
GROUP BY check_type
ORDER BY avg_score DESC;

-- ============================================================================
-- TRIGGER FUNCTIONS
-- ============================================================================

-- Auto-detect violations when files are added
CREATE OR REPLACE FUNCTION detect_documentation_violations()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if this file should be in database
    IF NEW.file_type = 'md' AND (
        NEW.file_name ILIKE '%prd%' OR
        NEW.file_name ILIKE '%handoff%' OR
        NEW.file_name ILIKE '%retrospective%' OR
        NEW.file_name ILIKE '%completion%' OR
        NEW.file_name ILIKE '%verification%' OR
        NEW.file_name ILIKE '%approval%'
    ) THEN
        NEW.should_be_in_database := true;

        -- Create violation record
        INSERT INTO documentation_violations (
            violation_type,
            file_path,
            severity,
            leo_event_details
        ) VALUES (
            'FILE_INSTEAD_OF_DB',
            NEW.file_path,
            'HIGH',
            jsonb_build_object('auto_detected', true, 'file_type', NEW.file_type)
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_detect_violations
    BEFORE INSERT OR UPDATE ON documentation_inventory
    FOR EACH ROW
    EXECUTE FUNCTION detect_documentation_violations();

-- Update timestamps
CREATE OR REPLACE FUNCTION update_doc_monitor_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_doc_inventory_updated
    BEFORE UPDATE ON documentation_inventory
    FOR EACH ROW
    EXECUTE FUNCTION update_doc_monitor_timestamp();

CREATE TRIGGER tr_violations_updated
    BEFORE UPDATE ON documentation_violations
    FOR EACH ROW
    EXECUTE FUNCTION update_doc_monitor_timestamp();