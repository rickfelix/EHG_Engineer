-- Learning Schema Migration for Invisible Sub-Agent System
-- Run this in Supabase SQL Editor

-- Table: user_context_patterns
CREATE TABLE IF NOT EXISTS public.user_context_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_hash VARCHAR(64) NOT NULL UNIQUE,
    user_id VARCHAR(100),
    prompt_keywords JSONB NOT NULL DEFAULT '[]',
    file_patterns JSONB NOT NULL DEFAULT '[]',
    git_patterns JSONB NOT NULL DEFAULT '[]',
    project_patterns JSONB NOT NULL DEFAULT '[]',
    selected_agents JSONB NOT NULL DEFAULT '[]',
    coordination_strategy VARCHAR(50),
    frequency_count INTEGER NOT NULL DEFAULT 1,
    success_rate DECIMAL(3,2) NOT NULL DEFAULT 1.0,
    avg_confidence DECIMAL(3,2) NOT NULL DEFAULT 0.0,
    avg_execution_time INTEGER NOT NULL DEFAULT 0,
    user_feedback_score INTEGER,
    implicit_satisfaction DECIMAL(3,2),
    rejection_count INTEGER NOT NULL DEFAULT 0,
    first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_successful TIMESTAMPTZ,
    confidence_threshold DECIMAL(3,2),
    priority_weights JSONB
);

-- Table: interaction_history
CREATE TABLE IF NOT EXISTS public.interaction_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(100),
    session_id VARCHAR(100),
    interaction_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    prompt_text TEXT,
    prompt_hash VARCHAR(64) NOT NULL,
    prompt_length INTEGER NOT NULL DEFAULT 0,
    prompt_complexity DECIMAL(3,2) NOT NULL DEFAULT 0.0,
    file_context JSONB,
    git_context JSONB,
    error_context JSONB,
    project_context JSONB,
    analysis_method VARCHAR(50) NOT NULL,
    selected_agents JSONB NOT NULL DEFAULT '[]',
    total_agents_considered INTEGER NOT NULL DEFAULT 0,
    selection_confidence DECIMAL(3,2),
    selection_reasoning TEXT,
    agents_executed INTEGER NOT NULL DEFAULT 0,
    execution_time_ms INTEGER,
    success_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    enhancement_applied BOOLEAN NOT NULL DEFAULT false,
    enhancement_style VARCHAR(50),
    enhancement_length INTEGER,
    pattern_matched VARCHAR(64),
    threshold_adjustments JSONB,
    new_pattern_created BOOLEAN NOT NULL DEFAULT false,
    total_processing_time INTEGER,
    cache_hit BOOLEAN NOT NULL DEFAULT false
);

-- Table: agent_performance_metrics
CREATE TABLE IF NOT EXISTS public.agent_performance_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_code VARCHAR(50) NOT NULL,
    agent_version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
    measurement_date DATE NOT NULL DEFAULT CURRENT_DATE,
    measurement_window VARCHAR(20) NOT NULL DEFAULT 'daily',
    total_executions INTEGER NOT NULL DEFAULT 0,
    successful_executions INTEGER NOT NULL DEFAULT 0,
    failed_executions INTEGER NOT NULL DEFAULT 0,
    avg_execution_time DECIMAL(8,2) NOT NULL DEFAULT 0.0,
    max_execution_time INTEGER NOT NULL DEFAULT 0,
    times_selected INTEGER NOT NULL DEFAULT 0,
    avg_selection_confidence DECIMAL(3,2) NOT NULL DEFAULT 0.0,
    confidence_distribution JSONB,
    positive_feedback INTEGER NOT NULL DEFAULT 0,
    negative_feedback INTEGER NOT NULL DEFAULT 0,
    user_dismissals INTEGER NOT NULL DEFAULT 0,
    top_trigger_patterns JSONB,
    context_effectiveness JSONB,
    works_well_with JSONB,
    coordination_success_rate DECIMAL(3,2),
    recommended_min_confidence DECIMAL(3,2),
    recommended_max_agents INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(agent_code, measurement_date, measurement_window)
);

-- Table: learning_configurations
CREATE TABLE IF NOT EXISTS public.learning_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_scope VARCHAR(50) NOT NULL,
    scope_id VARCHAR(100),
    auto_threshold DECIMAL(3,2) NOT NULL DEFAULT 0.8,
    prompt_threshold DECIMAL(3,2) NOT NULL DEFAULT 0.6,
    max_agents INTEGER NOT NULL DEFAULT 3,
    confidence_boost DECIMAL(3,2) NOT NULL DEFAULT 0.0,
    agent_weights JSONB,
    context_multipliers JSONB,
    learning_rate DECIMAL(4,3) NOT NULL DEFAULT 0.1,
    adaptation_window INTEGER NOT NULL DEFAULT 50,
    min_interactions_for_learning INTEGER NOT NULL DEFAULT 10,
    target_success_rate DECIMAL(3,2) NOT NULL DEFAULT 0.85,
    target_response_time INTEGER NOT NULL DEFAULT 3000,
    target_user_satisfaction DECIMAL(3,2) NOT NULL DEFAULT 0.8,
    total_adaptations INTEGER NOT NULL DEFAULT 0,
    last_adaptation TIMESTAMPTZ,
    adaptation_direction VARCHAR(20),
    current_success_rate DECIMAL(3,2),
    current_avg_response_time INTEGER,
    current_user_satisfaction DECIMAL(3,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(config_scope, scope_id)
);

-- Table: feedback_events
CREATE TABLE IF NOT EXISTS public.feedback_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interaction_id UUID REFERENCES public.interaction_history(id) ON DELETE CASCADE,
    user_id VARCHAR(100),
    event_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    feedback_type VARCHAR(50) NOT NULL,
    feedback_source VARCHAR(50) NOT NULL,
    feedback_value DECIMAL(3,2),
    feedback_category VARCHAR(50),
    specific_agent VARCHAR(50),
    user_action VARCHAR(100),
    time_to_action INTEGER,
    triggered_adaptation BOOLEAN NOT NULL DEFAULT false,
    adaptation_type VARCHAR(50),
    confidence_before DECIMAL(3,2),
    confidence_after DECIMAL(3,2),
    feedback_metadata JSONB
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_pattern_hash ON public.user_context_patterns(pattern_hash);
CREATE INDEX IF NOT EXISTS idx_user_patterns ON public.user_context_patterns(user_id, success_rate DESC);
CREATE INDEX IF NOT EXISTS idx_pattern_frequency ON public.user_context_patterns(frequency_count DESC, success_rate DESC);

CREATE INDEX IF NOT EXISTS idx_interaction_timestamp ON public.interaction_history(interaction_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_user_interactions ON public.interaction_history(user_id, interaction_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_success_analysis ON public.interaction_history(success_count, analysis_method, interaction_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_agent_performance ON public.agent_performance_metrics(agent_code, measurement_date DESC);
CREATE INDEX IF NOT EXISTS idx_agent_success_rate ON public.agent_performance_metrics(successful_executions DESC, total_executions DESC);

CREATE INDEX IF NOT EXISTS idx_config_scope ON public.learning_configurations(config_scope, scope_id);

CREATE INDEX IF NOT EXISTS idx_feedback_timestamp ON public.feedback_events(event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_user_feedback ON public.feedback_events(user_id, event_timestamp DESC);

-- Insert initial global configuration
INSERT INTO public.learning_configurations (config_scope, auto_threshold, prompt_threshold, max_agents)
VALUES ('global', 0.8, 0.6, 3)
ON CONFLICT (config_scope, scope_id) DO NOTHING;

-- Enable Row Level Security (optional)
ALTER TABLE public.user_context_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interaction_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_events ENABLE ROW LEVEL SECURITY;