-- EXEC Implementation Excellence Orchestrator Database Schema
-- Stores results from systematic implementation tracking and quality assurance
-- Date: 2025-09-24

-- 1. Create exec_implementation_sessions table for tracking EXEC implementation progress
CREATE TABLE IF NOT EXISTS exec_implementation_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_id TEXT NOT NULL REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
    prd_id TEXT REFERENCES product_requirements_v2(id) ON DELETE SET NULL,

    -- Implementation Excellence Framework results
    status TEXT CHECK (status IN ('active', 'paused', 'completed', 'failed', 'cancelled')) NOT NULL DEFAULT 'active',
    implementation_type TEXT CHECK (implementation_type IN ('UI_COMPONENT', 'API_ENDPOINT', 'DATABASE_CHANGE', 'AUTHENTICATION', 'SYSTEM_TOOLING', 'GENERAL_FEATURE')) NOT NULL,
    quality_score INTEGER DEFAULT 0 CHECK (quality_score >= 0 AND quality_score <= 100),

    -- 4-Domain Excellence Framework tracking
    code_quality_score INTEGER DEFAULT 0 CHECK (code_quality_score >= 0 AND code_quality_score <= 100),
    performance_score INTEGER DEFAULT 0 CHECK (performance_score >= 0 AND performance_score <= 100),
    security_score INTEGER DEFAULT 0 CHECK (security_score >= 0 AND security_score <= 100),
    ux_accessibility_score INTEGER DEFAULT 0 CHECK (ux_accessibility_score >= 0 AND ux_accessibility_score <= 100),

    -- Implementation progress tracking
    implementation_progress INTEGER DEFAULT 0 CHECK (implementation_progress >= 0 AND implementation_progress <= 100),

    -- Sub-agent orchestration results
    sub_agent_results JSONB DEFAULT '[]'::jsonb,
    quality_gates TEXT[] DEFAULT ARRAY[]::TEXT[],

    -- Pre-implementation checklist
    pre_impl_checklist JSONB DEFAULT '{}'::jsonb,

    -- Implementation evidence and metrics
    test_coverage_pct INTEGER DEFAULT 0 CHECK (test_coverage_pct >= 0 AND test_coverage_pct <= 100),
    performance_metrics JSONB DEFAULT '{}'::jsonb,
    security_scan_results JSONB DEFAULT '{}'::jsonb,
    accessibility_audit JSONB DEFAULT '{}'::jsonb,

    -- Screenshots and evidence
    before_screenshots TEXT[], -- URLs to before screenshots
    after_screenshots TEXT[], -- URLs to after screenshots
    demo_urls TEXT[], -- URLs to live demos or recordings

    -- Metadata
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ DEFAULT NULL,
    orchestrator TEXT DEFAULT 'EXEC_IMPLEMENTATION_EXCELLENCE_ORCHESTRATOR_v1.0',
    session_version TEXT DEFAULT '1.0',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure one active session per SD at a time
    UNIQUE(sd_id, status) DEFERRABLE INITIALLY DEFERRED
);

-- Add partial unique constraint to allow only one active session per SD
CREATE UNIQUE INDEX IF NOT EXISTS idx_exec_sessions_sd_active
    ON exec_implementation_sessions(sd_id)
    WHERE status = 'active';

-- 2. Create exec_quality_checkpoints table for tracking quality gate completion
CREATE TABLE IF NOT EXISTS exec_quality_checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES exec_implementation_sessions(id) ON DELETE CASCADE,
    sd_id TEXT NOT NULL REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,

    checkpoint_name TEXT NOT NULL,
    checkpoint_type TEXT CHECK (checkpoint_type IN ('CODE_QUALITY', 'PERFORMANCE', 'SECURITY', 'TESTING', 'ACCESSIBILITY', 'DOCUMENTATION')) NOT NULL,
    is_required BOOLEAN DEFAULT true,
    is_complete BOOLEAN DEFAULT false,

    -- Quality metrics for this checkpoint
    score INTEGER DEFAULT 0 CHECK (score >= 0 AND score <= 100),
    evidence_url TEXT, -- Link to test results, screenshots, etc.
    completion_notes TEXT,

    completed_at TIMESTAMPTZ DEFAULT NULL,
    completed_by TEXT DEFAULT NULL,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(session_id, checkpoint_name)
);

-- 3. Create exec_sub_agent_activations table for detailed sub-agent results during implementation
CREATE TABLE IF NOT EXISTS exec_sub_agent_activations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES exec_implementation_sessions(id) ON DELETE CASCADE,
    sd_id TEXT NOT NULL REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,

    sub_agent_type TEXT CHECK (sub_agent_type IN ('SECURITY', 'DATABASE', 'VALIDATION', 'TESTING', 'PERFORMANCE', 'DESIGN', 'DEBUGGING')) NOT NULL,
    activation_reason TEXT NOT NULL, -- Why this sub-agent was activated
    execution_status TEXT CHECK (execution_status IN ('PASS', 'FAIL', 'WARNING', 'REVIEW_REQUIRED', 'ERROR')) NOT NULL,
    severity TEXT CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')) NOT NULL,

    summary TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    recommendations TEXT[],

    -- Quality score from this sub-agent
    quality_score INTEGER DEFAULT 0 CHECK (quality_score >= 0 AND quality_score <= 100),

    execution_time_ms INTEGER DEFAULT 0,
    activated_at TIMESTAMPTZ DEFAULT NOW(),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create exec_handoff_preparations table for EXEC→PLAN handoff tracking
CREATE TABLE IF NOT EXISTS exec_handoff_preparations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES exec_implementation_sessions(id) ON DELETE CASCADE,
    sd_id TEXT NOT NULL REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,

    handoff_status TEXT CHECK (handoff_status IN ('preparing', 'ready', 'sent', 'accepted', 'rejected')) NOT NULL DEFAULT 'preparing',

    -- Implementation evidence for handoff
    implementation_summary TEXT NOT NULL,
    quality_metrics JSONB DEFAULT '{}'::jsonb,
    test_results JSONB DEFAULT '{}'::jsonb,
    performance_benchmarks JSONB DEFAULT '{}'::jsonb,
    security_validation JSONB DEFAULT '{}'::jsonb,
    accessibility_compliance JSONB DEFAULT '{}'::jsonb,

    -- Evidence URLs
    demo_url TEXT,
    documentation_url TEXT,
    test_report_url TEXT,

    -- Handoff package
    deliverables_manifest TEXT[],
    known_issues TEXT[],
    post_implementation_notes TEXT,

    prepared_at TIMESTAMPTZ DEFAULT NOW(),
    sent_at TIMESTAMPTZ DEFAULT NULL,
    response_at TIMESTAMPTZ DEFAULT NULL,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_exec_sessions_sd_id ON exec_implementation_sessions(sd_id);
CREATE INDEX IF NOT EXISTS idx_exec_sessions_status ON exec_implementation_sessions(status);
CREATE INDEX IF NOT EXISTS idx_exec_sessions_quality_score ON exec_implementation_sessions(quality_score);
CREATE INDEX IF NOT EXISTS idx_exec_sessions_started_at ON exec_implementation_sessions(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_exec_checkpoints_session_id ON exec_quality_checkpoints(session_id);
CREATE INDEX IF NOT EXISTS idx_exec_checkpoints_sd_id ON exec_quality_checkpoints(sd_id);
CREATE INDEX IF NOT EXISTS idx_exec_checkpoints_complete ON exec_quality_checkpoints(is_complete);
CREATE INDEX IF NOT EXISTS idx_exec_checkpoints_type ON exec_quality_checkpoints(checkpoint_type);

CREATE INDEX IF NOT EXISTS idx_exec_subagent_activations_session_id ON exec_sub_agent_activations(session_id);
CREATE INDEX IF NOT EXISTS idx_exec_subagent_activations_type ON exec_sub_agent_activations(sub_agent_type);
CREATE INDEX IF NOT EXISTS idx_exec_subagent_activations_severity ON exec_sub_agent_activations(severity);

CREATE INDEX IF NOT EXISTS idx_exec_handoff_preparations_session_id ON exec_handoff_preparations(session_id);
CREATE INDEX IF NOT EXISTS idx_exec_handoff_preparations_status ON exec_handoff_preparations(handoff_status);

-- 6. Create function to get latest EXEC implementation session for an SD
CREATE OR REPLACE FUNCTION get_latest_exec_session(p_sd_id TEXT)
RETURNS TABLE (
    session_id UUID,
    status TEXT,
    implementation_type TEXT,
    quality_score INTEGER,
    implementation_progress INTEGER,
    code_quality_score INTEGER,
    performance_score INTEGER,
    security_score INTEGER,
    ux_accessibility_score INTEGER,
    sub_agent_count INTEGER,
    checkpoint_count INTEGER,
    started_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        eis.id,
        eis.status,
        eis.implementation_type,
        eis.quality_score,
        eis.implementation_progress,
        eis.code_quality_score,
        eis.performance_score,
        eis.security_score,
        eis.ux_accessibility_score,
        (SELECT COUNT(*)::INTEGER FROM exec_sub_agent_activations WHERE session_id = eis.id),
        (SELECT COUNT(*)::INTEGER FROM exec_quality_checkpoints WHERE session_id = eis.id),
        eis.started_at
    FROM exec_implementation_sessions eis
    WHERE eis.sd_id = p_sd_id
    ORDER BY eis.started_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- 7. Create function to calculate checkpoint completion percentage
CREATE OR REPLACE FUNCTION calculate_checkpoint_completion(p_session_id UUID)
RETURNS INTEGER AS $$
DECLARE
    total_checkpoints INTEGER;
    completed_checkpoints INTEGER;
    completion_percentage INTEGER;
BEGIN
    -- Count total and completed checkpoints
    SELECT COUNT(*) INTO total_checkpoints
    FROM exec_quality_checkpoints
    WHERE session_id = p_session_id;

    SELECT COUNT(*) INTO completed_checkpoints
    FROM exec_quality_checkpoints
    WHERE session_id = p_session_id AND is_complete = true;

    -- Calculate percentage
    IF total_checkpoints = 0 THEN
        RETURN 100; -- No checkpoints means 100% complete
    ELSE
        completion_percentage := ROUND((completed_checkpoints::DECIMAL / total_checkpoints::DECIMAL) * 100);
        RETURN completion_percentage;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 8. Create function to update overall quality score based on domain scores
CREATE OR REPLACE FUNCTION update_exec_quality_score(p_session_id UUID)
RETURNS VOID AS $$
DECLARE
    avg_quality_score INTEGER;
BEGIN
    -- Calculate average quality score from 4 domains
    SELECT ROUND(
        (COALESCE(code_quality_score, 0) +
         COALESCE(performance_score, 0) +
         COALESCE(security_score, 0) +
         COALESCE(ux_accessibility_score, 0)) / 4.0
    ) INTO avg_quality_score
    FROM exec_implementation_sessions
    WHERE id = p_session_id;

    -- Update the overall quality score
    UPDATE exec_implementation_sessions
    SET
        quality_score = avg_quality_score,
        updated_at = NOW()
    WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql;

-- 9. Create view for EXEC implementation dashboard
CREATE OR REPLACE VIEW v_exec_implementation_summary AS
SELECT
    sd.id as sd_id,
    sd.title,
    sd.status as sd_status,
    sd.target_application,
    sd.priority,
    eis.id as session_id,
    eis.status as implementation_status,
    eis.implementation_type,
    eis.quality_score,
    eis.implementation_progress,
    eis.code_quality_score,
    eis.performance_score,
    eis.security_score,
    eis.ux_accessibility_score,
    eis.test_coverage_pct,
    eis.started_at,
    eis.completed_at,
    calculate_checkpoint_completion(eis.id) as checkpoint_completion_pct,
    CASE
        WHEN eis.status = 'completed' THEN 'Implementation complete'
        WHEN eis.quality_score >= 95 THEN 'Excellent quality - ready for handoff'
        WHEN eis.quality_score >= 85 THEN 'High quality - minor improvements needed'
        WHEN eis.quality_score >= 75 THEN 'Good quality - address key issues'
        WHEN eis.quality_score >= 65 THEN 'Moderate quality - significant work needed'
        WHEN eis.status = 'active' THEN 'Implementation in progress'
        ELSE 'Quality needs improvement'
    END as next_action
FROM strategic_directives_v2 sd
LEFT JOIN exec_implementation_sessions eis ON sd.id = eis.sd_id
WHERE eis.id IS NULL OR eis.id = (
    SELECT id FROM exec_implementation_sessions
    WHERE sd_id = sd.id
    ORDER BY started_at DESC
    LIMIT 1
);

-- 10. Create trigger to auto-create quality checkpoints when session is created
CREATE OR REPLACE FUNCTION create_quality_checkpoints_from_session()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert universal quality checkpoints
    INSERT INTO exec_quality_checkpoints (session_id, sd_id, checkpoint_name, checkpoint_type, is_required)
    VALUES
        (NEW.id, NEW.sd_id, 'Unit test coverage ≥80%', 'TESTING', true),
        (NEW.id, NEW.sd_id, 'Code review completion', 'CODE_QUALITY', true),
        (NEW.id, NEW.sd_id, 'Error handling verification', 'CODE_QUALITY', true);

    -- Add checkpoints based on implementation type
    IF NEW.implementation_type = 'UI_COMPONENT' THEN
        INSERT INTO exec_quality_checkpoints (session_id, sd_id, checkpoint_name, checkpoint_type, is_required)
        VALUES
            (NEW.id, NEW.sd_id, 'Accessibility compliance check', 'ACCESSIBILITY', true),
            (NEW.id, NEW.sd_id, 'Responsive design verification', 'ACCESSIBILITY', true),
            (NEW.id, NEW.sd_id, 'Cross-browser compatibility', 'TESTING', true);
    END IF;

    IF NEW.implementation_type = 'API_ENDPOINT' THEN
        INSERT INTO exec_quality_checkpoints (session_id, sd_id, checkpoint_name, checkpoint_type, is_required)
        VALUES
            (NEW.id, NEW.sd_id, 'Security vulnerability scan', 'SECURITY', true),
            (NEW.id, NEW.sd_id, 'Load testing completion', 'PERFORMANCE', true),
            (NEW.id, NEW.sd_id, 'API documentation update', 'DOCUMENTATION', true);
    END IF;

    IF NEW.implementation_type = 'DATABASE_CHANGE' THEN
        INSERT INTO exec_quality_checkpoints (session_id, sd_id, checkpoint_name, checkpoint_type, is_required)
        VALUES
            (NEW.id, NEW.sd_id, 'Migration rollback test', 'TESTING', true),
            (NEW.id, NEW.sd_id, 'Data integrity verification', 'SECURITY', true),
            (NEW.id, NEW.sd_id, 'Performance impact assessment', 'PERFORMANCE', true);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 11. Create the trigger
DROP TRIGGER IF EXISTS trigger_create_quality_checkpoints ON exec_implementation_sessions;
CREATE TRIGGER trigger_create_quality_checkpoints
    AFTER INSERT ON exec_implementation_sessions
    FOR EACH ROW
    EXECUTE FUNCTION create_quality_checkpoints_from_session();

-- 12. Create trigger to update SD status based on EXEC implementation progress
CREATE OR REPLACE FUNCTION update_sd_after_exec_completion()
RETURNS TRIGGER AS $$
BEGIN
    -- Update SD status when implementation is completed
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        UPDATE strategic_directives_v2
        SET
            status = CASE
                WHEN NEW.quality_score >= 90 THEN 'implementation_complete'
                WHEN NEW.quality_score >= 75 THEN 'implementation_complete'
                ELSE 'implementation_review_required'
            END,
            updated_at = NOW()
        WHERE id = NEW.sd_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 13. Create the trigger
DROP TRIGGER IF EXISTS trigger_update_sd_after_exec_completion ON exec_implementation_sessions;
CREATE TRIGGER trigger_update_sd_after_exec_completion
    AFTER UPDATE ON exec_implementation_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_sd_after_exec_completion();

-- 14. Add RLS policies for exec tables
ALTER TABLE exec_implementation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exec_quality_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE exec_sub_agent_activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE exec_handoff_preparations ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read implementation results
CREATE POLICY exec_sessions_select ON exec_implementation_sessions
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY exec_checkpoints_select ON exec_quality_checkpoints
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY exec_subagent_activations_select ON exec_sub_agent_activations
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY exec_handoff_preparations_select ON exec_handoff_preparations
    FOR SELECT TO authenticated
    USING (true);

-- Allow service role to manage implementation data
CREATE POLICY exec_sessions_all ON exec_implementation_sessions
    FOR ALL TO service_role
    USING (true);

CREATE POLICY exec_checkpoints_all ON exec_quality_checkpoints
    FOR ALL TO service_role
    USING (true);

CREATE POLICY exec_subagent_activations_all ON exec_sub_agent_activations
    FOR ALL TO service_role
    USING (true);

CREATE POLICY exec_handoff_preparations_all ON exec_handoff_preparations
    FOR ALL TO service_role
    USING (true);

-- 15. Add comments for documentation
COMMENT ON TABLE exec_implementation_sessions IS 'Stores results from EXEC Implementation Excellence Orchestrator - systematic implementation tracking and quality assurance';
COMMENT ON COLUMN exec_implementation_sessions.implementation_type IS 'Type of implementation: UI_COMPONENT/API_ENDPOINT/DATABASE_CHANGE/AUTHENTICATION/SYSTEM_TOOLING/GENERAL_FEATURE';
COMMENT ON COLUMN exec_implementation_sessions.quality_score IS 'Overall implementation quality score (0-100)';
COMMENT ON COLUMN exec_implementation_sessions.code_quality_score IS 'Code quality domain score (0-100)';
COMMENT ON COLUMN exec_implementation_sessions.performance_score IS 'Performance domain score (0-100)';
COMMENT ON COLUMN exec_implementation_sessions.security_score IS 'Security domain score (0-100)';
COMMENT ON COLUMN exec_implementation_sessions.ux_accessibility_score IS 'UX/Accessibility domain score (0-100)';
COMMENT ON COLUMN exec_implementation_sessions.sub_agent_results IS 'JSON array of sub-agent activation results';
COMMENT ON COLUMN exec_implementation_sessions.quality_gates IS 'Array of required quality gates for implementation';

COMMENT ON TABLE exec_quality_checkpoints IS 'Tracks completion of quality checkpoints during EXEC implementation';
COMMENT ON TABLE exec_sub_agent_activations IS 'Detailed results from sub-agent activations during EXEC implementation';
COMMENT ON TABLE exec_handoff_preparations IS 'Tracks EXEC→PLAN handoff preparation and delivery';
COMMENT ON FUNCTION get_latest_exec_session IS 'Returns the most recent EXEC implementation session for a given SD';
COMMENT ON FUNCTION calculate_checkpoint_completion IS 'Calculates percentage of completed quality checkpoints for a session';
COMMENT ON FUNCTION update_exec_quality_score IS 'Updates overall quality score based on 4-domain scores';
COMMENT ON VIEW v_exec_implementation_summary IS 'Dashboard view showing EXEC implementation status for all SDs';