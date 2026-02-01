-- Migration: LEO Self-Audit Tables and Configuration
-- SD: SD-LEO-SELF-IMPROVE-001I Phase 4
-- Purpose: Enable autonomous SD health audits with gap detection
-- Database: Engineer (dedlbzhpgkmetvhbkyzq)

-- ============================================================================
-- 1. Drop existing tables if they exist (for clean migration)
-- ============================================================================
DROP TABLE IF EXISTS leo_audit_checklists CASCADE;
DROP TABLE IF EXISTS leo_audit_config CASCADE;
DROP FUNCTION IF EXISTS update_leo_audit_config_updated_at() CASCADE;

-- ============================================================================
-- 2. LEO Audit Configuration Table
-- ============================================================================
CREATE TABLE leo_audit_config (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    enabled boolean NOT NULL DEFAULT true,
    schedule_cron text NOT NULL,
    timezone text NOT NULL DEFAULT 'UTC',
    stale_after_days int NOT NULL DEFAULT 14,
    warn_after_days int NOT NULL DEFAULT 7,
    max_findings_per_sd int NOT NULL DEFAULT 25,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE leo_audit_config IS 'Configuration for LEO Self-Audit automated health checks';
COMMENT ON COLUMN leo_audit_config.enabled IS 'Master switch for audit execution';
COMMENT ON COLUMN leo_audit_config.schedule_cron IS 'Cron expression for audit schedule (e.g., "0 2 * * 1" for Mondays at 2 AM)';
COMMENT ON COLUMN leo_audit_config.timezone IS 'Timezone for cron schedule interpretation';
COMMENT ON COLUMN leo_audit_config.stale_after_days IS 'Days before SD marked as stale/abandoned';
COMMENT ON COLUMN leo_audit_config.warn_after_days IS 'Days before warning about stale SD';
COMMENT ON COLUMN leo_audit_config.max_findings_per_sd IS 'Maximum findings to report per SD';

-- ============================================================================
-- 3. LEO Audit Checklists Table
-- ============================================================================
CREATE TABLE leo_audit_checklists (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_type text NOT NULL,
    checklist_version int NOT NULL DEFAULT 1,
    artifact_key text NOT NULL,
    artifact_description text NOT NULL,
    required boolean NOT NULL DEFAULT true,
    detection_method text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT leo_audit_checklists_detection_method_check
        CHECK (detection_method IN (
            'file_exists',
            'sd_metadata_key_present',
            'command_registered',
            'db_table_exists',
            'manual_review_required'
        )),
    CONSTRAINT leo_audit_checklists_unique_artifact
        UNIQUE (sd_type, checklist_version, artifact_key)
);

COMMENT ON TABLE leo_audit_checklists IS 'Artifact requirements per SD type for health audits';
COMMENT ON COLUMN leo_audit_checklists.sd_type IS 'SD type (infrastructure, feature, bugfix, etc.)';
COMMENT ON COLUMN leo_audit_checklists.checklist_version IS 'Version number for checklist evolution';
COMMENT ON COLUMN leo_audit_checklists.artifact_key IS 'Unique identifier for artifact (e.g., "prd", "test_plan")';
COMMENT ON COLUMN leo_audit_checklists.artifact_description IS 'Human-readable description of expected artifact';
COMMENT ON COLUMN leo_audit_checklists.required IS 'Whether artifact is mandatory for SD completion';
COMMENT ON COLUMN leo_audit_checklists.detection_method IS 'How to verify artifact existence';

-- ============================================================================
-- 4. Updated At Trigger for leo_audit_config
-- ============================================================================
CREATE OR REPLACE FUNCTION update_leo_audit_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_leo_audit_config_updated_at
    BEFORE UPDATE ON leo_audit_config
    FOR EACH ROW
    EXECUTE FUNCTION update_leo_audit_config_updated_at();

-- ============================================================================
-- 5. Register AUDIT Sub-Agent
-- ============================================================================
-- Note: leo_sub_agents uses 'code' column and stores trigger_keywords in metadata JSONB
INSERT INTO leo_sub_agents (
    code,
    name,
    description,
    active,
    activation_type,
    priority,
    metadata
) VALUES (
    'AUDIT',
    'Self-Audit Agent',
    'Read-only audit capability for SD health checks',
    true,
    'manual',
    50,
    jsonb_build_object(
        'trigger_keywords', ARRAY['audit', 'gap check', 'self-audit', 'health check', 'sd audit']
    )
) ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    active = EXCLUDED.active,
    metadata = EXCLUDED.metadata;

-- ============================================================================
-- 6. Seed Audit Checklists for Infrastructure SD Type
-- ============================================================================
INSERT INTO leo_audit_checklists (
    sd_type,
    checklist_version,
    artifact_key,
    artifact_description,
    required,
    detection_method
) VALUES
    ('infrastructure', 1, 'ci_cd_plan', 'CI/CD pipeline configuration and deployment plan', true, 'file_exists'),
    ('infrastructure', 1, 'monitoring_plan', 'Monitoring, alerting, and observability setup', true, 'file_exists'),
    ('infrastructure', 1, 'rollback_plan', 'Rollback procedure and disaster recovery plan', true, 'file_exists'),
    ('infrastructure', 1, 'db_migrations', 'Database migration scripts with rollback capability', true, 'file_exists'),
    ('infrastructure', 1, 'runbook_or_guide', 'Operational runbook or setup guide', true, 'file_exists');

-- ============================================================================
-- 7. Seed Audit Checklists for Feature SD Type
-- ============================================================================
INSERT INTO leo_audit_checklists (
    sd_type,
    checklist_version,
    artifact_key,
    artifact_description,
    required,
    detection_method
) VALUES
    ('feature', 1, 'prd', 'Product Requirements Document with acceptance criteria', true, 'sd_metadata_key_present'),
    ('feature', 1, 'api_or_ui_spec', 'API specification or UI component design', true, 'file_exists'),
    ('feature', 1, 'test_plan', 'Test plan with unit, integration, and E2E coverage', true, 'file_exists'),
    ('feature', 1, 'rollout_plan', 'Feature rollout strategy and release plan', true, 'file_exists'),
    ('feature', 1, 'analytics_or_metrics', 'Analytics tracking plan and success metrics', true, 'file_exists');

-- ============================================================================
-- 8. Insert Default Audit Configuration
-- ============================================================================
INSERT INTO leo_audit_config (
    enabled,
    schedule_cron,
    timezone,
    stale_after_days,
    warn_after_days,
    max_findings_per_sd
) VALUES (
    true,
    '0 2 * * 1',  -- Mondays at 2 AM
    'UTC',
    14,           -- Stale after 2 weeks
    7,            -- Warn after 1 week
    25            -- Max 25 findings per SD
);

-- ============================================================================
-- 9. Verification Queries
-- ============================================================================
DO $$
DECLARE
    config_count int;
    checklist_count int;
    agent_exists boolean;
BEGIN
    -- Verify leo_audit_config
    SELECT COUNT(*) INTO config_count FROM leo_audit_config;
    RAISE NOTICE 'leo_audit_config records: %', config_count;

    -- Verify leo_audit_checklists
    SELECT COUNT(*) INTO checklist_count FROM leo_audit_checklists;
    RAISE NOTICE 'leo_audit_checklists records: %', checklist_count;

    -- Verify AUDIT sub-agent
    SELECT EXISTS(SELECT 1 FROM leo_sub_agents WHERE code = 'AUDIT') INTO agent_exists;
    RAISE NOTICE 'AUDIT sub-agent registered: %', CASE WHEN agent_exists THEN 'YES' ELSE 'NO' END;

    -- Summary
    RAISE NOTICE '=== Migration Complete ===';
    RAISE NOTICE 'Tables created: leo_audit_config, leo_audit_checklists';
    RAISE NOTICE 'Triggers created: trigger_leo_audit_config_updated_at';
    RAISE NOTICE 'Sub-agent registered: AUDIT (code: AUDIT)';
    RAISE NOTICE 'Seed data: % checklist items for infrastructure and feature SD types', checklist_count;
END $$;
