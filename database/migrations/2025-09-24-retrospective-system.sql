-- Retrospective Management System Database Schema
-- Integrates with LEO Protocol and Cross-Agent Intelligence
-- Date: 2025-09-24

-- ============================================================================
-- CORE RETROSPECTIVE TABLES
-- ============================================================================

-- 1. Main retrospectives table
CREATE TABLE IF NOT EXISTS retrospectives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Context linking
    sd_id TEXT REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
    sprint_number INTEGER,
    project_name TEXT,

    -- Retrospective metadata
    retro_type TEXT NOT NULL CHECK (retro_type IN (
        'SPRINT', 'SD_COMPLETION', 'INCIDENT', 'MILESTONE',
        'WEEKLY', 'MONTHLY', 'ARCHITECTURE_DECISION', 'RELEASE'
    )),
    title TEXT NOT NULL,
    description TEXT,

    -- Time bounds
    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ,
    conducted_date TIMESTAMPTZ DEFAULT NOW(),

    -- Participants
    agents_involved TEXT[] DEFAULT '{}', -- ['LEAD', 'PLAN', 'EXEC']
    sub_agents_involved TEXT[] DEFAULT '{}', -- ['VALIDATION', 'SECURITY', etc.]
    human_participants TEXT[] DEFAULT '{}',

    -- Structured sections (JSONB for flexibility)
    what_went_well JSONB DEFAULT '[]',
    what_needs_improvement JSONB DEFAULT '[]',
    action_items JSONB DEFAULT '[]',
    key_learnings JSONB DEFAULT '[]',

    -- Metrics and outcomes
    velocity_achieved INTEGER, -- Story points or percentage
    quality_score INTEGER CHECK (quality_score >= 0 AND quality_score <= 100),
    team_satisfaction INTEGER CHECK (team_satisfaction >= 1 AND team_satisfaction <= 10),

    -- Business outcomes
    business_value_delivered TEXT,
    customer_impact TEXT,
    technical_debt_addressed BOOLEAN DEFAULT false,
    technical_debt_created BOOLEAN DEFAULT false,

    -- Technical metrics
    bugs_found INTEGER DEFAULT 0,
    bugs_resolved INTEGER DEFAULT 0,
    tests_added INTEGER DEFAULT 0,
    code_coverage_delta DECIMAL,
    performance_impact TEXT,

    -- Success indicators
    objectives_met BOOLEAN,
    on_schedule BOOLEAN,
    within_scope BOOLEAN,

    -- Pattern tags for ML analysis
    success_patterns TEXT[] DEFAULT '{}',
    failure_patterns TEXT[] DEFAULT '{}',
    improvement_areas TEXT[] DEFAULT '{}',

    -- Auto-generation metadata
    generated_by TEXT CHECK (generated_by IN ('MANUAL', 'SUB_AGENT', 'TRIGGER', 'SCHEDULED')),
    trigger_event TEXT, -- What caused this retrospective

    -- Status
    status TEXT CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')) DEFAULT 'DRAFT',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Retrospective insights table
CREATE TABLE IF NOT EXISTS retrospective_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    retrospective_id UUID NOT NULL REFERENCES retrospectives(id) ON DELETE CASCADE,

    -- Insight classification
    insight_type TEXT NOT NULL CHECK (insight_type IN (
        'SUCCESS_FACTOR', 'FAILURE_MODE', 'PROCESS_IMPROVEMENT',
        'TECHNICAL_LEARNING', 'BUSINESS_LEARNING', 'TEAM_DYNAMIC',
        'TOOL_EFFECTIVENESS', 'COMMUNICATION_PATTERN'
    )),

    -- The insight itself
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    evidence JSONB, -- Supporting data/examples

    -- Impact assessment
    impact_level TEXT CHECK (impact_level IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
    affected_areas TEXT[], -- ['PLANNING', 'IMPLEMENTATION', 'TESTING', etc.]

    -- Actionability
    is_actionable BOOLEAN DEFAULT true,
    recommended_actions JSONB DEFAULT '[]',
    assigned_to TEXT, -- Which agent should act on this

    -- Pattern matching
    relates_to_patterns TEXT[], -- Links to intelligence_patterns
    frequency_observed INTEGER DEFAULT 1, -- How often we've seen this

    -- Resolution tracking
    action_taken BOOLEAN DEFAULT false,
    action_taken_date TIMESTAMPTZ,
    action_result TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Retrospective templates table
CREATE TABLE IF NOT EXISTS retrospective_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    template_name TEXT NOT NULL UNIQUE,
    template_type TEXT NOT NULL,
    description TEXT,

    -- Template structure
    sections JSONB NOT NULL, -- Define required sections
    questions JSONB, -- Guiding questions for each section
    metrics_to_capture JSONB, -- Which metrics are relevant

    -- Activation rules
    trigger_conditions JSONB, -- When to use this template
    required_participants TEXT[], -- Who must be involved

    -- Template metadata
    is_active BOOLEAN DEFAULT true,
    version INTEGER DEFAULT 1,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Action items tracking
CREATE TABLE IF NOT EXISTS retrospective_action_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    retrospective_id UUID NOT NULL REFERENCES retrospectives(id) ON DELETE CASCADE,

    -- Action details
    title TEXT NOT NULL,
    description TEXT,
    category TEXT CHECK (category IN (
        'PROCESS', 'TECHNICAL', 'COMMUNICATION',
        'TOOLING', 'DOCUMENTATION', 'TRAINING'
    )),

    -- Assignment and tracking
    assigned_to TEXT, -- Agent or person responsible
    priority TEXT CHECK (priority IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
    due_date TIMESTAMPTZ,

    -- Status tracking
    status TEXT CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DEFERRED')) DEFAULT 'PENDING',
    completed_date TIMESTAMPTZ,
    completion_notes TEXT,

    -- Impact tracking
    expected_impact TEXT,
    actual_impact TEXT,
    success_criteria JSONB,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- CROSS-AGENT INTELLIGENCE INTEGRATION
-- ============================================================================

-- 5. Link retrospectives to learning outcomes
CREATE TABLE IF NOT EXISTS retrospective_learning_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    retrospective_id UUID NOT NULL REFERENCES retrospectives(id) ON DELETE CASCADE,
    learning_outcome_id UUID REFERENCES agent_learning_outcomes(id) ON DELETE CASCADE,

    -- Correlation strength
    correlation_type TEXT CHECK (correlation_type IN ('DIRECT', 'INDIRECT', 'POTENTIAL')),
    correlation_strength DECIMAL CHECK (correlation_strength >= 0 AND correlation_strength <= 1),

    -- What was learned
    learning_summary TEXT,
    impacts_agent TEXT CHECK (impacts_agent IN ('LEAD', 'PLAN', 'EXEC', 'ALL')),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Retrospective triggers table
CREATE TABLE IF NOT EXISTS retrospective_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    trigger_name TEXT NOT NULL UNIQUE,
    trigger_type TEXT CHECK (trigger_type IN (
        'EVENT', 'SCHEDULE', 'THRESHOLD', 'MANUAL'
    )),

    -- Trigger conditions
    event_conditions JSONB, -- e.g., {"sd_status": "completed", "sprint_end": true}
    schedule_cron TEXT, -- For scheduled retrospectives
    threshold_conditions JSONB, -- e.g., {"bugs_count": ">10", "velocity": "<50"}

    -- Template to use
    template_id UUID REFERENCES retrospective_templates(id),

    -- Auto-generation settings
    auto_generate BOOLEAN DEFAULT false,
    requires_approval BOOLEAN DEFAULT true,

    -- Activation status
    is_active BOOLEAN DEFAULT true,
    last_triggered TIMESTAMPTZ,
    next_scheduled TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX idx_retrospectives_sd_id ON retrospectives(sd_id);
CREATE INDEX idx_retrospectives_retro_type ON retrospectives(retro_type);
CREATE INDEX idx_retrospectives_conducted_date ON retrospectives(conducted_date);
CREATE INDEX idx_retrospectives_status ON retrospectives(status);
CREATE INDEX idx_retrospectives_success_patterns ON retrospectives USING GIN(success_patterns);
CREATE INDEX idx_retrospectives_failure_patterns ON retrospectives USING GIN(failure_patterns);

CREATE INDEX idx_insights_retrospective_id ON retrospective_insights(retrospective_id);
CREATE INDEX idx_insights_insight_type ON retrospective_insights(insight_type);
CREATE INDEX idx_insights_is_actionable ON retrospective_insights(is_actionable);

CREATE INDEX idx_action_items_retrospective_id ON retrospective_action_items(retrospective_id);
CREATE INDEX idx_action_items_status ON retrospective_action_items(status);
CREATE INDEX idx_action_items_assigned_to ON retrospective_action_items(assigned_to);

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- View for pending action items across all retrospectives
CREATE OR REPLACE VIEW v_pending_action_items AS
SELECT
    ai.*,
    r.title as retrospective_title,
    r.sd_id,
    r.conducted_date
FROM retrospective_action_items ai
JOIN retrospectives r ON ai.retrospective_id = r.id
WHERE ai.status IN ('PENDING', 'IN_PROGRESS')
ORDER BY ai.priority DESC, ai.due_date ASC;

-- View for insight patterns
CREATE OR REPLACE VIEW v_insight_patterns AS
SELECT
    insight_type,
    COUNT(*) as occurrence_count,
    array_agg(DISTINCT title) as examples,
    array_agg(DISTINCT affected_areas) as all_affected_areas,
    AVG(CASE WHEN impact_level = 'CRITICAL' THEN 4
             WHEN impact_level = 'HIGH' THEN 3
             WHEN impact_level = 'MEDIUM' THEN 2
             WHEN impact_level = 'LOW' THEN 1 END) as avg_impact
FROM retrospective_insights
GROUP BY insight_type
ORDER BY occurrence_count DESC;

-- View for retrospective metrics over time
CREATE OR REPLACE VIEW v_retrospective_trends AS
SELECT
    DATE_TRUNC('month', conducted_date) as month,
    retro_type,
    COUNT(*) as retro_count,
    AVG(quality_score) as avg_quality,
    AVG(team_satisfaction) as avg_satisfaction,
    AVG(velocity_achieved) as avg_velocity,
    SUM(bugs_resolved) as total_bugs_resolved,
    COUNT(CASE WHEN objectives_met THEN 1 END)::FLOAT / COUNT(*)::FLOAT * 100 as objectives_met_pct
FROM retrospectives
WHERE status = 'PUBLISHED'
GROUP BY DATE_TRUNC('month', conducted_date), retro_type
ORDER BY month DESC, retro_type;

-- ============================================================================
-- DEFAULT TEMPLATES
-- ============================================================================

-- Insert default sprint retrospective template
INSERT INTO retrospective_templates (
    template_name,
    template_type,
    description,
    sections,
    questions,
    metrics_to_capture
) VALUES (
    'sprint_retrospective',
    'SPRINT',
    'Standard sprint retrospective template',
    '{
        "what_went_well": {"required": true, "min_items": 3},
        "what_needs_improvement": {"required": true, "min_items": 2},
        "action_items": {"required": true, "min_items": 1},
        "key_learnings": {"required": false}
    }'::jsonb,
    '{
        "what_went_well": ["What helped us achieve our goals?", "What should we keep doing?"],
        "what_needs_improvement": ["What slowed us down?", "What caused frustration?"],
        "action_items": ["What specific changes will we make?", "Who will own each action?"]
    }'::jsonb,
    '["velocity", "bugs_found", "bugs_resolved", "tests_added", "team_satisfaction"]'::jsonb
) ON CONFLICT (template_name) DO NOTHING;

-- Insert SD completion retrospective template
INSERT INTO retrospective_templates (
    template_name,
    template_type,
    description,
    sections,
    questions,
    metrics_to_capture
) VALUES (
    'sd_completion_retrospective',
    'SD_COMPLETION',
    'Strategic directive completion retrospective',
    '{
        "objectives_achievement": {"required": true},
        "technical_outcomes": {"required": true},
        "business_impact": {"required": true},
        "lessons_learned": {"required": true},
        "recommendations": {"required": true}
    }'::jsonb,
    '{
        "objectives_achievement": ["Did we meet the original objectives?", "What changed from the original plan?"],
        "technical_outcomes": ["What technical debt did we create/resolve?", "How maintainable is the solution?"],
        "business_impact": ["What value was delivered?", "How did users respond?"],
        "lessons_learned": ["What would we do differently?", "What worked exceptionally well?"]
    }'::jsonb,
    '["quality_score", "business_value_delivered", "customer_impact", "technical_debt_addressed", "objectives_met"]'::jsonb
) ON CONFLICT (template_name) DO NOTHING;

-- ============================================================================
-- TRIGGER FUNCTIONS
-- ============================================================================

-- Function to automatically create retrospectives on SD completion
CREATE OR REPLACE FUNCTION trigger_sd_completion_retrospective()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        INSERT INTO retrospectives (
            sd_id,
            retro_type,
            title,
            description,
            period_start,
            period_end,
            generated_by,
            trigger_event
        ) VALUES (
            NEW.id,
            'SD_COMPLETION',
            'SD Completion Retrospective: ' || NEW.title,
            'Automatically generated retrospective for completed strategic directive',
            NEW.created_at,
            NOW(),
            'TRIGGER',
            'sd_status_change_to_completed'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on strategic_directives_v2
DROP TRIGGER IF EXISTS tr_sd_completion_retrospective ON strategic_directives_v2;
CREATE TRIGGER tr_sd_completion_retrospective
    AFTER UPDATE ON strategic_directives_v2
    FOR EACH ROW
    EXECUTE FUNCTION trigger_sd_completion_retrospective();

-- Function to update retrospective timestamps
CREATE OR REPLACE FUNCTION update_retrospective_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create update triggers
CREATE TRIGGER tr_retrospectives_updated
    BEFORE UPDATE ON retrospectives
    FOR EACH ROW
    EXECUTE FUNCTION update_retrospective_timestamp();

CREATE TRIGGER tr_insights_updated
    BEFORE UPDATE ON retrospective_insights
    FOR EACH ROW
    EXECUTE FUNCTION update_retrospective_timestamp();

CREATE TRIGGER tr_action_items_updated
    BEFORE UPDATE ON retrospective_action_items
    FOR EACH ROW
    EXECUTE FUNCTION update_retrospective_timestamp();