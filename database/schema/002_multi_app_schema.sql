-- EHG_Engineer Multi-Application Management Schema
-- LEO Protocol v3.1.5 Extension for Multi-App Support
-- This schema extends the base LEO Protocol tables to support multiple applications

-- Managed Applications Registry
CREATE TABLE IF NOT EXISTS managed_applications (
    id VARCHAR(50) PRIMARY KEY,  -- APP001, APP002, etc.
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    github_repo VARCHAR(500),
    github_owner VARCHAR(255),
    github_branch VARCHAR(100) DEFAULT 'main',
    supabase_project_id VARCHAR(255),
    supabase_url VARCHAR(500),
    vercel_project_id VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'archived', 'suspended')),
    environment VARCHAR(50) DEFAULT 'development' CHECK (environment IN ('development', 'staging', 'production')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_sync_at TIMESTAMP,
    created_by VARCHAR(100) NOT NULL DEFAULT 'HUMAN',
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Application Credentials (Encrypted Storage)
CREATE TABLE IF NOT EXISTS application_credentials (
    id SERIAL PRIMARY KEY,
    application_id VARCHAR(50) REFERENCES managed_applications(id) ON DELETE CASCADE,
    credential_type VARCHAR(100) NOT NULL CHECK (credential_type IN ('github_pat', 'supabase_anon_key', 'supabase_service_key', 'vercel_token', 'custom')),
    credential_name VARCHAR(255) NOT NULL,
    encrypted_value TEXT NOT NULL,  -- AES-256 encrypted
    encryption_version VARCHAR(20) DEFAULT 'v1',
    expires_at TIMESTAMP,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) NOT NULL,
    UNIQUE(application_id, credential_type, credential_name)
);

-- Application Directives Junction Table
-- Links Strategic Directives to specific applications
CREATE TABLE IF NOT EXISTS application_directives (
    id SERIAL PRIMARY KEY,
    application_id VARCHAR(50) REFERENCES managed_applications(id) ON DELETE CASCADE,
    directive_id VARCHAR(50) REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
    deployment_status VARCHAR(50) DEFAULT 'planned' CHECK (deployment_status IN ('planned', 'in_progress', 'deployed', 'rolled_back', 'failed')),
    deployment_branch VARCHAR(255),
    deployment_commit VARCHAR(100),
    deployment_url TEXT,
    deployed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(application_id, directive_id)
);

-- Application Sync History
CREATE TABLE IF NOT EXISTS application_sync_history (
    id SERIAL PRIMARY KEY,
    application_id VARCHAR(50) REFERENCES managed_applications(id) ON DELETE CASCADE,
    sync_type VARCHAR(50) NOT NULL CHECK (sync_type IN ('github_pull', 'github_push', 'supabase_pull', 'supabase_push', 'vercel_deploy', 'full_sync')),
    sync_status VARCHAR(50) NOT NULL CHECK (sync_status IN ('started', 'success', 'failed', 'partial')),
    sync_details JSONB DEFAULT '{}'::jsonb,
    files_changed INTEGER DEFAULT 0,
    duration_ms INTEGER,
    error_message TEXT,
    initiated_by VARCHAR(100) NOT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Application Context Tracking
CREATE TABLE IF NOT EXISTS application_context (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100) UNIQUE NOT NULL,
    current_application_id VARCHAR(50) REFERENCES managed_applications(id),
    previous_application_id VARCHAR(50) REFERENCES managed_applications(id),
    context_data JSONB DEFAULT '{}'::jsonb,
    switched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    switched_by VARCHAR(100) NOT NULL
);

-- Add application_id to existing LEO Protocol tables
ALTER TABLE strategic_directives_v2 
ADD COLUMN IF NOT EXISTS application_id VARCHAR(50) REFERENCES managed_applications(id),
ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT FALSE;  -- True for cross-app directives

ALTER TABLE execution_sequences_v2 
ADD COLUMN IF NOT EXISTS application_id VARCHAR(50) REFERENCES managed_applications(id);

ALTER TABLE hap_blocks_v2 
ADD COLUMN IF NOT EXISTS application_id VARCHAR(50) REFERENCES managed_applications(id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_managed_apps_status ON managed_applications(status);
CREATE INDEX IF NOT EXISTS idx_managed_apps_github ON managed_applications(github_repo);
CREATE INDEX IF NOT EXISTS idx_app_credentials_app ON application_credentials(application_id);
CREATE INDEX IF NOT EXISTS idx_app_directives_app ON application_directives(application_id);
CREATE INDEX IF NOT EXISTS idx_app_directives_status ON application_directives(deployment_status);
CREATE INDEX IF NOT EXISTS idx_sync_history_app ON application_sync_history(application_id);
CREATE INDEX IF NOT EXISTS idx_sync_history_type ON application_sync_history(sync_type);
CREATE INDEX IF NOT EXISTS idx_context_session ON application_context(session_id);
CREATE INDEX IF NOT EXISTS idx_sd_app ON strategic_directives_v2(application_id) WHERE application_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ees_app ON execution_sequences_v2(application_id) WHERE application_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hap_app ON hap_blocks_v2(application_id) WHERE application_id IS NOT NULL;

-- Update triggers for modified timestamps
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_managed_applications_modtime 
    BEFORE UPDATE ON managed_applications 
    FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

CREATE TRIGGER update_application_credentials_modtime 
    BEFORE UPDATE ON application_credentials 
    FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

CREATE TRIGGER update_application_directives_modtime 
    BEFORE UPDATE ON application_directives 
    FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

-- Helper Views
CREATE OR REPLACE VIEW active_applications AS
SELECT 
    ma.*,
    COUNT(DISTINCT ad.directive_id) as directive_count,
    COUNT(DISTINCT ac.id) as credential_count,
    MAX(ash.started_at) as last_sync
FROM managed_applications ma
LEFT JOIN application_directives ad ON ma.id = ad.application_id
LEFT JOIN application_credentials ac ON ma.id = ac.application_id
LEFT JOIN application_sync_history ash ON ma.id = ash.application_id
WHERE ma.status = 'active'
GROUP BY ma.id;

CREATE OR REPLACE VIEW application_deployment_status AS
SELECT 
    ma.id as app_id,
    ma.name as app_name,
    sd.id as directive_id,
    sd.title as directive_title,
    ad.deployment_status,
    ad.deployment_branch,
    ad.deployed_at
FROM managed_applications ma
JOIN application_directives ad ON ma.id = ad.application_id
JOIN strategic_directives_v2 sd ON ad.directive_id = sd.id
ORDER BY ma.name, ad.deployed_at DESC;

-- Sample data for testing (commented out by default)
/*
INSERT INTO managed_applications (id, name, description, github_repo, github_owner, supabase_project_id, status)
VALUES 
    ('APP001', 'Demo SaaS Platform', 'Test application for multi-app management', 'demo-saas', 'ehg-org', 'demo-proj-123', 'active'),
    ('APP002', 'Analytics Dashboard', 'Business intelligence platform', 'analytics-dash', 'ehg-org', 'analytics-proj-456', 'active');
*/

-- Grant permissions (adjust as needed for your Supabase setup)
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;