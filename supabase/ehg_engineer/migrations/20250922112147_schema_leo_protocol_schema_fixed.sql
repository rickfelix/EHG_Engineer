-- LEO Protocol Database-First Schema (FIXED)
-- Transform LEO Protocol from file-based to database-first architecture
-- Version: 1.0.1 - Fixed constraint issue
-- Date: 2025-09-03

-- ============================================================================
-- CORE PROTOCOL TABLES
-- ============================================================================

-- Main protocol versions table
CREATE TABLE IF NOT EXISTS leo_protocols (
    id VARCHAR(50) PRIMARY KEY,
    version VARCHAR(50) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'superseded', 'draft', 'deprecated')),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    content TEXT, -- Full protocol content in markdown
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    superseded_by VARCHAR(50) REFERENCES leo_protocols(id),
    superseded_at TIMESTAMP,
    metadata JSONB DEFAULT '{}'
);

-- Add unique constraint for active status separately
CREATE UNIQUE INDEX unique_active_protocol ON leo_protocols (status) WHERE status = 'active';

-- Modular protocol sections for better organization
CREATE TABLE IF NOT EXISTS leo_protocol_sections (
    id SERIAL PRIMARY KEY,
    protocol_id VARCHAR(50) NOT NULL REFERENCES leo_protocols(id) ON DELETE CASCADE,
    section_type VARCHAR(50) NOT NULL,
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    order_index INTEGER NOT NULL,
    metadata JSONB DEFAULT '{}',
    
    UNIQUE(protocol_id, section_type, order_index)
);

-- ============================================================================
-- AGENT MANAGEMENT
-- ============================================================================

-- Agent specifications
CREATE TABLE IF NOT EXISTS leo_agents (
    id VARCHAR(20) PRIMARY KEY,
    agent_code VARCHAR(10) NOT NULL UNIQUE CHECK (agent_code IN ('LEAD', 'PLAN', 'EXEC')),
    name VARCHAR(100) NOT NULL,
    responsibilities TEXT,
    planning_percentage INTEGER,
    implementation_percentage INTEGER,
    verification_percentage INTEGER,
    approval_percentage INTEGER,
    total_percentage INTEGER GENERATED ALWAYS AS (
        COALESCE(planning_percentage, 0) + 
        COALESCE(implementation_percentage, 0) + 
        COALESCE(verification_percentage, 0) + 
        COALESCE(approval_percentage, 0)
    ) STORED,
    capabilities JSONB DEFAULT '[]',
    constraints JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Handoff templates between agents
CREATE TABLE IF NOT EXISTS leo_handoff_templates (
    id SERIAL PRIMARY KEY,
    from_agent VARCHAR(10) NOT NULL,
    to_agent VARCHAR(10) NOT NULL,
    handoff_type VARCHAR(50) NOT NULL,
    template_structure JSONB NOT NULL,
    required_elements JSONB DEFAULT '[]',
    validation_rules JSONB DEFAULT '[]',
    active BOOLEAN DEFAULT true,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(from_agent, to_agent, handoff_type, version),
    FOREIGN KEY (from_agent) REFERENCES leo_agents(agent_code),
    FOREIGN KEY (to_agent) REFERENCES leo_agents(agent_code)
);

-- ============================================================================
-- SUB-AGENT MANAGEMENT
-- ============================================================================

-- Sub-agent definitions
CREATE TABLE IF NOT EXISTS leo_sub_agents (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(20) NOT NULL UNIQUE,
    description TEXT,
    capabilities JSONB DEFAULT '[]',
    activation_type VARCHAR(20) CHECK (activation_type IN ('automatic', 'manual', 'conditional')),
    priority INTEGER DEFAULT 50,
    script_path VARCHAR(500),
    context_file VARCHAR(500),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'
);

-- Sub-agent activation triggers
CREATE TABLE IF NOT EXISTS leo_sub_agent_triggers (
    id SERIAL PRIMARY KEY,
    sub_agent_id VARCHAR(50) NOT NULL REFERENCES leo_sub_agents(id) ON DELETE CASCADE,
    trigger_phrase VARCHAR(500) NOT NULL,
    trigger_type VARCHAR(20) CHECK (trigger_type IN ('keyword', 'pattern', 'condition', 'threshold')),
    trigger_context VARCHAR(50), -- Where trigger applies (PRD, SD, code, etc.)
    priority INTEGER DEFAULT 50,
    active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    
    UNIQUE(sub_agent_id, trigger_phrase, trigger_context)
);

-- Sub-agent handoff templates
CREATE TABLE IF NOT EXISTS leo_sub_agent_handoffs (
    id SERIAL PRIMARY KEY,
    sub_agent_id VARCHAR(50) NOT NULL REFERENCES leo_sub_agents(id) ON DELETE CASCADE,
    handoff_template JSONB NOT NULL,
    validation_rules JSONB DEFAULT '[]',
    required_outputs JSONB DEFAULT '[]',
    success_criteria JSONB DEFAULT '[]',
    version INTEGER DEFAULT 1,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- PROTOCOL METADATA AND HISTORY
-- ============================================================================

-- Protocol change history and audit log
CREATE TABLE IF NOT EXISTS leo_protocol_changes (
    id SERIAL PRIMARY KEY,
    protocol_id VARCHAR(50) NOT NULL REFERENCES leo_protocols(id),
    change_type VARCHAR(50) NOT NULL,
    description TEXT,
    changed_fields JSONB DEFAULT '{}',
    changed_by VARCHAR(100),
    change_reason TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'
);

-- Cross-references and dependencies
CREATE TABLE IF NOT EXISTS leo_protocol_references (
    id SERIAL PRIMARY KEY,
    protocol_id VARCHAR(50) NOT NULL REFERENCES leo_protocols(id),
    reference_type VARCHAR(50) NOT NULL,
    reference_id VARCHAR(100),
    reference_table VARCHAR(100),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Protocol validation rules
CREATE TABLE IF NOT EXISTS leo_validation_rules (
    id SERIAL PRIMARY KEY,
    protocol_id VARCHAR(50) REFERENCES leo_protocols(id),
    rule_type VARCHAR(50) NOT NULL,
    rule_name VARCHAR(100) NOT NULL,
    rule_definition JSONB NOT NULL,
    severity VARCHAR(20) CHECK (severity IN ('error', 'warning', 'info')),
    active BOOLEAN DEFAULT true,
    applies_to_agent VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- WORKFLOW AND PROGRESS TRACKING
-- ============================================================================

-- Workflow phase definitions
CREATE TABLE IF NOT EXISTS leo_workflow_phases (
    id SERIAL PRIMARY KEY,
    protocol_id VARCHAR(50) REFERENCES leo_protocols(id),
    phase_name VARCHAR(100) NOT NULL,
    phase_order INTEGER NOT NULL,
    responsible_agent VARCHAR(10) REFERENCES leo_agents(agent_code),
    percentage_weight INTEGER,
    required_inputs JSONB DEFAULT '[]',
    required_outputs JSONB DEFAULT '[]',
    validation_gates JSONB DEFAULT '[]',
    
    UNIQUE(protocol_id, phase_order)
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX idx_leo_protocols_status ON leo_protocols(status);
CREATE INDEX idx_leo_protocols_version ON leo_protocols(version);
CREATE INDEX idx_leo_protocol_sections_protocol ON leo_protocol_sections(protocol_id);
CREATE INDEX idx_leo_protocol_sections_type ON leo_protocol_sections(section_type);
CREATE INDEX idx_leo_sub_agent_triggers_agent ON leo_sub_agent_triggers(sub_agent_id);
CREATE INDEX idx_leo_sub_agent_triggers_phrase ON leo_sub_agent_triggers(trigger_phrase);
CREATE INDEX idx_leo_protocol_changes_protocol ON leo_protocol_changes(protocol_id);
CREATE INDEX idx_leo_protocol_changes_timestamp ON leo_protocol_changes(timestamp DESC);

-- ============================================================================
-- INITIAL DATA INSERTION
-- ============================================================================

-- Insert core agents
INSERT INTO leo_agents (id, agent_code, name, responsibilities, planning_percentage, implementation_percentage, verification_percentage, approval_percentage)
VALUES 
    ('lead-agent', 'LEAD', 'Strategic Leadership Agent', 'Strategic planning, business objectives, final approval', 20, 0, 0, 15),
    ('plan-agent', 'PLAN', 'Technical Planning Agent', 'Technical design, PRD creation, acceptance testing', 20, 0, 15, 0),
    ('exec-agent', 'EXEC', 'Implementation Agent', 'Implementation based on PRD, no validation', 0, 30, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- Insert core sub-agents
INSERT INTO leo_sub_agents (id, name, code, description, activation_type, priority)
VALUES
    ('security-sub', 'Security Sub-Agent', 'SECURITY', 'Handles authentication, authorization, data protection, OWASP compliance', 'automatic', 90),
    ('performance-sub', 'Performance Sub-Agent', 'PERFORMANCE', 'Handles metrics, scalability, optimization', 'automatic', 80),
    ('design-sub', 'Design Sub-Agent', 'DESIGN', 'Handles UI/UX, accessibility, responsive design', 'automatic', 70),
    ('testing-sub', 'Testing Sub-Agent', 'TESTING', 'Handles coverage, E2E testing, regression suites', 'automatic', 85),
    ('database-sub', 'Database Sub-Agent', 'DATABASE', 'Handles schema changes, migrations, data integrity', 'automatic', 85),
    ('cost-sub', 'Cost Optimization Sub-Agent', 'COST', 'Handles resource optimization, billing analysis', 'conditional', 60),
    ('documentation-sub', 'Documentation Sub-Agent', 'DOCS', 'Handles API docs, user guides, technical documentation', 'automatic', 65)
ON CONFLICT (id) DO NOTHING;

-- Insert common triggers
INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, trigger_type, trigger_context, priority)
VALUES
    -- Security triggers
    ('security-sub', 'authentication', 'keyword', 'PRD', 90),
    ('security-sub', 'authorization', 'keyword', 'PRD', 90),
    ('security-sub', 'security', 'keyword', 'PRD', 90),
    ('security-sub', 'encryption', 'keyword', 'PRD', 90),
    ('security-sub', 'OWASP', 'keyword', 'PRD', 95),
    
    -- Performance triggers
    ('performance-sub', 'load time', 'pattern', 'PRD', 80),
    ('performance-sub', 'performance', 'keyword', 'PRD', 80),
    ('performance-sub', 'optimization', 'keyword', 'PRD', 80),
    ('performance-sub', 'users', 'pattern', 'PRD', 70),
    
    -- Design triggers
    ('design-sub', 'UI/UX', 'keyword', 'PRD', 70),
    ('design-sub', 'responsive', 'keyword', 'PRD', 70),
    ('design-sub', 'accessibility', 'keyword', 'PRD', 75),
    ('design-sub', 'WCAG', 'keyword', 'PRD', 75),
    
    -- Testing triggers
    ('testing-sub', 'coverage', 'pattern', 'PRD', 85),
    ('testing-sub', 'e2e', 'keyword', 'PRD', 85),
    ('testing-sub', 'testing', 'keyword', 'PRD', 80),
    
    -- Database triggers
    ('database-sub', 'schema', 'keyword', 'PRD', 85),
    ('database-sub', 'migration', 'keyword', 'PRD', 85),
    ('database-sub', 'database', 'keyword', 'PRD', 85)
ON CONFLICT (sub_agent_id, trigger_phrase, trigger_context) DO NOTHING;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get current active protocol
CREATE OR REPLACE FUNCTION get_active_leo_protocol()
RETURNS SETOF leo_protocols AS $$
BEGIN
    RETURN QUERY SELECT * FROM leo_protocols WHERE status = 'active' LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to supersede a protocol
CREATE OR REPLACE FUNCTION supersede_leo_protocol(old_version VARCHAR, new_version VARCHAR)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE leo_protocols 
    SET status = 'superseded', 
        superseded_by = new_version,
        superseded_at = CURRENT_TIMESTAMP
    WHERE version = old_version;
    
    UPDATE leo_protocols 
    SET status = 'active'
    WHERE version = new_version;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- View for active protocol with all sections
CREATE OR REPLACE VIEW active_leo_protocol_view AS
SELECT 
    p.*,
    json_agg(
        json_build_object(
            'section_type', s.section_type,
            'title', s.title,
            'content', s.content,
            'order_index', s.order_index
        ) ORDER BY s.order_index
    ) as sections
FROM leo_protocols p
LEFT JOIN leo_protocol_sections s ON p.id = s.protocol_id
WHERE p.status = 'active'
GROUP BY p.id, p.version, p.status, p.title, p.description, p.content, 
         p.created_at, p.created_by, p.superseded_by, p.superseded_at, p.metadata;

-- View for sub-agents with triggers
CREATE OR REPLACE VIEW leo_sub_agents_with_triggers AS
SELECT 
    sa.*,
    json_agg(
        json_build_object(
            'trigger_phrase', t.trigger_phrase,
            'trigger_type', t.trigger_type,
            'trigger_context', t.trigger_context,
            'priority', t.priority
        )
    ) as triggers
FROM leo_sub_agents sa
LEFT JOIN leo_sub_agent_triggers t ON sa.id = t.sub_agent_id
WHERE sa.active = true AND t.active = true
GROUP BY sa.id, sa.name, sa.code, sa.description, sa.capabilities, 
         sa.activation_type, sa.priority, sa.script_path, sa.context_file, 
         sa.active, sa.created_at, sa.metadata;

-- ============================================================================
-- MIGRATION NOTICE
-- ============================================================================
-- After running this schema, execute the migration script to:
-- 1. Import existing protocol files into database
-- 2. Set v4.1.2_database_first as active
-- 3. Update all references to use database
-- 4. Deprecate file-based approach