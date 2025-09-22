-- OpenAI Codex Handoff Integration
-- LEO Protocol Level 1 - Database-driven handoff between OpenAI Codex and Anthropic Claude
-- Created: 2025-01-20

-- Create codex_handoffs table for tracking handoffs between agents
CREATE TABLE IF NOT EXISTS codex_handoffs (
    id VARCHAR(100) PRIMARY KEY DEFAULT ('CODEX-' || EXTRACT(EPOCH FROM NOW())::TEXT || '-' || substr(gen_random_uuid()::text, 1, 8)),
    prd_id VARCHAR(100) REFERENCES product_requirements_v2(id) ON DELETE CASCADE,

    -- Status tracking
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',           -- Initial state
        'prompt_generated',  -- PLAN generated prompt
        'in_progress',       -- Codex is working
        'artifacts_ready',   -- Codex completed
        'processing',        -- Claude is processing
        'processed',         -- Successfully applied
        'error',            -- Failed at some step
        'rejected'          -- Validation failed
    )),

    -- Timestamps
    prompt_generated_at TIMESTAMP,
    artifacts_received_at TIMESTAMP,
    applied_at TIMESTAMP,

    -- Artifact tracking
    artifacts JSONB DEFAULT '{}'::jsonb,
    patch_sha256 VARCHAR(64),
    sbom_sha256 VARCHAR(64),
    attestation_sha256 VARCHAR(64),

    -- Processing details
    applied_by VARCHAR(50) CHECK (applied_by IN ('CLAUDE', 'EXEC', 'MANUAL')),
    validation_results JSONB DEFAULT '{}'::jsonb,

    -- Audit trail
    audit_log JSONB DEFAULT '[]'::jsonb,

    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Add columns to product_requirements_v2 for Codex integration
ALTER TABLE product_requirements_v2
ADD COLUMN IF NOT EXISTS codex_handoff_id VARCHAR(100) REFERENCES codex_handoffs(id),
ADD COLUMN IF NOT EXISTS codex_status VARCHAR(50) DEFAULT 'pending' CHECK (codex_status IN (
    'pending',
    'processing',
    'completed',
    'error',
    'not_applicable'
)),
ADD COLUMN IF NOT EXISTS codex_artifacts JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS codex_completed_at TIMESTAMP;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_codex_handoffs_prd_id ON codex_handoffs(prd_id);
CREATE INDEX IF NOT EXISTS idx_codex_handoffs_status ON codex_handoffs(status);
CREATE INDEX IF NOT EXISTS idx_codex_handoffs_created_at ON codex_handoffs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_requirements_codex_status ON product_requirements_v2(codex_status);

-- Create view for active handoffs
CREATE OR REPLACE VIEW active_codex_handoffs AS
SELECT
    ch.id as handoff_id,
    ch.prd_id,
    pr.title as prd_title,
    pr.priority as prd_priority,
    ch.status as handoff_status,
    ch.prompt_generated_at,
    ch.artifacts_received_at,
    ch.applied_at,
    ch.applied_by,
    CASE
        WHEN ch.status = 'processed' THEN 'Complete'
        WHEN ch.status = 'error' THEN 'Failed'
        WHEN ch.status IN ('prompt_generated', 'in_progress', 'artifacts_ready') THEN 'In Progress'
        ELSE 'Pending'
    END as overall_status,
    ch.created_at
FROM codex_handoffs ch
JOIN product_requirements_v2 pr ON ch.prd_id = pr.id
WHERE ch.status NOT IN ('processed', 'rejected')
ORDER BY ch.created_at DESC;

-- Create function to update PRD when handoff completes
CREATE OR REPLACE FUNCTION update_prd_on_handoff_complete()
RETURNS TRIGGER AS $$
BEGIN
    -- When a handoff is marked as processed, update the PRD
    IF NEW.status = 'processed' AND OLD.status != 'processed' THEN
        UPDATE product_requirements_v2
        SET
            codex_status = 'completed',
            codex_completed_at = NOW(),
            codex_artifacts = NEW.artifacts,
            updated_at = NOW()
        WHERE id = NEW.prd_id;
    END IF;

    -- When a handoff fails, update PRD status
    IF NEW.status = 'error' AND OLD.status != 'error' THEN
        UPDATE product_requirements_v2
        SET
            codex_status = 'error',
            updated_at = NOW()
        WHERE id = NEW.prd_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic PRD updates
DROP TRIGGER IF EXISTS trigger_update_prd_on_handoff ON codex_handoffs;
CREATE TRIGGER trigger_update_prd_on_handoff
    AFTER UPDATE ON codex_handoffs
    FOR EACH ROW
    EXECUTE FUNCTION update_prd_on_handoff_complete();

-- Create function to log handoff events
CREATE OR REPLACE FUNCTION log_handoff_event()
RETURNS TRIGGER AS $$
DECLARE
    event_entry JSONB;
BEGIN
    -- Create event log entry
    event_entry = jsonb_build_object(
        'timestamp', NOW(),
        'action', TG_OP,
        'old_status', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
        'new_status', NEW.status,
        'user', current_user
    );

    -- Append to audit log
    NEW.audit_log = COALESCE(NEW.audit_log, '[]'::jsonb) || event_entry;

    -- Update the updated_at timestamp
    NEW.updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for audit logging
DROP TRIGGER IF EXISTS trigger_log_handoff_event ON codex_handoffs;
CREATE TRIGGER trigger_log_handoff_event
    BEFORE INSERT OR UPDATE ON codex_handoffs
    FOR EACH ROW
    EXECUTE FUNCTION log_handoff_event();

-- Sample data for testing (commented out by default)
/*
-- Example handoff record
INSERT INTO codex_handoffs (prd_id, status, prompt_generated_at)
VALUES (
    'PRD-2025-001',
    'prompt_generated',
    NOW()
);

-- Example artifact update
UPDATE codex_handoffs
SET
    status = 'artifacts_ready',
    artifacts_received_at = NOW(),
    artifacts = jsonb_build_object(
        'patch', 'changes-1234567890.patch',
        'sbom', 'sbom-1234567890.cdx.json',
        'attestation', 'attestation-1234567890.intoto',
        'manifest', 'manifest-1234567890.json'
    ),
    patch_sha256 = 'abc123...',
    sbom_sha256 = 'def456...',
    attestation_sha256 = 'ghi789...'
WHERE id = 'CODEX-...';;
*/

-- Grant appropriate permissions
GRANT SELECT ON codex_handoffs TO anon;
GRANT ALL ON codex_handoffs TO authenticated;
GRANT SELECT ON active_codex_handoffs TO anon;
GRANT SELECT ON active_codex_handoffs TO authenticated;

COMMENT ON TABLE codex_handoffs IS 'Tracks handoffs between OpenAI Codex (read-only builder) and Anthropic Claude (write-enabled enforcer)';
COMMENT ON COLUMN codex_handoffs.prd_id IS 'Reference to the Product Requirements Document being implemented';
COMMENT ON COLUMN codex_handoffs.status IS 'Current state of the handoff process';
COMMENT ON COLUMN codex_handoffs.artifacts IS 'JSON object containing paths to generated artifacts (patch, SBOM, attestation)';
COMMENT ON COLUMN codex_handoffs.patch_sha256 IS 'SHA256 hash of the generated patch file for integrity verification';
COMMENT ON VIEW active_codex_handoffs IS 'Shows only active/pending handoffs for dashboard monitoring';