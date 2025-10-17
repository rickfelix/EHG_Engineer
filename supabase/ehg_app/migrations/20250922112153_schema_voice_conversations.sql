-- OpenAI Realtime Voice Conversations Schema
-- Part of SD-2025-001 Implementation
-- Created: 2025-09-01

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Conversations table
CREATE TABLE IF NOT EXISTS voice_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    total_tokens INTEGER,
    input_tokens INTEGER,
    output_tokens INTEGER,
    cost_cents INTEGER,
    summary TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Usage metrics table for detailed tracking
CREATE TABLE IF NOT EXISTS voice_usage_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES voice_conversations(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    input_tokens INTEGER,
    output_tokens INTEGER,
    audio_duration_ms INTEGER,
    function_calls INTEGER,
    latency_ms INTEGER,
    event_type TEXT, -- 'turn_start', 'turn_end', 'function_call', etc.
    metadata JSONB DEFAULT '{}'
);

-- Cached responses for cost optimization
CREATE TABLE IF NOT EXISTS voice_cached_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query_hash TEXT UNIQUE NOT NULL,
    query_text TEXT,
    response_text TEXT,
    response_audio_base64 TEXT,
    embedding vector(1536), -- For semantic similarity matching
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '7 days',
    hit_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Function call logs for audit trail
CREATE TABLE IF NOT EXISTS voice_function_calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES voice_conversations(id) ON DELETE CASCADE,
    function_name TEXT NOT NULL,
    arguments JSONB,
    result JSONB,
    execution_time_ms INTEGER,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    called_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_conversations_user_id ON voice_conversations(user_id);
CREATE INDEX idx_conversations_session_id ON voice_conversations(session_id);
CREATE INDEX idx_conversations_started_at ON voice_conversations(started_at DESC);
CREATE INDEX idx_metrics_conversation_id ON voice_usage_metrics(conversation_id);
CREATE INDEX idx_metrics_timestamp ON voice_usage_metrics(timestamp DESC);
CREATE INDEX idx_cached_responses_hash ON voice_cached_responses(query_hash);
CREATE INDEX idx_cached_responses_expires ON voice_cached_responses(expires_at);
CREATE INDEX idx_function_calls_conversation ON voice_function_calls(conversation_id);
CREATE INDEX idx_function_calls_name ON voice_function_calls(function_name);

-- Row Level Security (RLS) Policies
ALTER TABLE voice_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_usage_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_cached_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_function_calls ENABLE ROW LEVEL SECURITY;

-- Users can only see their own conversations
CREATE POLICY "Users can view own conversations" ON voice_conversations
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own conversations" ON voice_conversations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations" ON voice_conversations
    FOR UPDATE USING (auth.uid() = user_id);

-- Metrics are viewable by conversation owner
CREATE POLICY "Users can view own metrics" ON voice_usage_metrics
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM voice_conversations 
            WHERE voice_conversations.id = voice_usage_metrics.conversation_id 
            AND voice_conversations.user_id = auth.uid()
        )
    );

-- Cached responses are public read (for efficiency)
CREATE POLICY "Public read cached responses" ON voice_cached_responses
    FOR SELECT USING (true);

-- Only service role can write cached responses
CREATE POLICY "Service role writes cached responses" ON voice_cached_responses
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Function calls viewable by conversation owner
CREATE POLICY "Users can view own function calls" ON voice_function_calls
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM voice_conversations 
            WHERE voice_conversations.id = voice_function_calls.conversation_id 
            AND voice_conversations.user_id = auth.uid()
        )
    );

-- Create functions for analytics
CREATE OR REPLACE FUNCTION get_voice_usage_stats(p_user_id UUID, p_period INTERVAL DEFAULT INTERVAL '30 days')
RETURNS TABLE (
    total_conversations INTEGER,
    total_duration_seconds INTEGER,
    total_tokens INTEGER,
    total_cost_cents INTEGER,
    avg_latency_ms NUMERIC,
    total_function_calls INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(DISTINCT c.id)::INTEGER as total_conversations,
        SUM(c.duration_seconds)::INTEGER as total_duration_seconds,
        SUM(c.total_tokens)::INTEGER as total_tokens,
        SUM(c.cost_cents)::INTEGER as total_cost_cents,
        AVG(m.latency_ms)::NUMERIC as avg_latency_ms,
        COUNT(DISTINCT f.id)::INTEGER as total_function_calls
    FROM voice_conversations c
    LEFT JOIN voice_usage_metrics m ON c.id = m.conversation_id
    LEFT JOIN voice_function_calls f ON c.id = f.conversation_id
    WHERE c.user_id = p_user_id
    AND c.started_at >= NOW() - p_period;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update conversation summary
CREATE OR REPLACE FUNCTION update_conversation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_voice_conversations_updated_at
    BEFORE UPDATE ON voice_conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_updated_at();

-- Grant permissions
GRANT ALL ON voice_conversations TO authenticated;
GRANT ALL ON voice_usage_metrics TO authenticated;
GRANT SELECT ON voice_cached_responses TO authenticated;
GRANT ALL ON voice_function_calls TO authenticated;
GRANT EXECUTE ON FUNCTION get_voice_usage_stats TO authenticated;