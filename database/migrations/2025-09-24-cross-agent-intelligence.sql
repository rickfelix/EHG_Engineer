-- Cross-Agent Intelligence & Continuous Learning System Database Schema
-- Enables agents to learn from each other's decisions and outcomes
-- Date: 2025-09-24

-- 1. Create agent_learning_outcomes table to track cross-agent decision chains and their final outcomes
CREATE TABLE IF NOT EXISTS agent_learning_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_id TEXT NOT NULL REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,

    -- Complete workflow chain tracking
    lead_decision TEXT CHECK (lead_decision IN ('APPROVE', 'CONDITIONAL', 'CONSOLIDATE', 'DEFER', 'REJECT', 'CLARIFY')),
    lead_confidence INTEGER CHECK (lead_confidence >= 0 AND lead_confidence <= 100),
    lead_reasoning TEXT,
    lead_decision_date TIMESTAMPTZ,

    plan_decision TEXT CHECK (plan_decision IN ('APPROVE', 'CONDITIONAL', 'REDESIGN', 'DEFER', 'REJECT', 'RESEARCH')),
    plan_complexity_score INTEGER CHECK (plan_complexity_score >= 0 AND plan_complexity_score <= 10),
    plan_technical_feasibility TEXT CHECK (plan_technical_feasibility IN ('HIGH', 'MEDIUM', 'LOW')),
    plan_implementation_risk TEXT CHECK (plan_implementation_risk IN ('HIGH', 'MEDIUM', 'LOW')),
    plan_decision_date TIMESTAMPTZ,

    exec_final_quality_score INTEGER CHECK (exec_final_quality_score >= 0 AND exec_final_quality_score <= 100),
    exec_implementation_type TEXT CHECK (exec_implementation_type IN ('UI_COMPONENT', 'API_ENDPOINT', 'DATABASE_CHANGE', 'AUTHENTICATION', 'SYSTEM_TOOLING', 'GENERAL_FEATURE')),
    exec_actual_complexity INTEGER CHECK (exec_actual_complexity >= 1 AND exec_actual_complexity <= 10), -- What complexity actually was
    exec_completion_date TIMESTAMPTZ,

    -- Final business outcome (measured 30-90 days after completion)
    business_outcome TEXT CHECK (business_outcome IN ('SUCCESS', 'PARTIAL_SUCCESS', 'FAILURE', 'CANCELLED', 'PENDING')),
    business_outcome_date TIMESTAMPTZ,
    business_outcome_notes TEXT,

    -- User/stakeholder satisfaction
    user_satisfaction_score INTEGER CHECK (user_satisfaction_score >= 1 AND user_satisfaction_score <= 10),
    stakeholder_feedback TEXT,

    -- Technical outcome metrics
    production_issues_count INTEGER DEFAULT 0,
    performance_meets_requirements BOOLEAN,
    security_issues_found INTEGER DEFAULT 0,
    accessibility_compliance BOOLEAN,

    -- Business metrics (where applicable)
    usage_adoption_rate DECIMAL, -- % of intended users who actually use the feature
    business_kpi_impact DECIMAL, -- Impact on relevant business KPIs
    roi_achieved DECIMAL, -- ROI vs. projected ROI

    -- Pattern tags for learning
    project_tags TEXT[], -- e.g., ['dashboard', 'analytics', 'user-facing', 'real-time']
    complexity_factors TEXT[], -- What made it complex: ['authentication', 'performance', 'integrations']
    success_factors TEXT[], -- What made it succeed: ['good-requirements', 'stakeholder-engagement', 'iterative-design']
    failure_factors TEXT[], -- What caused issues: ['scope-creep', 'technical-debt', 'unclear-requirements']

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(sd_id) -- One learning record per SD
);

-- 2. Create intelligence_patterns table for storing learned patterns and predictions
CREATE TABLE IF NOT EXISTS intelligence_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Pattern identification
    pattern_type TEXT NOT NULL CHECK (pattern_type IN ('PROJECT_TYPE', 'TECHNICAL_STACK', 'BUSINESS_DOMAIN', 'COMPLEXITY_FACTOR', 'TEAM_SKILL', 'TIMELINE_PRESSURE')),
    pattern_value TEXT NOT NULL, -- The actual pattern (e.g., 'dashboard', 'authentication', 'real-time')
    pattern_description TEXT,

    -- Pattern statistics
    total_occurrences INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    success_rate DECIMAL GENERATED ALWAYS AS (
        CASE WHEN total_occurrences > 0 THEN
            ROUND((success_count::DECIMAL / total_occurrences::DECIMAL) * 100, 2)
        ELSE 0 END
    ) STORED,

    -- Predictive insights
    lead_prediction_accuracy DECIMAL, -- How often LEAD's assessment matched final outcome
    plan_prediction_accuracy DECIMAL, -- How often PLAN's complexity estimate matched reality
    exec_quality_correlation DECIMAL, -- How well EXEC quality scores predict business success

    -- Common outcomes for this pattern
    typical_lead_decision TEXT,
    typical_plan_complexity INTEGER,
    typical_exec_quality INTEGER,
    typical_business_outcome TEXT,

    -- Learned recommendations
    recommended_lead_adjustments JSONB, -- Adjustments LEAD should make for this pattern
    recommended_plan_adjustments JSONB, -- Adjustments PLAN should make
    recommended_exec_adjustments JSONB, -- Adjustments EXEC should make

    -- Risk factors
    common_failure_modes TEXT[],
    early_warning_signals TEXT[],
    risk_mitigation_strategies TEXT[],

    -- Pattern metadata
    confidence_level TEXT CHECK (confidence_level IN ('HIGH', 'MEDIUM', 'LOW')) DEFAULT 'LOW',
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    pattern_strength DECIMAL, -- Statistical significance of the pattern

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(pattern_type, pattern_value)
);

-- 3. Create agent_intelligence_insights table for storing specific learned behaviors
CREATE TABLE IF NOT EXISTS agent_intelligence_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    agent_type TEXT NOT NULL CHECK (agent_type IN ('LEAD', 'PLAN', 'EXEC')),
    insight_type TEXT NOT NULL CHECK (insight_type IN ('DECISION_ADJUSTMENT', 'RISK_FACTOR', 'SUCCESS_PATTERN', 'FAILURE_PATTERN', 'CROSS_AGENT_CORRELATION')),

    -- The learned insight
    insight_title TEXT NOT NULL,
    insight_description TEXT NOT NULL,
    insight_details JSONB,

    -- Conditions when this insight applies
    trigger_conditions JSONB, -- When should this insight be activated
    confidence_threshold INTEGER DEFAULT 70, -- Minimum confidence to apply this insight

    -- Impact metrics
    times_applied INTEGER DEFAULT 0,
    positive_outcomes INTEGER DEFAULT 0,
    negative_outcomes INTEGER DEFAULT 0,
    effectiveness_rate DECIMAL GENERATED ALWAYS AS (
        CASE WHEN times_applied > 0 THEN
            ROUND((positive_outcomes::DECIMAL / times_applied::DECIMAL) * 100, 2)
        ELSE 0 END
    ) STORED,

    -- Learning source
    source_pattern_ids UUID[], -- Which patterns contributed to this insight
    source_outcomes INTEGER, -- Number of outcomes that led to this insight
    statistical_significance DECIMAL,

    -- Status
    is_active BOOLEAN DEFAULT true,
    last_applied TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create cross_agent_correlations table for tracking how agent decisions affect each other
CREATE TABLE IF NOT EXISTS cross_agent_correlations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Correlation definition
    correlation_name TEXT NOT NULL,
    agent_a TEXT NOT NULL CHECK (agent_a IN ('LEAD', 'PLAN', 'EXEC')),
    agent_b TEXT NOT NULL CHECK (agent_b IN ('LEAD', 'PLAN', 'EXEC')),

    -- Correlation pattern
    agent_a_condition TEXT, -- e.g., "decision = 'APPROVE' AND confidence > 85"
    agent_b_outcome TEXT, -- e.g., "complexity_score <= 5 AND technical_feasibility = 'HIGH'"

    -- Correlation strength
    correlation_coefficient DECIMAL, -- -1 to 1, strength of correlation
    sample_size INTEGER,
    statistical_confidence DECIMAL,

    -- Actionable insights
    prediction_accuracy DECIMAL,
    recommendation TEXT, -- What should agents do based on this correlation

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_learning_outcomes_sd_id ON agent_learning_outcomes(sd_id);
CREATE INDEX IF NOT EXISTS idx_learning_outcomes_business_outcome ON agent_learning_outcomes(business_outcome);
CREATE INDEX IF NOT EXISTS idx_learning_outcomes_lead_decision ON agent_learning_outcomes(lead_decision);
CREATE INDEX IF NOT EXISTS idx_learning_outcomes_plan_decision ON agent_learning_outcomes(plan_decision);
CREATE INDEX IF NOT EXISTS idx_learning_outcomes_project_tags ON agent_learning_outcomes USING GIN(project_tags);
CREATE INDEX IF NOT EXISTS idx_learning_outcomes_dates ON agent_learning_outcomes(lead_decision_date, plan_decision_date, exec_completion_date);

CREATE INDEX IF NOT EXISTS idx_intelligence_patterns_type_value ON intelligence_patterns(pattern_type, pattern_value);
CREATE INDEX IF NOT EXISTS idx_intelligence_patterns_success_rate ON intelligence_patterns(success_rate);
CREATE INDEX IF NOT EXISTS idx_intelligence_patterns_confidence ON intelligence_patterns(confidence_level);

CREATE INDEX IF NOT EXISTS idx_agent_insights_agent_type ON agent_intelligence_insights(agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_insights_insight_type ON agent_intelligence_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_agent_insights_active ON agent_intelligence_insights(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_agent_insights_effectiveness ON agent_intelligence_insights(effectiveness_rate);

-- 6. Create functions for pattern analysis and learning

-- Function to calculate pattern statistics
CREATE OR REPLACE FUNCTION update_pattern_statistics(p_pattern_type TEXT, p_pattern_value TEXT)
RETURNS VOID AS $$
DECLARE
    pattern_stats RECORD;
BEGIN
    -- Calculate pattern statistics from learning outcomes
    SELECT
        COUNT(*) as total_count,
        COUNT(CASE WHEN business_outcome = 'SUCCESS' THEN 1 END) as success_count,
        COUNT(CASE WHEN business_outcome IN ('FAILURE', 'CANCELLED') THEN 1 END) as failure_count,
        AVG(CASE WHEN lead_confidence IS NOT NULL THEN lead_confidence END) as avg_lead_confidence,
        AVG(CASE WHEN plan_complexity_score IS NOT NULL THEN plan_complexity_score END) as avg_plan_complexity,
        AVG(CASE WHEN exec_final_quality_score IS NOT NULL THEN exec_final_quality_score END) as avg_exec_quality,
        MODE() WITHIN GROUP (ORDER BY lead_decision) as typical_lead_decision,
        MODE() WITHIN GROUP (ORDER BY business_outcome) as typical_outcome
    FROM agent_learning_outcomes
    WHERE p_pattern_value = ANY(project_tags) OR p_pattern_value = ANY(complexity_factors);

    -- Update or insert pattern
    INSERT INTO intelligence_patterns (
        pattern_type, pattern_value, total_occurrences, success_count, failure_count,
        typical_lead_decision, typical_plan_complexity, typical_exec_quality, typical_business_outcome,
        confidence_level, last_updated
    ) VALUES (
        p_pattern_type, p_pattern_value, pattern_stats.total_count, pattern_stats.success_count, pattern_stats.failure_count,
        pattern_stats.typical_lead_decision, ROUND(pattern_stats.avg_plan_complexity), ROUND(pattern_stats.avg_exec_quality), pattern_stats.typical_outcome,
        CASE
            WHEN pattern_stats.total_count >= 10 THEN 'HIGH'
            WHEN pattern_stats.total_count >= 5 THEN 'MEDIUM'
            ELSE 'LOW'
        END,
        NOW()
    )
    ON CONFLICT (pattern_type, pattern_value) DO UPDATE SET
        total_occurrences = EXCLUDED.total_occurrences,
        success_count = EXCLUDED.success_count,
        failure_count = EXCLUDED.failure_count,
        typical_lead_decision = EXCLUDED.typical_lead_decision,
        typical_plan_complexity = EXCLUDED.typical_plan_complexity,
        typical_exec_quality = EXCLUDED.typical_exec_quality,
        typical_business_outcome = EXCLUDED.typical_business_outcome,
        confidence_level = EXCLUDED.confidence_level,
        last_updated = NOW(),
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to get intelligence recommendations for an agent
CREATE OR REPLACE FUNCTION get_agent_intelligence(p_agent_type TEXT, p_context JSONB)
RETURNS TABLE (
    insight_title TEXT,
    insight_description TEXT,
    confidence_level TEXT,
    recommended_action TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ai.insight_title,
        ai.insight_description,
        CASE
            WHEN ai.effectiveness_rate >= 80 THEN 'HIGH'
            WHEN ai.effectiveness_rate >= 60 THEN 'MEDIUM'
            ELSE 'LOW'
        END as confidence_level,
        ai.insight_details->>'recommended_action' as recommended_action
    FROM agent_intelligence_insights ai
    WHERE ai.agent_type = p_agent_type
    AND ai.is_active = true
    AND ai.effectiveness_rate >= 50 -- Only return insights that work at least half the time
    ORDER BY ai.effectiveness_rate DESC, ai.times_applied DESC
    LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- Function to record agent learning outcome
CREATE OR REPLACE FUNCTION record_agent_outcome(
    p_sd_id TEXT,
    p_agent_type TEXT,
    p_decision_data JSONB,
    p_outcome_data JSONB DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    IF p_agent_type = 'LEAD' THEN
        INSERT INTO agent_learning_outcomes (
            sd_id, lead_decision, lead_confidence, lead_reasoning, lead_decision_date
        ) VALUES (
            p_sd_id,
            p_decision_data->>'decision',
            (p_decision_data->>'confidence')::INTEGER,
            p_decision_data->>'reasoning',
            NOW()
        )
        ON CONFLICT (sd_id) DO UPDATE SET
            lead_decision = EXCLUDED.lead_decision,
            lead_confidence = EXCLUDED.lead_confidence,
            lead_reasoning = EXCLUDED.lead_reasoning,
            lead_decision_date = EXCLUDED.lead_decision_date,
            updated_at = NOW();

    ELSIF p_agent_type = 'PLAN' THEN
        UPDATE agent_learning_outcomes SET
            plan_decision = p_decision_data->>'decision',
            plan_complexity_score = (p_decision_data->>'complexity_score')::INTEGER,
            plan_technical_feasibility = p_decision_data->>'technical_feasibility',
            plan_implementation_risk = p_decision_data->>'implementation_risk',
            plan_decision_date = NOW(),
            updated_at = NOW()
        WHERE sd_id = p_sd_id;

    ELSIF p_agent_type = 'EXEC' THEN
        UPDATE agent_learning_outcomes SET
            exec_final_quality_score = (p_decision_data->>'quality_score')::INTEGER,
            exec_implementation_type = p_decision_data->>'implementation_type',
            exec_actual_complexity = (p_decision_data->>'actual_complexity')::INTEGER,
            exec_completion_date = NOW(),
            updated_at = NOW()
        WHERE sd_id = p_sd_id;
    END IF;

    -- If outcome data provided, update business outcome
    IF p_outcome_data IS NOT NULL THEN
        UPDATE agent_learning_outcomes SET
            business_outcome = p_outcome_data->>'outcome',
            business_outcome_notes = p_outcome_data->>'notes',
            user_satisfaction_score = (p_outcome_data->>'user_satisfaction')::INTEGER,
            business_outcome_date = NOW(),
            updated_at = NOW()
        WHERE sd_id = p_sd_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 7. Create view for intelligence dashboard
CREATE OR REPLACE VIEW v_intelligence_dashboard AS
SELECT
    'Pattern Analysis' as metric_type,
    ip.pattern_value as metric_name,
    ip.success_rate as score,
    ip.total_occurrences as sample_size,
    ip.confidence_level as confidence,
    ARRAY_TO_STRING(ip.common_failure_modes, ', ') as notes
FROM intelligence_patterns ip
WHERE ip.total_occurrences >= 3

UNION ALL

SELECT
    'Agent Insight' as metric_type,
    ai.insight_title as metric_name,
    ai.effectiveness_rate as score,
    ai.times_applied as sample_size,
    CASE
        WHEN ai.effectiveness_rate >= 80 THEN 'HIGH'
        WHEN ai.effectiveness_rate >= 60 THEN 'MEDIUM'
        ELSE 'LOW'
    END as confidence,
    ai.insight_description as notes
FROM agent_intelligence_insights ai
WHERE ai.is_active = true AND ai.times_applied >= 2

ORDER BY score DESC;

-- 8. Add RLS policies
ALTER TABLE agent_learning_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_intelligence_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE cross_agent_correlations ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read intelligence data
CREATE POLICY intelligence_outcomes_select ON agent_learning_outcomes FOR SELECT TO authenticated USING (true);
CREATE POLICY intelligence_patterns_select ON intelligence_patterns FOR SELECT TO authenticated USING (true);
CREATE POLICY intelligence_insights_select ON agent_intelligence_insights FOR SELECT TO authenticated USING (true);
CREATE POLICY intelligence_correlations_select ON cross_agent_correlations FOR SELECT TO authenticated USING (true);

-- Allow service role to manage intelligence data
CREATE POLICY intelligence_outcomes_all ON agent_learning_outcomes FOR ALL TO service_role USING (true);
CREATE POLICY intelligence_patterns_all ON intelligence_patterns FOR ALL TO service_role USING (true);
CREATE POLICY intelligence_insights_all ON agent_intelligence_insights FOR ALL TO service_role USING (true);
CREATE POLICY intelligence_correlations_all ON cross_agent_correlations FOR ALL TO service_role USING (true);

-- 9. Add comments for documentation
COMMENT ON TABLE agent_learning_outcomes IS 'Tracks the complete workflow chain from LEAD decision through PLAN validation to EXEC implementation and final business outcomes';
COMMENT ON TABLE intelligence_patterns IS 'Stores learned patterns about project types, complexity factors, and their typical outcomes';
COMMENT ON TABLE agent_intelligence_insights IS 'Contains specific learned behaviors and adjustments that agents should make based on historical data';
COMMENT ON TABLE cross_agent_correlations IS 'Tracks how decisions by one agent correlate with outcomes in other agents';

COMMENT ON FUNCTION update_pattern_statistics IS 'Analyzes learning outcomes to update pattern statistics and success rates';
COMMENT ON FUNCTION get_agent_intelligence IS 'Returns relevant intelligence insights for an agent based on current context';
COMMENT ON FUNCTION record_agent_outcome IS 'Records agent decisions and outcomes for learning purposes';

COMMENT ON VIEW v_intelligence_dashboard IS 'Dashboard view showing intelligence patterns and agent insights with effectiveness metrics';