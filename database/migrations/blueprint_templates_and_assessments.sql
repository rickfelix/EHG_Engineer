-- Migration: Blueprint Templates and Quality Assessments
-- SD: SD-LEO-INFRA-BLUEPRINT-TEMPLATE-SYSTEM-001
-- Date: 2026-03-15
-- Description: Creates blueprint_templates and blueprint_quality_assessments tables
--              with RLS policies, indexes, updated_at triggers, and seed data.

-- ============================================================================
-- 1. blueprint_templates table
-- ============================================================================
CREATE TABLE IF NOT EXISTS blueprint_templates (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    artifact_type   text        NOT NULL
                                CHECK (artifact_type IN (
                                    'data_model',
                                    'erd_diagram',
                                    'user_story_pack',
                                    'api_contract',
                                    'schema_spec',
                                    'technical_architecture',
                                    'risk_register',
                                    'financial_projection',
                                    'launch_readiness',
                                    'sprint_plan',
                                    'promotion_gate'
                                )),
    archetype       text        NOT NULL DEFAULT 'default',
    template_content jsonb      DEFAULT '{}',
    quality_rubric  jsonb       DEFAULT '{}',
    version         integer     DEFAULT 1,
    is_active       boolean     DEFAULT true,
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now(),
    created_by      text        DEFAULT 'system',
    metadata        jsonb       DEFAULT '{}',
    description     text
);

COMMENT ON TABLE blueprint_templates IS 'Stores reusable blueprint templates for different artifact types and archetypes';
COMMENT ON COLUMN blueprint_templates.artifact_type IS 'Type of planning artifact this template produces';
COMMENT ON COLUMN blueprint_templates.archetype IS 'Venture archetype this template targets (default applies to all)';
COMMENT ON COLUMN blueprint_templates.quality_rubric IS 'JSONB rubric defining quality scoring criteria for this artifact type';
COMMENT ON COLUMN blueprint_templates.version IS 'Template version number, incremented on updates';

-- Partial unique index: only one active template per (artifact_type, archetype)
CREATE UNIQUE INDEX IF NOT EXISTS idx_blueprint_templates_active_unique
    ON blueprint_templates (artifact_type, archetype)
    WHERE is_active = true;

-- ============================================================================
-- 2. blueprint_quality_assessments table
-- ============================================================================
CREATE TABLE IF NOT EXISTS blueprint_quality_assessments (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    venture_id        uuid        NOT NULL REFERENCES ventures(id),
    template_id       uuid        REFERENCES blueprint_templates(id),
    artifact_type     text        NOT NULL,
    assessment_scores jsonb       DEFAULT '{}',
    overall_score     numeric(5,2),
    gate_decision     text        CHECK (gate_decision IN ('pass', 'fail', 'retry')),
    assessor_model    text,
    created_at        timestamptz DEFAULT now(),
    updated_at        timestamptz DEFAULT now(),
    metadata          jsonb       DEFAULT '{}',
    notes             text
);

COMMENT ON TABLE blueprint_quality_assessments IS 'Stores quality assessment results for blueprint artifacts per venture';
COMMENT ON COLUMN blueprint_quality_assessments.venture_id IS 'FK to ventures table - scopes assessment to a specific venture';
COMMENT ON COLUMN blueprint_quality_assessments.template_id IS 'FK to blueprint_templates - which template was used';
COMMENT ON COLUMN blueprint_quality_assessments.assessment_scores IS 'JSONB breakdown of individual rubric dimension scores';
COMMENT ON COLUMN blueprint_quality_assessments.overall_score IS 'Weighted aggregate score (0.00 - 100.00)';
COMMENT ON COLUMN blueprint_quality_assessments.gate_decision IS 'Promotion gate decision: pass, fail, or retry';
COMMENT ON COLUMN blueprint_quality_assessments.assessor_model IS 'Model identifier that performed the assessment';

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_bqa_venture_id
    ON blueprint_quality_assessments (venture_id);

CREATE INDEX IF NOT EXISTS idx_bqa_template_id
    ON blueprint_quality_assessments (template_id);

-- ============================================================================
-- 3. updated_at triggers
-- ============================================================================

-- Trigger function (reuse if exists, create if not)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- blueprint_templates updated_at trigger
DROP TRIGGER IF EXISTS trg_blueprint_templates_updated_at ON blueprint_templates;
CREATE TRIGGER trg_blueprint_templates_updated_at
    BEFORE UPDATE ON blueprint_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- blueprint_quality_assessments updated_at trigger
DROP TRIGGER IF EXISTS trg_blueprint_quality_assessments_updated_at ON blueprint_quality_assessments;
CREATE TRIGGER trg_blueprint_quality_assessments_updated_at
    BEFORE UPDATE ON blueprint_quality_assessments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 4. RLS Policies
-- ============================================================================

-- blueprint_templates: global read, service_role write
ALTER TABLE blueprint_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_blueprint_templates_policy ON blueprint_templates;
CREATE POLICY select_blueprint_templates_policy
    ON blueprint_templates
    FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS insert_blueprint_templates_policy ON blueprint_templates;
CREATE POLICY insert_blueprint_templates_policy
    ON blueprint_templates
    FOR INSERT
    TO service_role
    WITH CHECK (true);

DROP POLICY IF EXISTS update_blueprint_templates_policy ON blueprint_templates;
CREATE POLICY update_blueprint_templates_policy
    ON blueprint_templates
    FOR UPDATE
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS delete_blueprint_templates_policy ON blueprint_templates;
CREATE POLICY delete_blueprint_templates_policy
    ON blueprint_templates
    FOR DELETE
    TO service_role
    USING (true);

-- blueprint_quality_assessments: venture-scoped access
-- Pattern: EXISTS subquery matching ventures.created_by = auth.uid()
-- (consistent with venture_compliance_progress, venture_compliance_artifacts, etc.)
ALTER TABLE blueprint_quality_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_blueprint_quality_assessments_policy ON blueprint_quality_assessments;
CREATE POLICY select_blueprint_quality_assessments_policy
    ON blueprint_quality_assessments
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM ventures v
            WHERE v.id = blueprint_quality_assessments.venture_id
              AND v.created_by = auth.uid()
        )
    );

DROP POLICY IF EXISTS insert_blueprint_quality_assessments_policy ON blueprint_quality_assessments;
CREATE POLICY insert_blueprint_quality_assessments_policy
    ON blueprint_quality_assessments
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM ventures v
            WHERE v.id = blueprint_quality_assessments.venture_id
              AND v.created_by = auth.uid()
        )
    );

DROP POLICY IF EXISTS update_blueprint_quality_assessments_policy ON blueprint_quality_assessments;
CREATE POLICY update_blueprint_quality_assessments_policy
    ON blueprint_quality_assessments
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM ventures v
            WHERE v.id = blueprint_quality_assessments.venture_id
              AND v.created_by = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM ventures v
            WHERE v.id = blueprint_quality_assessments.venture_id
              AND v.created_by = auth.uid()
        )
    );

DROP POLICY IF EXISTS delete_blueprint_quality_assessments_policy ON blueprint_quality_assessments;
CREATE POLICY delete_blueprint_quality_assessments_policy
    ON blueprint_quality_assessments
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM ventures v
            WHERE v.id = blueprint_quality_assessments.venture_id
              AND v.created_by = auth.uid()
        )
    );

-- Service role full access to assessments (for automated scoring)
DROP POLICY IF EXISTS service_role_blueprint_quality_assessments_policy ON blueprint_quality_assessments;
CREATE POLICY service_role_blueprint_quality_assessments_policy
    ON blueprint_quality_assessments
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 5. Seed 11 skeleton templates (one per artifact_type)
-- ============================================================================
INSERT INTO blueprint_templates (artifact_type, archetype, template_content, quality_rubric, is_active, created_by, description)
VALUES
    ('data_model',              'default', '{}', '{}', true, 'system', 'Default template for data model artifacts'),
    ('erd_diagram',             'default', '{}', '{}', true, 'system', 'Default template for ERD diagram artifacts'),
    ('user_story_pack',         'default', '{}', '{}', true, 'system', 'Default template for user story pack artifacts'),
    ('api_contract',            'default', '{}', '{}', true, 'system', 'Default template for API contract artifacts'),
    ('schema_spec',             'default', '{}', '{}', true, 'system', 'Default template for schema specification artifacts'),
    ('technical_architecture',  'default', '{}', '{}', true, 'system', 'Default template for technical architecture artifacts'),
    ('risk_register',           'default', '{}', '{}', true, 'system', 'Default template for risk register artifacts'),
    ('financial_projection',    'default', '{}', '{}', true, 'system', 'Default template for financial projection artifacts'),
    ('launch_readiness',        'default', '{}', '{}', true, 'system', 'Default template for launch readiness artifacts'),
    ('sprint_plan',             'default', '{}', '{}', true, 'system', 'Default template for sprint plan artifacts'),
    ('promotion_gate',          'default', '{}', '{}', true, 'system', 'Default template for promotion gate artifacts')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Rollback SQL (for reference)
-- ============================================================================
-- DROP TABLE IF EXISTS blueprint_quality_assessments CASCADE;
-- DROP TABLE IF EXISTS blueprint_templates CASCADE;
-- DROP FUNCTION IF EXISTS update_updated_at_column();
