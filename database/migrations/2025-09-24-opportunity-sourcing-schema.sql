-- ============================================
-- Opportunity Sourcing Schema
-- Strategic Directive: SD-1A
-- PRD: PRD-SD-1A-2025-09-24
-- Created: 2025-09-24
-- ============================================

-- Drop existing tables if they exist (for clean migration)
DROP TABLE IF EXISTS opportunity_scores CASCADE;
DROP TABLE IF EXISTS opportunity_categories CASCADE;
DROP TABLE IF EXISTS opportunity_sources CASCADE;
DROP TABLE IF EXISTS opportunities CASCADE;

-- ============================================
-- 1. Opportunity Sources Table
-- ============================================
CREATE TABLE opportunity_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type VARCHAR(50) NOT NULL CHECK (source_type IN (
        'manual_entry',
        'web_scraping',
        'email_parsing',
        'api_integration',
        'bulk_import',
        'linkedin',
        'company_website',
        'referral'
    )),
    source_name VARCHAR(255) NOT NULL,
    source_url TEXT,
    configuration JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 2. Opportunities Table (Core)
-- ============================================
CREATE TABLE opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Basic Information
    title VARCHAR(500) NOT NULL,
    description TEXT,
    company_name VARCHAR(255),
    contact_name VARCHAR(255),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),

    -- Source Tracking
    source_id UUID REFERENCES opportunity_sources(id) ON DELETE SET NULL,
    source_reference VARCHAR(500), -- External ID or URL from source

    -- Opportunity Details
    opportunity_type VARCHAR(100) CHECK (opportunity_type IN (
        'new_business',
        'expansion',
        'renewal',
        'partnership',
        'investment',
        'other'
    )),
    status VARCHAR(50) DEFAULT 'new' CHECK (status IN (
        'new',
        'qualified',
        'in_progress',
        'proposal_sent',
        'negotiation',
        'won',
        'lost',
        'on_hold'
    )),

    -- Value and Scoring
    estimated_value DECIMAL(15, 2),
    currency VARCHAR(3) DEFAULT 'USD',
    probability_percent INTEGER CHECK (probability_percent >= 0 AND probability_percent <= 100),
    weighted_value DECIMAL(15, 2) GENERATED ALWAYS AS (estimated_value * probability_percent / 100.0) STORED,

    -- Dates
    identified_date DATE DEFAULT CURRENT_DATE,
    expected_close_date DATE,
    actual_close_date DATE,

    -- Assignment and Tracking
    assigned_to VARCHAR(255),
    tags TEXT[],

    -- Duplicate Detection
    duplicate_check_hash VARCHAR(64), -- SHA256 hash for duplicate detection
    is_duplicate BOOLEAN DEFAULT false,
    master_opportunity_id UUID REFERENCES opportunities(id) ON DELETE SET NULL,

    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255),

    -- Constraints
    CONSTRAINT valid_dates CHECK (
        actual_close_date IS NULL OR actual_close_date >= identified_date
    ),
    CONSTRAINT valid_probability CHECK (
        probability_percent IS NULL OR (probability_percent >= 0 AND probability_percent <= 100)
    )
);

-- ============================================
-- 3. Opportunity Categories Table
-- ============================================
CREATE TABLE opportunity_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    category_name VARCHAR(100) NOT NULL,
    category_value VARCHAR(255),
    confidence_score DECIMAL(3, 2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
    assigned_by VARCHAR(50) DEFAULT 'system', -- 'system' or 'user'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(opportunity_id, category_name)
);

-- ============================================
-- 4. Opportunity Scores Table
-- ============================================
CREATE TABLE opportunity_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,

    -- Different scoring dimensions
    quality_score DECIMAL(3, 2) CHECK (quality_score >= 0 AND quality_score <= 1),
    urgency_score DECIMAL(3, 2) CHECK (urgency_score >= 0 AND urgency_score <= 1),
    fit_score DECIMAL(3, 2) CHECK (fit_score >= 0 AND fit_score <= 1),
    engagement_score DECIMAL(3, 2) CHECK (engagement_score >= 0 AND engagement_score <= 1),

    -- Composite score
    total_score DECIMAL(3, 2) GENERATED ALWAYS AS (
        (COALESCE(quality_score, 0) + COALESCE(urgency_score, 0) +
         COALESCE(fit_score, 0) + COALESCE(engagement_score, 0)) /
        NULLIF(
            (CASE WHEN quality_score IS NOT NULL THEN 1 ELSE 0 END +
             CASE WHEN urgency_score IS NOT NULL THEN 1 ELSE 0 END +
             CASE WHEN fit_score IS NOT NULL THEN 1 ELSE 0 END +
             CASE WHEN engagement_score IS NOT NULL THEN 1 ELSE 0 END), 0)
    ) STORED,

    -- Scoring metadata
    scoring_method VARCHAR(50) DEFAULT 'manual',
    scored_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    scored_by VARCHAR(255),

    UNIQUE(opportunity_id)
);

-- ============================================
-- 5. Indexes for Performance
-- ============================================

-- Opportunities indexes
CREATE INDEX idx_opportunities_status ON opportunities(status);
CREATE INDEX idx_opportunities_source ON opportunities(source_id);
CREATE INDEX idx_opportunities_assigned ON opportunities(assigned_to);
CREATE INDEX idx_opportunities_dates ON opportunities(identified_date, expected_close_date);
CREATE INDEX idx_opportunities_duplicate ON opportunities(duplicate_check_hash);
CREATE INDEX idx_opportunities_company ON opportunities(company_name);
CREATE INDEX idx_opportunities_weighted_value ON opportunities(weighted_value DESC);
CREATE INDEX idx_opportunities_tags ON opportunities USING GIN(tags);

-- Categories indexes
CREATE INDEX idx_categories_opportunity ON opportunity_categories(opportunity_id);
CREATE INDEX idx_categories_name ON opportunity_categories(category_name);

-- Scores indexes
CREATE INDEX idx_scores_opportunity ON opportunity_scores(opportunity_id);
CREATE INDEX idx_scores_total ON opportunity_scores(total_score DESC);

-- ============================================
-- 6. Row Level Security (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_scores ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "authenticated_read_opportunities" ON opportunities
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "authenticated_write_opportunities" ON opportunities
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "authenticated_read_sources" ON opportunity_sources
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "authenticated_write_sources" ON opportunity_sources
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "authenticated_all_categories" ON opportunity_categories
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "authenticated_all_scores" ON opportunity_scores
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- ============================================
-- 7. Functions for Duplicate Detection
-- ============================================

CREATE OR REPLACE FUNCTION generate_opportunity_hash(
    p_company_name VARCHAR,
    p_contact_email VARCHAR,
    p_title VARCHAR
) RETURNS VARCHAR AS $$
BEGIN
    -- Generate a hash for duplicate detection
    RETURN encode(
        digest(
            LOWER(COALESCE(p_company_name, '')) || '|' ||
            LOWER(COALESCE(p_contact_email, '')) || '|' ||
            LOWER(COALESCE(p_title, '')),
            'sha256'
        ),
        'hex'
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- 8. Trigger for Updated Timestamp
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_opportunities_updated_at
    BEFORE UPDATE ON opportunities
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sources_updated_at
    BEFORE UPDATE ON opportunity_sources
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 9. Trigger for Duplicate Detection
-- ============================================

CREATE OR REPLACE FUNCTION check_opportunity_duplicate()
RETURNS TRIGGER AS $$
DECLARE
    v_hash VARCHAR;
    v_existing_id UUID;
BEGIN
    -- Generate hash for new opportunity
    v_hash := generate_opportunity_hash(NEW.company_name, NEW.contact_email, NEW.title);
    NEW.duplicate_check_hash := v_hash;

    -- Check for existing opportunities with same hash
    SELECT id INTO v_existing_id
    FROM opportunities
    WHERE duplicate_check_hash = v_hash
    AND id != COALESCE(NEW.id, gen_random_uuid())
    AND is_duplicate = false
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        -- Mark as potential duplicate
        NEW.is_duplicate := true;
        NEW.master_opportunity_id := v_existing_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_duplicate_before_insert
    BEFORE INSERT ON opportunities
    FOR EACH ROW
    EXECUTE FUNCTION check_opportunity_duplicate();

-- ============================================
-- 10. Sample Data for Testing
-- ============================================

-- Insert default sources
INSERT INTO opportunity_sources (source_type, source_name, source_url) VALUES
    ('manual_entry', 'Manual Entry Form', NULL),
    ('web_scraping', 'LinkedIn Sales Navigator', 'https://linkedin.com'),
    ('api_integration', 'Salesforce Integration', 'https://salesforce.com'),
    ('email_parsing', 'Sales Email Parser', NULL);

-- ============================================
-- 11. Views for Common Queries
-- ============================================

CREATE OR REPLACE VIEW opportunity_pipeline AS
SELECT
    o.*,
    os.source_name,
    os.source_type,
    sc.total_score,
    CASE
        WHEN o.status IN ('won', 'lost') THEN 'closed'
        WHEN o.status IN ('new', 'qualified') THEN 'early_stage'
        WHEN o.status IN ('in_progress', 'proposal_sent', 'negotiation') THEN 'active'
        ELSE 'other'
    END as pipeline_stage
FROM opportunities o
LEFT JOIN opportunity_sources os ON o.source_id = os.id
LEFT JOIN opportunity_scores sc ON o.id = sc.opportunity_id
WHERE o.is_duplicate = false;

-- ============================================
-- 12. Grant Permissions
-- ============================================

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- ============================================
-- Success Message
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Opportunity Sourcing Schema Successfully Created!';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Tables created:';
    RAISE NOTICE '  • opportunities (core table)';
    RAISE NOTICE '  • opportunity_sources';
    RAISE NOTICE '  • opportunity_categories';
    RAISE NOTICE '  • opportunity_scores';
    RAISE NOTICE '';
    RAISE NOTICE 'Features enabled:';
    RAISE NOTICE '  • Duplicate detection';
    RAISE NOTICE '  • Automatic scoring';
    RAISE NOTICE '  • Row-level security';
    RAISE NOTICE '  • Audit timestamps';
    RAISE NOTICE '';
    RAISE NOTICE 'Ready for API implementation!';
END $$;