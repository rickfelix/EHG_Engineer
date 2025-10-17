-- Strategic Directives Schema for Directive Lab
-- Links to directive_submissions table for complete traceability
-- Stores the final approved directive with all analysis data

CREATE TABLE IF NOT EXISTS strategic_directives (
    id VARCHAR(100) PRIMARY KEY DEFAULT ('SD-' || to_char(CURRENT_DATE, 'YYYY') || '-' || LPAD(nextval('sd_sequence')::text, 3, '0')),
    submission_id UUID REFERENCES directive_submissions(id) ON DELETE SET NULL,
    group_id VARCHAR(100), -- For grouped submissions
    
    -- Core Directive Information
    title VARCHAR(500) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'archived')),
    priority VARCHAR(20) NOT NULL CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    
    -- Step 1: Original Input
    chairman_feedback TEXT NOT NULL,
    screenshot_url TEXT,
    
    -- Step 2: Intent
    intent_summary TEXT NOT NULL,
    intent_confirmed_at TIMESTAMP,
    
    -- Step 3: Classification
    strategic_pct INTEGER CHECK (strategic_pct >= 0 AND strategic_pct <= 100),
    tactical_pct INTEGER CHECK (tactical_pct >= 0 AND tactical_pct <= 100),
    classification_rationale TEXT,
    classification_override BOOLEAN DEFAULT false,
    original_strategic_pct INTEGER, -- Store original if overridden
    original_tactical_pct INTEGER,
    
    -- Step 4: Impact Analysis
    impact_analysis JSONB DEFAULT '{}'::jsonb,
    consistency_validation JSONB DEFAULT '{}'::jsonb,
    risk_level VARCHAR(20) CHECK (risk_level IN ('critical', 'high', 'medium', 'low')),
    
    -- Step 5: Synthesis with Policy Badges
    aligned_changes JSONB DEFAULT '[]'::jsonb, -- Array with policy badges
    required_dependencies JSONB DEFAULT '[]'::jsonb, -- Array with policy badges
    recommended_enhancements JSONB DEFAULT '[]'::jsonb, -- Array with policy badges
    synthesis_reviewed BOOLEAN DEFAULT false,
    synthesis_reviewed_at TIMESTAMP,
    
    -- Step 6: Questions & Answers
    questions JSONB DEFAULT '[]'::jsonb,
    answers JSONB DEFAULT '{}'::jsonb,
    
    -- Step 7: Final Summary
    final_summary TEXT,
    summary_confirmed BOOLEAN DEFAULT false,
    summary_confirmed_at TIMESTAMP,
    
    -- Critical Mode Analysis (Backend)
    critical_analysis JSONB DEFAULT '{}'::jsonb,
    pacer_analysis JSONB DEFAULT '{}'::jsonb, -- Hidden backend analysis
    
    -- Gate Validation States
    gates_passed JSONB DEFAULT '{
        "step1": false,
        "step2": false,
        "step3": false,
        "step4": false,
        "step5": false,
        "step6": false,
        "step7": false
    }'::jsonb,
    
    -- Edit Tracking for Invalidation
    last_edited_step INTEGER,
    edit_history JSONB DEFAULT '[]'::jsonb,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    approved_by VARCHAR(100),
    approved_at TIMESTAMP,
    
    -- Constraints
    CONSTRAINT strategic_tactical_sum CHECK (
        (strategic_pct IS NULL AND tactical_pct IS NULL) OR 
        (strategic_pct + tactical_pct = 100)
    )
);

-- Create sequence for SD IDs if not exists
CREATE SEQUENCE IF NOT EXISTS sd_sequence START 1;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sd_submission ON strategic_directives(submission_id);
CREATE INDEX IF NOT EXISTS idx_sd_status ON strategic_directives(status);
CREATE INDEX IF NOT EXISTS idx_sd_priority ON strategic_directives(priority);
CREATE INDEX IF NOT EXISTS idx_sd_created ON strategic_directives(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sd_group ON strategic_directives(group_id);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_sd_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_strategic_directives_updated_at
    BEFORE UPDATE ON strategic_directives
    FOR EACH ROW
    EXECUTE FUNCTION update_sd_updated_at();

-- View for SD with submission data
CREATE OR REPLACE VIEW sd_with_submission_view AS
SELECT 
    sd.*,
    ds.chairman_name,
    ds.chairman_email,
    ds.created_at as submission_created_at
FROM strategic_directives sd
LEFT JOIN directive_submissions ds ON sd.submission_id = ds.id;

-- Sample policy badge structure for synthesis items:
-- {
--   "text": "Implement dark mode toggle in settings",
--   "badges": {
--     "UI": "HIGH",
--     "DB": "LOW",
--     "COMPLEX": "MEDIUM",
--     "ACCESS": "LOW",
--     "SECURITY": "LOW",
--     "PROCESS": "MEDIUM"
--   }
-- }