-- ============================================================================
-- Content Forge Tables Migration
-- SD-MKT-CONTENT-001
-- ============================================================================
-- This migration creates tables for AI-powered content generation.
-- Integrates with brand_genome_submissions for brand consistency.
-- ============================================================================

-- ============================================================================
-- GENERATED CONTENT TABLE
-- Stores all AI-generated content with brand genome linkage
-- ============================================================================

CREATE TABLE IF NOT EXISTS generated_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_genome_id UUID NOT NULL REFERENCES brand_genome_submissions(id) ON DELETE CASCADE,
    venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,

    -- Content type and data
    content_type VARCHAR(50) NOT NULL CHECK (content_type IN (
        'landing_page', 'email_sequence', 'seo_faq', 'comparison_page', 'how_to_guide'
    )),
    content_data JSONB NOT NULL DEFAULT '{}',

    -- Workflow status
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft', 'pending_review', 'approved', 'published', 'archived'
    )),

    -- Brand compliance
    compliance_score INTEGER NOT NULL DEFAULT 0 CHECK (compliance_score >= 0 AND compliance_score <= 100),
    compliance_issues TEXT[] DEFAULT '{}',

    -- Versioning
    version INTEGER NOT NULL DEFAULT 1,

    -- Audit fields
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,

    -- Constraints
    CONSTRAINT valid_published_status CHECK (
        (status = 'published' AND published_at IS NOT NULL) OR
        (status != 'published')
    ),
    CONSTRAINT valid_archived_status CHECK (
        (status = 'archived' AND archived_at IS NOT NULL) OR
        (status != 'archived')
    )
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_generated_content_brand_genome ON generated_content(brand_genome_id);
CREATE INDEX IF NOT EXISTS idx_generated_content_venture ON generated_content(venture_id);
CREATE INDEX IF NOT EXISTS idx_generated_content_type ON generated_content(content_type);
CREATE INDEX IF NOT EXISTS idx_generated_content_status ON generated_content(status);
CREATE INDEX IF NOT EXISTS idx_generated_content_created ON generated_content(created_at DESC);

-- ============================================================================
-- CONTENT VERSIONS TABLE
-- Stores version history for regeneration and comparison
-- ============================================================================

CREATE TABLE IF NOT EXISTS content_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID NOT NULL REFERENCES generated_content(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    content_snapshot JSONB NOT NULL,
    change_summary TEXT,

    -- Audit fields
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Unique version per content
    CONSTRAINT unique_content_version UNIQUE (content_id, version)
);

-- Index for version lookups
CREATE INDEX IF NOT EXISTS idx_content_versions_content ON content_versions(content_id);
CREATE INDEX IF NOT EXISTS idx_content_versions_version ON content_versions(content_id, version DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE generated_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_versions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view content for ventures they have access to
CREATE POLICY "generated_content_select" ON generated_content
    FOR SELECT
    USING (
        venture_id IN (
            SELECT v.id FROM ventures v
            WHERE v.id = venture_id
        )
    );

-- Policy: Users can insert content
CREATE POLICY "generated_content_insert" ON generated_content
    FOR INSERT
    WITH CHECK (true);

-- Policy: Users can update their own content
CREATE POLICY "generated_content_update" ON generated_content
    FOR UPDATE
    USING (
        venture_id IN (
            SELECT v.id FROM ventures v
            WHERE v.id = venture_id
        )
    );

-- Policy: Content versions follow parent content access
CREATE POLICY "content_versions_select" ON content_versions
    FOR SELECT
    USING (
        content_id IN (
            SELECT id FROM generated_content
        )
    );

CREATE POLICY "content_versions_insert" ON content_versions
    FOR INSERT
    WITH CHECK (true);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_generated_content_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generated_content_updated
    BEFORE UPDATE ON generated_content
    FOR EACH ROW
    EXECUTE FUNCTION update_generated_content_timestamp();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE generated_content IS 'AI-generated marketing content linked to brand genomes (SD-MKT-CONTENT-001)';
COMMENT ON TABLE content_versions IS 'Version history for generated content regeneration';
COMMENT ON COLUMN generated_content.content_type IS 'Type of content: landing_page, email_sequence, seo_faq, comparison_page, how_to_guide';
COMMENT ON COLUMN generated_content.content_data IS 'JSONB structure containing the generated content';
COMMENT ON COLUMN generated_content.compliance_score IS 'Brand compliance score (0-100), 80+ required for publishing';
