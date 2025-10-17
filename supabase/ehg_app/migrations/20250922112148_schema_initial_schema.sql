-- ==========================================
-- Initial Schema Migration - Stage 56
-- Database Schema & Data Contracts
-- ==========================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================
-- Core Entities Schema
-- ==========================================

-- Companies (Root Entity)
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    industry VARCHAR(100),
    founded_date DATE,
    headquarters_location VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Company Access (RBAC)
CREATE TABLE IF NOT EXISTS user_company_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'viewer',
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    granted_by UUID,
    UNIQUE(user_id, company_id)
);

-- Ventures (Core Business Entity)
CREATE TABLE IF NOT EXISTS ventures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'draft',
    current_stage INTEGER DEFAULT 1,
    stage_progress JSONB DEFAULT '{}',
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ideas (Stage 1 Entity)
CREATE TABLE IF NOT EXISTS ideas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    market_opportunity TEXT,
    target_audience TEXT,
    competitive_advantage TEXT,
    revenue_model TEXT,
    initial_investment_required DECIMAL(15,2),
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- AI Feedback Intelligence Schema
-- ==========================================

-- Customer feedback processing and sentiment analysis
CREATE TABLE IF NOT EXISTS feedback_intelligence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL,
    
    -- Core feedback data
    feedback_text TEXT NOT NULL,
    feedback_source VARCHAR(50) NOT NULL, -- 'email', 'survey', 'support', 'social'
    
    -- AI analysis results
    sentiment_score DECIMAL(3,2) NOT NULL CHECK (sentiment_score >= -1.00 AND sentiment_score <= 1.00),
    emotion_primary VARCHAR(20), -- 'joy', 'anger', 'sadness', 'fear', 'surprise', 'trust'
    emotion_intensity DECIMAL(3,2) CHECK (emotion_intensity >= 0.00 AND emotion_intensity <= 1.00),
    intent_classification VARCHAR(50), -- 'complaint', 'praise', 'question', 'request'
    
    -- Priority and urgency scoring
    priority_score INTEGER CHECK (priority_score >= 0 AND priority_score <= 100),
    urgency_level VARCHAR(10) CHECK (urgency_level IN ('low', 'medium', 'high', 'critical')),
    
    -- Churn prediction
    churn_risk_score DECIMAL(3,2) CHECK (churn_risk_score >= 0.00 AND churn_risk_score <= 1.00),
    churn_indicators JSONB DEFAULT '{}',
    
    -- Processing metadata
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processing_confidence DECIMAL(3,2) CHECK (processing_confidence >= 0.00 AND processing_confidence <= 1.00),
    ai_model_version VARCHAR(20),
    
    -- Tracking and audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Feedback trends and aggregations
CREATE TABLE IF NOT EXISTS feedback_trends (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
    
    -- Time period
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),
    
    -- Aggregated metrics
    total_feedback_count INTEGER NOT NULL DEFAULT 0,
    average_sentiment DECIMAL(3,2) CHECK (average_sentiment >= -1.00 AND average_sentiment <= 1.00),
    sentiment_distribution JSONB DEFAULT '{}',
    priority_distribution JSONB DEFAULT '{}',
    
    -- Churn insights
    high_churn_risk_count INTEGER DEFAULT 0,
    churn_risk_trend VARCHAR(10) CHECK (churn_risk_trend IN ('improving', 'stable', 'declining')),
    
    -- Key insights
    top_issues JSONB DEFAULT '[]',
    satisfaction_score DECIMAL(3,2) CHECK (satisfaction_score >= 0.00 AND satisfaction_score <= 1.00),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Customer sentiment history for individual tracking
CREATE TABLE IF NOT EXISTS customer_sentiment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL,
    venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
    
    -- Sentiment tracking
    sentiment_score DECIMAL(3,2) NOT NULL CHECK (sentiment_score >= -1.00 AND sentiment_score <= 1.00),
    sentiment_change DECIMAL(3,2),
    measurement_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Context
    trigger_event VARCHAR(100),
    feedback_intelligence_id UUID REFERENCES feedback_intelligence(id) ON DELETE SET NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- Indexes for Performance
-- ==========================================

-- Company indexes
CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);
CREATE INDEX IF NOT EXISTS idx_companies_industry ON companies(industry);

-- User access indexes
CREATE INDEX IF NOT EXISTS idx_user_company_access_user ON user_company_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_company_access_company ON user_company_access(company_id);
CREATE INDEX IF NOT EXISTS idx_user_company_access_role ON user_company_access(role);

-- Venture indexes
CREATE INDEX IF NOT EXISTS idx_ventures_company ON ventures(company_id);
CREATE INDEX IF NOT EXISTS idx_ventures_status ON ventures(status);
CREATE INDEX IF NOT EXISTS idx_ventures_current_stage ON ventures(current_stage);
CREATE INDEX IF NOT EXISTS idx_ventures_created_by ON ventures(created_by);

-- Idea indexes
CREATE INDEX IF NOT EXISTS idx_ideas_venture ON ideas(venture_id);
CREATE INDEX IF NOT EXISTS idx_ideas_company ON ideas(company_id);
CREATE INDEX IF NOT EXISTS idx_ideas_created_by ON ideas(created_by);

-- Feedback intelligence indexes
CREATE INDEX IF NOT EXISTS idx_feedback_intelligence_venture ON feedback_intelligence(venture_id);
CREATE INDEX IF NOT EXISTS idx_feedback_intelligence_customer ON feedback_intelligence(customer_id);
CREATE INDEX IF NOT EXISTS idx_feedback_intelligence_sentiment ON feedback_intelligence(sentiment_score);
CREATE INDEX IF NOT EXISTS idx_feedback_intelligence_churn_risk ON feedback_intelligence(churn_risk_score);
CREATE INDEX IF NOT EXISTS idx_feedback_intelligence_created_at ON feedback_intelligence(created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_intelligence_source ON feedback_intelligence(feedback_source);

-- Feedback trends indexes
CREATE INDEX IF NOT EXISTS idx_feedback_trends_venture_period ON feedback_trends(venture_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_feedback_trends_period_type ON feedback_trends(period_type);

-- Customer sentiment history indexes
CREATE INDEX IF NOT EXISTS idx_customer_sentiment_customer ON customer_sentiment_history(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_sentiment_venture ON customer_sentiment_history(venture_id);
CREATE INDEX IF NOT EXISTS idx_customer_sentiment_measurement_date ON customer_sentiment_history(measurement_date);

-- ==========================================
-- Row Level Security Policies
-- ==========================================

-- Enable RLS on all tables
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_company_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventures ENABLE ROW LEVEL SECURITY;
ALTER TABLE ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_trends ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_sentiment_history ENABLE ROW LEVEL SECURITY;

-- Company access policies
CREATE POLICY "Company access companies" ON companies
    FOR ALL 
    USING (id IN (
        SELECT company_id FROM user_company_access 
        WHERE user_id = auth.uid()
    ));

-- User company access policies
CREATE POLICY "Users can view their own access" ON user_company_access
    FOR SELECT 
    USING (user_id = auth.uid());

CREATE POLICY "Company admins can manage access" ON user_company_access
    FOR ALL 
    USING (company_id IN (
        SELECT company_id FROM user_company_access 
        WHERE user_id = auth.uid() AND role IN ('admin', 'owner')
    ));

-- Venture access policies
CREATE POLICY "Company access ventures" ON ventures
    FOR ALL 
    USING (company_id IN (
        SELECT company_id FROM user_company_access 
        WHERE user_id = auth.uid()
    ));

-- Ideas access policies  
CREATE POLICY "Company access ideas" ON ideas
    FOR ALL 
    USING (company_id IN (
        SELECT company_id FROM user_company_access 
        WHERE user_id = auth.uid()
    ));

-- Feedback intelligence access policies
CREATE POLICY "Company access feedback_intelligence" ON feedback_intelligence
    FOR ALL 
    USING (venture_id IN (
        SELECT v.id FROM ventures v 
        WHERE v.company_id IN (
            SELECT company_id FROM user_company_access 
            WHERE user_id = auth.uid()
        )
    ));

-- Feedback trends access policies
CREATE POLICY "Company access feedback_trends" ON feedback_trends
    FOR ALL 
    USING (venture_id IN (
        SELECT v.id FROM ventures v 
        WHERE v.company_id IN (
            SELECT company_id FROM user_company_access 
            WHERE user_id = auth.uid()
        )
    ));

-- Customer sentiment history access policies
CREATE POLICY "Company access customer_sentiment_history" ON customer_sentiment_history
    FOR ALL 
    USING (venture_id IN (
        SELECT v.id FROM ventures v 
        WHERE v.company_id IN (
            SELECT company_id FROM user_company_access 
            WHERE user_id = auth.uid()
        )
    ));

-- ==========================================
-- Triggers for Updated At
-- ==========================================

-- Create or replace the trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to tables with updated_at columns
CREATE TRIGGER update_companies_updated_at 
    BEFORE UPDATE ON companies 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ventures_updated_at 
    BEFORE UPDATE ON ventures 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ideas_updated_at 
    BEFORE UPDATE ON ideas 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_feedback_intelligence_updated_at 
    BEFORE UPDATE ON feedback_intelligence 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();