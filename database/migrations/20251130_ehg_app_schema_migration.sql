-- EHG Application Schema Migration
-- SD-ARCH-EHG-006: Complete Database Consolidation
-- This script creates all necessary tables from the EHG Venture app in the consolidated database

-- ============================================
-- PHASE 1: CREATE ENUM TYPES
-- ============================================

-- Venture stage enum
DO $$ BEGIN
    CREATE TYPE venture_stage_enum AS ENUM (
        'draft_idea','ai_review','validation','competitive_analysis',
        'profitability_forecast','risk_evaluation','planning',
        'problem_decomposition','gap_analysis','technical_review',
        'strategic_naming','adaptive_naming','exit_design',
        'development_prep','pricing_strategy','documentation_sync',
        'integration_verification','context_loading','preflight_check',
        'iterative_development','feedback_loops','mvp_iteration',
        'quality_assurance','security_compliance','optimization',
        'final_polish','production_deployment','mvp_launch',
        'customer_success','post_mvp_expansion','gtm_timing',
        'parallel_exploration','strategic_risk','timing_optimization',
        'multi_venture_coordination','exit_sequencing','venture_active'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE stage_category_enum AS ENUM ('ideation','validation','planning','development','launch','growth','exit');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE workflow_status_enum AS ENUM ('pending','in_progress','paused','completed','failed','skipped','blocked');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE risk_level_enum AS ENUM ('very_low','low','medium','high','critical');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE agent_type_enum AS ENUM ('EVA','LEAD','PLAN','EXEC','AI_CEO','GTM_STRATEGIST','MVP_ENGINE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE processing_status_enum AS ENUM ('pending','processing','completed','failed','timeout','cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE orchestration_event_enum AS ENUM ('stage_started','stage_completed','stage_failed','workflow_started','workflow_completed','agent_assigned');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE analysis_type_enum AS ENUM ('swot','market_size','competitive','financial','risk','technical_feasibility','product_market_fit');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE venture_status_enum AS ENUM ('active','paused','completed','cancelled','archived');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- PHASE 2: CREATE CORE TABLES
-- ============================================

-- Companies table (core)
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    logo_url TEXT,
    website TEXT,
    industry VARCHAR(100),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Portfolios table (depends on companies)
CREATE TABLE IF NOT EXISTS portfolios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    company_id UUID REFERENCES companies(id),
    total_value DECIMAL(15,2),
    total_ventures INTEGER DEFAULT 0,
    active_ventures INTEGER DEFAULT 0,
    target_roi DECIMAL(5,2),
    actual_roi DECIMAL(5,2),
    risk_level VARCHAR(20) CHECK (risk_level IN ('very_low','low','medium','high','critical')),
    investment_thesis TEXT,
    focus_industries TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ventures table (core - depends on companies, portfolios)
CREATE TABLE IF NOT EXISTS ventures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    stage venture_stage_enum NOT NULL DEFAULT 'draft_idea',
    status venture_status_enum NOT NULL DEFAULT 'active',
    portfolio_id UUID REFERENCES portfolios(id),
    company_id UUID REFERENCES companies(id),
    industry VARCHAR(100),
    target_market TEXT,
    business_model TEXT,
    value_proposition TEXT,
    projected_revenue DECIMAL(15,2),
    projected_roi DECIMAL(5,2),
    funding_required DECIMAL(15,2),
    current_workflow_stage INTEGER DEFAULT 1,
    workflow_status workflow_status_enum DEFAULT 'pending',
    ai_score DECIMAL(3,2),
    validation_score DECIMAL(3,2),
    risk_score risk_level_enum,
    metadata JSONB DEFAULT '{}',
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- Additional columns discovered in source data
    milestone VARCHAR(100),
    current_stage INTEGER,
    attention_score DECIMAL(3,2),
    dwell_days INTEGER DEFAULT 0,
    gate_retries_7d INTEGER DEFAULT 0,
    gate_pass_rate_30d DECIMAL(5,2),
    milestone_velocity_30d DECIMAL(5,2),
    esg_blackout_flag BOOLEAN DEFAULT FALSE,
    is_demo BOOLEAN DEFAULT FALSE,
    tier INTEGER DEFAULT 1,
    source_blueprint_id UUID,
    workflow_started_at TIMESTAMPTZ,
    workflow_completed_at TIMESTAMPTZ,
    recursion_state JSONB DEFAULT '{}',
    vision_alignment TEXT,
    strategic_focus TEXT,
    voice_title_url TEXT,
    voice_description_url TEXT,
    unification_version VARCHAR(50) DEFAULT 'legacy',
    category VARCHAR(100),
    problem_statement TEXT,
    solution_approach TEXT,
    unique_value_proposition TEXT,
    strategic_context JSONB DEFAULT '{}',
    tags TEXT[] DEFAULT '{}'
);

-- User company access for multi-company support
CREATE TABLE IF NOT EXISTS user_company_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    company_id UUID NOT NULL REFERENCES companies(id),
    access_level VARCHAR(50) DEFAULT 'viewer',
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    granted_by UUID REFERENCES auth.users(id),
    UNIQUE(user_id, company_id)
);

-- ============================================
-- PHASE 3: CREATE SUPPORTING TABLES
-- ============================================

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    email TEXT,
    full_name TEXT,
    avatar_url TEXT,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- LLM Providers
CREATE TABLE IF NOT EXISTS llm_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(255),
    api_base_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- LLM Models
CREATE TABLE IF NOT EXISTS llm_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID REFERENCES llm_providers(id),
    name VARCHAR(100) NOT NULL,
    display_name VARCHAR(255),
    model_type VARCHAR(50), -- 'chat', 'completion', 'embedding'
    max_tokens INTEGER,
    cost_per_1k_input DECIMAL(10,6),
    cost_per_1k_output DECIMAL(10,6),
    is_active BOOLEAN DEFAULT TRUE,
    capabilities JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(provider_id, name)
);

-- Market Segments
CREATE TABLE IF NOT EXISTS market_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    market_size DECIMAL(15,2),
    growth_rate DECIMAL(5,2),
    competition_level VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Content Types
CREATE TABLE IF NOT EXISTS content_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    schema JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Screen Layouts
CREATE TABLE IF NOT EXISTS screen_layouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    layout_config JSONB DEFAULT '{}',
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prompt Templates
CREATE TABLE IF NOT EXISTS prompt_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    template TEXT NOT NULL,
    variables JSONB DEFAULT '[]',
    category VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Venture Drafts
CREATE TABLE IF NOT EXISTS venture_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    name VARCHAR(255),
    description TEXT,
    draft_data JSONB DEFAULT '{}',
    research_results JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Venture Documents
CREATE TABLE IF NOT EXISTS venture_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,
    document_type VARCHAR(100),
    title VARCHAR(255),
    content TEXT,
    file_url TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PHASE 4: CREATE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_ventures_company ON ventures(company_id);
CREATE INDEX IF NOT EXISTS idx_ventures_portfolio ON ventures(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_ventures_stage ON ventures(stage);
CREATE INDEX IF NOT EXISTS idx_ventures_status ON ventures(status);
CREATE INDEX IF NOT EXISTS idx_ventures_created_by ON ventures(created_by);
CREATE INDEX IF NOT EXISTS idx_portfolios_company ON portfolios(company_id);
CREATE INDEX IF NOT EXISTS idx_venture_documents_venture ON venture_documents(venture_id);

-- ============================================
-- PHASE 5: ENABLE RLS
-- ============================================

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventures ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_company_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE screen_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE venture_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE venture_documents ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PHASE 6: CREATE RLS POLICIES
-- ============================================

-- Drop existing policies first (in case of re-run)
DROP POLICY IF EXISTS "Users can see their own company access" ON user_company_access;
DROP POLICY IF EXISTS "Company access ventures" ON ventures;
DROP POLICY IF EXISTS "Company access portfolios" ON portfolios;
DROP POLICY IF EXISTS "Company access companies" ON companies;
DROP POLICY IF EXISTS "Anon read companies" ON companies;
DROP POLICY IF EXISTS "Anon read ventures" ON ventures;
DROP POLICY IF EXISTS "Anon read portfolios" ON portfolios;

-- Company access policies
CREATE POLICY "Users can see their own company access" ON user_company_access FOR ALL USING (
    user_id = auth.uid()
);

CREATE POLICY "Company access ventures" ON ventures FOR ALL USING (
    company_id IN (SELECT company_id FROM user_company_access WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid())
);

CREATE POLICY "Company access portfolios" ON portfolios FOR ALL USING (
    company_id IN (SELECT company_id FROM user_company_access WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid())
);

CREATE POLICY "Company access companies" ON companies FOR ALL USING (
    id IN (SELECT company_id FROM user_company_access WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid())
);

-- Anonymous read access for public data
CREATE POLICY "Anon read companies" ON companies FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read ventures" ON ventures FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read portfolios" ON portfolios FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read llm_providers" ON llm_providers FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read llm_models" ON llm_models FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read market_segments" ON market_segments FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read content_types" ON content_types FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read screen_layouts" ON screen_layouts FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read prompt_templates" ON prompt_templates FOR SELECT TO anon USING (true);

-- User profiles
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (id = auth.uid());

-- Venture drafts (user owns their drafts)
CREATE POLICY "Users own venture drafts" ON venture_drafts FOR ALL USING (user_id = auth.uid());

-- Venture documents
CREATE POLICY "Company access venture_documents" ON venture_documents FOR ALL USING (
    venture_id IN (
        SELECT v.id FROM ventures v
        WHERE v.company_id IN (
            SELECT company_id FROM user_company_access WHERE user_id = auth.uid()
        )
    )
    OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid())
);

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
SELECT 'EHG App schema migration completed successfully' AS status;
