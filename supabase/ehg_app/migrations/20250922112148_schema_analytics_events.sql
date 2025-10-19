-- ==========================================
-- Analytics Events Migration
-- Stage 60 - Onboarding & Quick Start
-- ==========================================

-- Analytics Events Table (Time-series optimized)
CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Event identification
    event_type VARCHAR(100) NOT NULL,
    event_category VARCHAR(50) DEFAULT 'onboarding',
    
    -- User context
    user_id UUID,
    session_id VARCHAR(100),
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    
    -- Event data
    properties JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    
    -- Context
    user_agent TEXT,
    ip_address INET,
    referrer TEXT,
    url TEXT,
    
    -- Timing
    event_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    server_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Processing
    processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMP WITH TIME ZONE,
    
    -- Partitioning helper (for time-based partitioning)
    event_date DATE GENERATED ALWAYS AS (event_timestamp::date) STORED,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Event Sequences Table (for funnel analysis)
CREATE TABLE IF NOT EXISTS event_sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Sequence identification
    sequence_type VARCHAR(100) NOT NULL, -- 'onboarding_funnel', 'user_journey', etc.
    user_id UUID NOT NULL,
    session_id VARCHAR(100) NOT NULL,
    
    -- Sequence data
    events JSONB NOT NULL, -- ordered array of events
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Analysis
    total_events INTEGER NOT NULL DEFAULT 0,
    completion_rate DECIMAL(5,2), -- percentage
    drop_off_point VARCHAR(100),
    total_duration_seconds INTEGER,
    
    -- Metadata
    sequence_version VARCHAR(20) DEFAULT '1.0',
    properties JSONB DEFAULT '{}',
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CHECK (total_events >= 0),
    CHECK (completion_rate IS NULL OR (completion_rate >= 0 AND completion_rate <= 100)),
    CHECK (total_duration_seconds IS NULL OR total_duration_seconds >= 0)
);

-- Event Aggregations Table (for performance)
CREATE TABLE IF NOT EXISTS event_aggregations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Aggregation scope
    aggregation_type VARCHAR(100) NOT NULL, -- 'daily', 'weekly', 'monthly'
    event_type VARCHAR(100) NOT NULL,
    date_bucket DATE NOT NULL,
    
    -- Dimensions
    user_role VARCHAR(50),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    
    -- Metrics
    event_count INTEGER NOT NULL DEFAULT 0,
    unique_users INTEGER NOT NULL DEFAULT 0,
    unique_sessions INTEGER NOT NULL DEFAULT 0,
    
    -- Timing metrics
    avg_duration_seconds DECIMAL(10,2),
    median_duration_seconds DECIMAL(10,2),
    p95_duration_seconds DECIMAL(10,2),
    
    -- Success metrics
    success_count INTEGER DEFAULT 0,
    success_rate DECIMAL(5,2),
    
    -- Additional metrics
    properties JSONB DEFAULT '{}',
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(aggregation_type, event_type, date_bucket, user_role, company_id),
    CHECK (event_count >= 0),
    CHECK (unique_users >= 0),
    CHECK (unique_sessions >= 0),
    CHECK (success_rate IS NULL OR (success_rate >= 0 AND success_rate <= 100))
);

-- ==========================================
-- Indexes for Performance (Time-series optimized)
-- ==========================================

-- Analytics events indexes
CREATE INDEX IF NOT EXISTS idx_analytics_events_timestamp ON analytics_events(event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session ON analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_date ON analytics_events(event_date);
CREATE INDEX IF NOT EXISTS idx_analytics_events_processed ON analytics_events(processed);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_type_time ON analytics_events(user_id, event_type, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session_time ON analytics_events(session_id, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_company_time ON analytics_events(company_id, event_timestamp DESC);

-- Event sequences indexes
CREATE INDEX IF NOT EXISTS idx_event_sequences_user ON event_sequences(user_id);
CREATE INDEX IF NOT EXISTS idx_event_sequences_session ON event_sequences(session_id);
CREATE INDEX IF NOT EXISTS idx_event_sequences_type ON event_sequences(sequence_type);
CREATE INDEX IF NOT EXISTS idx_event_sequences_started ON event_sequences(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_sequences_completion ON event_sequences(completion_rate);

-- Event aggregations indexes
CREATE INDEX IF NOT EXISTS idx_event_aggregations_date ON event_aggregations(date_bucket DESC);
CREATE INDEX IF NOT EXISTS idx_event_aggregations_type ON event_aggregations(event_type);
CREATE INDEX IF NOT EXISTS idx_event_aggregations_company ON event_aggregations(company_id);
CREATE INDEX IF NOT EXISTS idx_event_aggregations_role ON event_aggregations(user_role);

-- ==========================================
-- Row Level Security Policies
-- ==========================================

-- Enable RLS
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_aggregations ENABLE ROW LEVEL SECURITY;

-- Analytics events policies
CREATE POLICY "Users can view their own events" ON analytics_events
    FOR SELECT 
    USING (user_id = auth.uid());

-- Service role can insert events (for API)
CREATE POLICY "Service can insert analytics events" ON analytics_events
    FOR INSERT 
    WITH CHECK (true);

-- Company access for aggregated analytics
CREATE POLICY "Company access analytics_events" ON analytics_events
    FOR SELECT 
    USING (company_id IN (
        SELECT company_id FROM user_company_access 
        WHERE user_id = auth.uid()
    ));

-- Event sequences policies
CREATE POLICY "Users can view their own sequences" ON event_sequences
    FOR SELECT 
    USING (user_id = auth.uid());

CREATE POLICY "Service can manage sequences" ON event_sequences
    FOR ALL 
    WITH CHECK (true);

-- Event aggregations policies (company-scoped)
CREATE POLICY "Company access event_aggregations" ON event_aggregations
    FOR SELECT 
    USING (company_id IN (
        SELECT company_id FROM user_company_access 
        WHERE user_id = auth.uid()
    ));

CREATE POLICY "Service can manage aggregations" ON event_aggregations
    FOR ALL 
    WITH CHECK (true);

-- ==========================================
-- Triggers
-- ==========================================

CREATE TRIGGER update_event_sequences_updated_at 
    BEFORE UPDATE ON event_sequences 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_event_aggregations_updated_at 
    BEFORE UPDATE ON event_aggregations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- Functions for Analytics Processing
-- ==========================================

-- Function to aggregate events daily
CREATE OR REPLACE FUNCTION aggregate_daily_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO event_aggregations (
        aggregation_type,
        event_type,
        date_bucket,
        user_role,
        company_id,
        event_count,
        unique_users,
        unique_sessions
    )
    SELECT 
        'daily',
        event_type,
        event_date,
        properties->>'role' as user_role,
        company_id,
        COUNT(*) as event_count,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT session_id) as unique_sessions
    FROM analytics_events
    WHERE event_date = CURRENT_DATE - INTERVAL '1 day'
        AND processed = false
    GROUP BY event_type, event_date, properties->>'role', company_id
    ON CONFLICT (aggregation_type, event_type, date_bucket, user_role, company_id)
    DO UPDATE SET
        event_count = EXCLUDED.event_count,
        unique_users = EXCLUDED.unique_users,
        unique_sessions = EXCLUDED.unique_sessions,
        updated_at = NOW();

    -- Mark events as processed
    UPDATE analytics_events 
    SET processed = true, processed_at = NOW()
    WHERE event_date = CURRENT_DATE - INTERVAL '1 day'
        AND processed = false;
END;
$$;