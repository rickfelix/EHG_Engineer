-- Context Learning & Adaptation Schema
-- Supports machine learning capabilities for the invisible sub-agent system
-- Tracks user patterns, preferences, and system performance for continuous improvement

-- Table: user_context_patterns
-- Stores learned patterns of user behavior and preferences
CREATE TABLE IF NOT EXISTS user_context_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Pattern Identification
    pattern_hash VARCHAR(64) NOT NULL UNIQUE,
    user_id VARCHAR(100), -- Optional user identification
    
    -- Context Pattern Data
    prompt_keywords JSONB NOT NULL DEFAULT '[]', -- Extracted keywords from prompts
    file_patterns JSONB NOT NULL DEFAULT '[]',   -- File types/names that trigger this pattern
    git_patterns JSONB NOT NULL DEFAULT '[]',    -- Git context patterns (branch names, commit types)
    project_patterns JSONB NOT NULL DEFAULT '[]', -- Project characteristics
    
    -- Agent Selection Pattern
    selected_agents JSONB NOT NULL DEFAULT '[]', -- Array of {agent_code, confidence, priority}
    coordination_strategy VARCHAR(50),            -- sequential, parallel, hybrid
    
    -- Pattern Performance Metrics
    frequency_count INTEGER NOT NULL DEFAULT 1,
    success_rate DECIMAL(3,2) NOT NULL DEFAULT 1.0,
    avg_confidence DECIMAL(3,2) NOT NULL DEFAULT 0.0,
    avg_execution_time INTEGER NOT NULL DEFAULT 0, -- milliseconds
    
    -- User Satisfaction Metrics
    user_feedback_score INTEGER, -- 1-5 rating when available
    implicit_satisfaction DECIMAL(3,2), -- Derived from user behavior
    rejection_count INTEGER NOT NULL DEFAULT 0, -- Times user dismissed suggestions
    
    -- Temporal Data
    first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_successful TIMESTAMPTZ,
    
    -- Pattern Metadata
    confidence_threshold DECIMAL(3,2), -- Learned threshold for this pattern
    priority_weights JSONB, -- Learned priority weights for different agents
    
    -- Indexes
    INDEX idx_pattern_hash (pattern_hash),
    INDEX idx_user_patterns (user_id, success_rate DESC),
    INDEX idx_pattern_frequency (frequency_count DESC, success_rate DESC),
    INDEX idx_pattern_last_seen (last_seen DESC)
);

-- Table: interaction_history
-- Detailed history of all context monitoring interactions
CREATE TABLE IF NOT EXISTS interaction_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Interaction Context
    user_id VARCHAR(100),
    session_id VARCHAR(100),
    interaction_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Input Analysis
    prompt_text TEXT, -- Hashed or truncated for privacy
    prompt_hash VARCHAR(64) NOT NULL,
    prompt_length INTEGER NOT NULL DEFAULT 0,
    prompt_complexity DECIMAL(3,2) NOT NULL DEFAULT 0.0,
    
    -- Context Data
    file_context JSONB, -- Current files, project type, etc.
    git_context JSONB,  -- Branch, recent changes, etc.
    error_context JSONB, -- Recent errors, build status, etc.
    project_context JSONB, -- Framework, languages, etc.
    
    -- Agent Selection Results
    analysis_method VARCHAR(50) NOT NULL, -- ai_powered, rule_based
    selected_agents JSONB NOT NULL DEFAULT '[]',
    total_agents_considered INTEGER NOT NULL DEFAULT 0,
    selection_confidence DECIMAL(3,2),
    selection_reasoning TEXT,
    
    -- Execution Results
    agents_executed INTEGER NOT NULL DEFAULT 0,
    execution_time_ms INTEGER,
    success_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    
    -- Enhancement Results
    enhancement_applied BOOLEAN NOT NULL DEFAULT false,
    enhancement_style VARCHAR(50), -- seamless, sectioned, minimal
    enhancement_length INTEGER,
    
    -- Learning Outcomes
    pattern_matched VARCHAR(64), -- Reference to user_context_patterns.pattern_hash
    threshold_adjustments JSONB, -- Any threshold changes made
    new_pattern_created BOOLEAN NOT NULL DEFAULT false,
    
    -- Performance Metrics
    total_processing_time INTEGER, -- End-to-end time
    cache_hit BOOLEAN NOT NULL DEFAULT false,
    
    -- Indexes
    INDEX idx_interaction_timestamp (interaction_timestamp DESC),
    INDEX idx_user_interactions (user_id, interaction_timestamp DESC),
    INDEX idx_pattern_interactions (pattern_matched, interaction_timestamp DESC),
    INDEX idx_success_analysis (success_count, analysis_method, interaction_timestamp DESC)
);

-- Table: agent_performance_metrics
-- Tracks individual agent performance for optimization
CREATE TABLE IF NOT EXISTS agent_performance_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Agent Identification
    agent_code VARCHAR(50) NOT NULL,
    agent_version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
    
    -- Performance Window
    measurement_date DATE NOT NULL DEFAULT CURRENT_DATE,
    measurement_window VARCHAR(20) NOT NULL DEFAULT 'daily', -- daily, weekly, monthly
    
    -- Execution Metrics
    total_executions INTEGER NOT NULL DEFAULT 0,
    successful_executions INTEGER NOT NULL DEFAULT 0,
    failed_executions INTEGER NOT NULL DEFAULT 0,
    avg_execution_time DECIMAL(8,2) NOT NULL DEFAULT 0.0,
    max_execution_time INTEGER NOT NULL DEFAULT 0,
    
    -- Selection Metrics
    times_selected INTEGER NOT NULL DEFAULT 0,
    avg_selection_confidence DECIMAL(3,2) NOT NULL DEFAULT 0.0,
    confidence_distribution JSONB, -- Histogram of confidence levels
    
    -- User Feedback
    positive_feedback INTEGER NOT NULL DEFAULT 0,
    negative_feedback INTEGER NOT NULL DEFAULT 0,
    user_dismissals INTEGER NOT NULL DEFAULT 0, -- Times user ignored suggestions
    
    -- Trigger Pattern Analysis
    top_trigger_patterns JSONB, -- Most common patterns that trigger this agent
    context_effectiveness JSONB, -- Which contexts this agent performs best in
    
    -- Coordination Metrics
    works_well_with JSONB, -- Other agents that complement this one
    coordination_success_rate DECIMAL(3,2), -- Success when used with other agents
    
    -- Adaptive Thresholds
    recommended_min_confidence DECIMAL(3,2), -- Learned minimum confidence
    recommended_max_agents INTEGER, -- Recommended max agents when this is selected
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints and Indexes
    UNIQUE(agent_code, measurement_date, measurement_window),
    INDEX idx_agent_performance (agent_code, measurement_date DESC),
    INDEX idx_agent_success_rate (successful_executions DESC, total_executions DESC),
    INDEX idx_coordination_success (coordination_success_rate DESC)
);

-- Table: learning_configurations
-- Stores adaptive configuration parameters that evolve over time
CREATE TABLE IF NOT EXISTS learning_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Configuration Scope
    config_scope VARCHAR(50) NOT NULL, -- global, user, project, agent
    scope_id VARCHAR(100), -- user_id, project_id, agent_code, or null for global
    
    -- Configuration Parameters
    auto_threshold DECIMAL(3,2) NOT NULL DEFAULT 0.8,
    prompt_threshold DECIMAL(3,2) NOT NULL DEFAULT 0.6,
    max_agents INTEGER NOT NULL DEFAULT 3,
    confidence_boost DECIMAL(3,2) NOT NULL DEFAULT 0.0, -- Learned bias adjustment
    
    -- Agent-Specific Weights
    agent_weights JSONB, -- Learned weights for different agents
    context_multipliers JSONB, -- Context-specific confidence multipliers
    
    -- Adaptation Parameters
    learning_rate DECIMAL(4,3) NOT NULL DEFAULT 0.1,
    adaptation_window INTEGER NOT NULL DEFAULT 50, -- Number of interactions to consider
    min_interactions_for_learning INTEGER NOT NULL DEFAULT 10,
    
    -- Performance Targets
    target_success_rate DECIMAL(3,2) NOT NULL DEFAULT 0.85,
    target_response_time INTEGER NOT NULL DEFAULT 3000, -- milliseconds
    target_user_satisfaction DECIMAL(3,2) NOT NULL DEFAULT 0.8,
    
    -- Learning State
    total_adaptations INTEGER NOT NULL DEFAULT 0,
    last_adaptation TIMESTAMPTZ,
    adaptation_direction VARCHAR(20), -- increasing, decreasing, stable
    
    -- Validation Metrics
    current_success_rate DECIMAL(3,2),
    current_avg_response_time INTEGER,
    current_user_satisfaction DECIMAL(3,2),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints and Indexes
    UNIQUE(config_scope, scope_id),
    INDEX idx_config_scope (config_scope, scope_id),
    INDEX idx_learning_performance (current_success_rate DESC, current_user_satisfaction DESC)
);

-- Table: feedback_events
-- Captures explicit and implicit user feedback for learning
CREATE TABLE IF NOT EXISTS feedback_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Event Context
    interaction_id UUID REFERENCES interaction_history(id) ON DELETE CASCADE,
    user_id VARCHAR(100),
    event_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Feedback Type and Source
    feedback_type VARCHAR(50) NOT NULL, -- explicit, implicit, system
    feedback_source VARCHAR(50) NOT NULL, -- user_rating, dismissal, usage_pattern, error
    
    -- Feedback Data
    feedback_value DECIMAL(3,2), -- Normalized 0.0-1.0 score
    feedback_category VARCHAR(50), -- agent_selection, execution, enhancement
    specific_agent VARCHAR(50), -- Which agent the feedback relates to
    
    -- Contextual Information
    user_action VARCHAR(100), -- dismissed, accepted, modified, ignored
    time_to_action INTEGER, -- How long until user provided feedback
    
    -- Learning Impact
    triggered_adaptation BOOLEAN NOT NULL DEFAULT false,
    adaptation_type VARCHAR(50), -- threshold_change, weight_adjustment, pattern_update
    confidence_before DECIMAL(3,2),
    confidence_after DECIMAL(3,2),
    
    -- Metadata
    feedback_metadata JSONB, -- Additional context-specific data
    
    -- Indexes
    INDEX idx_feedback_timestamp (event_timestamp DESC),
    INDEX idx_feedback_type (feedback_type, feedback_source),
    INDEX idx_user_feedback (user_id, event_timestamp DESC),
    INDEX idx_agent_feedback (specific_agent, feedback_value DESC, event_timestamp DESC)
);

-- Table: context_embeddings
-- Stores vector embeddings of contexts for similarity matching (future ML enhancement)
CREATE TABLE IF NOT EXISTS context_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Context Identification
    context_hash VARCHAR(64) NOT NULL UNIQUE,
    interaction_id UUID REFERENCES interaction_history(id) ON DELETE CASCADE,
    
    -- Embedding Data
    embedding_vector VECTOR(384), -- OpenAI embedding dimension (adjust as needed)
    embedding_model VARCHAR(100) NOT NULL DEFAULT 'text-embedding-ada-002',
    
    -- Context Metadata
    context_type VARCHAR(50) NOT NULL, -- prompt, file, git, error, project
    context_summary TEXT,
    
    -- Associated Patterns
    successful_agents JSONB, -- Agents that worked well with this context
    context_complexity DECIMAL(3,2),
    
    -- Performance Data
    similarity_matches INTEGER NOT NULL DEFAULT 0, -- Times this was matched
    avg_match_success DECIMAL(3,2), -- Success rate when matched
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_matched TIMESTAMPTZ,
    
    -- Indexes for vector similarity search
    INDEX idx_context_embeddings_vector (embedding_vector) USING ivfflat,
    INDEX idx_context_hash (context_hash),
    INDEX idx_embedding_performance (avg_match_success DESC, similarity_matches DESC)
);

-- Views for Learning Analytics

-- View: agent_effectiveness_summary
CREATE OR REPLACE VIEW agent_effectiveness_summary AS
SELECT 
    agent_code,
    COUNT(*) as total_selections,
    AVG(selection_confidence) as avg_confidence,
    AVG(CASE WHEN success_count > 0 THEN 1.0 ELSE 0.0 END) as success_rate,
    AVG(execution_time_ms) as avg_execution_time,
    COUNT(DISTINCT pattern_matched) as unique_patterns_triggered
FROM interaction_history 
WHERE selected_agents @> jsonb_build_array(jsonb_build_object('agent_code', agent_code))
GROUP BY agent_code
ORDER BY success_rate DESC, avg_confidence DESC;

-- View: learning_progress_summary
CREATE OR REPLACE VIEW learning_progress_summary AS
SELECT 
    config_scope,
    scope_id,
    current_success_rate,
    target_success_rate,
    current_success_rate - target_success_rate as success_gap,
    total_adaptations,
    adaptation_direction,
    last_adaptation,
    EXTRACT(DAYS FROM NOW() - last_adaptation) as days_since_adaptation
FROM learning_configurations
ORDER BY current_success_rate DESC;

-- Triggers for automatic updates
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_agent_performance_metrics_modtime 
    BEFORE UPDATE ON agent_performance_metrics 
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_learning_configurations_modtime 
    BEFORE UPDATE ON learning_configurations 
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- Initial configuration data
INSERT INTO learning_configurations (config_scope, auto_threshold, prompt_threshold, max_agents) 
VALUES ('global', 0.8, 0.6, 3)
ON CONFLICT (config_scope, scope_id) DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE user_context_patterns IS 'Learned patterns of user behavior and context for intelligent agent selection';
COMMENT ON TABLE interaction_history IS 'Complete history of context monitoring interactions for analysis and learning';
COMMENT ON TABLE agent_performance_metrics IS 'Performance tracking for individual agents to optimize selection';
COMMENT ON TABLE learning_configurations IS 'Adaptive configuration parameters that evolve based on performance';
COMMENT ON TABLE feedback_events IS 'User feedback events for continuous learning and improvement';
COMMENT ON TABLE context_embeddings IS 'Vector embeddings for semantic similarity matching of contexts';

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_interaction_success_patterns ON interaction_history(success_count, pattern_matched, interaction_timestamp);
CREATE INDEX IF NOT EXISTS idx_pattern_success_rate ON user_context_patterns(success_rate DESC, frequency_count DESC);
CREATE INDEX IF NOT EXISTS idx_recent_interactions ON interaction_history(interaction_timestamp DESC) WHERE interaction_timestamp > (NOW() - INTERVAL '30 days');