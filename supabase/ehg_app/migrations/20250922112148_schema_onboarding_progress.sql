-- ==========================================
-- Onboarding Progress Migration
-- Stage 60 - Onboarding & Quick Start
-- ==========================================

-- Onboarding Progress Table
CREATE TABLE IF NOT EXISTS onboarding_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    
    -- Progress tracking
    role VARCHAR(50) NOT NULL CHECK (role IN ('chairman', 'executive', 'manager', 'analyst')),
    started BOOLEAN NOT NULL DEFAULT false,
    completed BOOLEAN NOT NULL DEFAULT false,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    current_step VARCHAR(100),
    
    -- Step completion tracking
    steps JSONB NOT NULL DEFAULT '{}',
    
    -- Metadata
    onboarding_version VARCHAR(20) NOT NULL DEFAULT '1.0',
    total_steps INTEGER NOT NULL DEFAULT 0,
    completed_steps INTEGER NOT NULL DEFAULT 0,
    estimated_time_remaining INTEGER DEFAULT 0, -- in minutes
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Analytics
    completion_time_seconds INTEGER, -- time to complete onboarding
    drop_off_point VARCHAR(100), -- where user dropped off if incomplete
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(user_id, company_id),
    CHECK (started_at IS NULL OR completed_at IS NULL OR completed_at >= started_at),
    CHECK (completed_steps <= total_steps),
    CHECK (estimated_time_remaining >= 0)
);

-- Onboarding Steps Detail Table
CREATE TABLE IF NOT EXISTS onboarding_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    progress_id UUID NOT NULL REFERENCES onboarding_progress(id) ON DELETE CASCADE,
    
    -- Step identification
    step_id VARCHAR(100) NOT NULL,
    step_name VARCHAR(255) NOT NULL,
    step_category VARCHAR(100) NOT NULL,
    step_order INTEGER NOT NULL,
    
    -- Status
    completed BOOLEAN NOT NULL DEFAULT false,
    skipped BOOLEAN NOT NULL DEFAULT false,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    estimated_time_minutes INTEGER DEFAULT 0,
    actual_time_seconds INTEGER, -- actual time taken
    attempts INTEGER DEFAULT 0,
    
    -- Context
    completion_context JSONB DEFAULT '{}', -- how step was completed
    error_details JSONB DEFAULT '{}', -- any errors encountered
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(progress_id, step_id),
    CHECK (started_at IS NULL OR completed_at IS NULL OR completed_at >= started_at),
    CHECK (attempts >= 0),
    CHECK (actual_time_seconds IS NULL OR actual_time_seconds >= 0)
);

-- User Preferences Table (onboarding-related)
CREATE TABLE IF NOT EXISTS onboarding_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    
    -- Preferences
    skip_tour BOOLEAN DEFAULT false,
    preferred_role VARCHAR(50),
    show_tips BOOLEAN DEFAULT true,
    auto_advance BOOLEAN DEFAULT false,
    
    -- Customization
    preferred_pace VARCHAR(20) DEFAULT 'normal' CHECK (preferred_pace IN ('slow', 'normal', 'fast')),
    notification_frequency VARCHAR(20) DEFAULT 'normal' CHECK (notification_frequency IN ('minimal', 'normal', 'frequent')),
    
    -- Feature flags
    beta_features BOOLEAN DEFAULT false,
    advanced_features BOOLEAN DEFAULT false,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ==========================================
-- Indexes for Performance
-- ==========================================

-- Onboarding progress indexes
CREATE INDEX IF NOT EXISTS idx_onboarding_progress_user ON onboarding_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_progress_company ON onboarding_progress(company_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_progress_role ON onboarding_progress(role);
CREATE INDEX IF NOT EXISTS idx_onboarding_progress_completed ON onboarding_progress(completed);
CREATE INDEX IF NOT EXISTS idx_onboarding_progress_last_activity ON onboarding_progress(last_activity);

-- Onboarding steps indexes
CREATE INDEX IF NOT EXISTS idx_onboarding_steps_progress ON onboarding_steps(progress_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_steps_step_id ON onboarding_steps(step_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_steps_completed ON onboarding_steps(completed);
CREATE INDEX IF NOT EXISTS idx_onboarding_steps_order ON onboarding_steps(step_order);

-- Preferences indexes
CREATE INDEX IF NOT EXISTS idx_onboarding_preferences_user ON onboarding_preferences(user_id);

-- ==========================================
-- Row Level Security Policies
-- ==========================================

-- Enable RLS
ALTER TABLE onboarding_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_preferences ENABLE ROW LEVEL SECURITY;

-- Onboarding progress policies
CREATE POLICY "Users can view their own onboarding progress" ON onboarding_progress
    FOR SELECT 
    USING (user_id = auth.uid());

CREATE POLICY "Users can update their own onboarding progress" ON onboarding_progress
    FOR UPDATE 
    USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own onboarding progress" ON onboarding_progress
    FOR INSERT 
    WITH CHECK (user_id = auth.uid());

-- Company access for onboarding progress
CREATE POLICY "Company access onboarding_progress" ON onboarding_progress
    FOR ALL 
    USING (company_id IN (
        SELECT company_id FROM user_company_access 
        WHERE user_id = auth.uid()
    ));

-- Onboarding steps policies
CREATE POLICY "Users can manage their onboarding steps" ON onboarding_steps
    FOR ALL 
    USING (progress_id IN (
        SELECT id FROM onboarding_progress 
        WHERE user_id = auth.uid()
    ));

-- Onboarding preferences policies
CREATE POLICY "Users can manage their onboarding preferences" ON onboarding_preferences
    FOR ALL 
    USING (user_id = auth.uid());

-- ==========================================
-- Triggers for Updated At
-- ==========================================

CREATE TRIGGER update_onboarding_progress_updated_at 
    BEFORE UPDATE ON onboarding_progress 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_onboarding_steps_updated_at 
    BEFORE UPDATE ON onboarding_steps 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_onboarding_preferences_updated_at 
    BEFORE UPDATE ON onboarding_preferences 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();