-- Migration: Capability Lifecycle Automation
-- SD: SD-CAPABILITY-LIFECYCLE-001
-- Date: 2025-12-02
-- Purpose: Automate capability registration when Strategic Directives complete
-- Following patterns from 20251129_musk_algorithm_pareto.sql

-- ============================================================================
-- PHASE 1: Add capability declaration columns to strategic_directives_v2
-- ============================================================================

-- 1.1: delivers_capabilities - JSONB array of new capabilities to register
ALTER TABLE strategic_directives_v2
ADD COLUMN IF NOT EXISTS delivers_capabilities JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN strategic_directives_v2.delivers_capabilities IS
'Array of capabilities that will be auto-registered when SD completes. Format: [{capability_type, capability_key, name, description, metadata}]';

-- 1.2: modifies_capabilities - JSONB array of existing capabilities to update
ALTER TABLE strategic_directives_v2
ADD COLUMN IF NOT EXISTS modifies_capabilities JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN strategic_directives_v2.modifies_capabilities IS
'Array of existing capabilities to update when SD completes. Format: [{capability_key, updates: {...}}]';

-- 1.3: deprecates_capabilities - JSONB array of capabilities to mark as deprecated
ALTER TABLE strategic_directives_v2
ADD COLUMN IF NOT EXISTS deprecates_capabilities JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN strategic_directives_v2.deprecates_capabilities IS
'Array of capability_keys to mark as deprecated when SD completes. Format: [{capability_key, reason}]';

-- ============================================================================
-- PHASE 2: Create sd_capabilities junction table for audit trail
-- ============================================================================

CREATE TABLE IF NOT EXISTS sd_capabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_uuid UUID NOT NULL REFERENCES strategic_directives_v2(uuid_id) ON DELETE CASCADE,
    sd_id VARCHAR(100) NOT NULL, -- Human-readable SD ID for easier querying
    capability_type VARCHAR(50) NOT NULL CHECK (capability_type IN ('agent', 'tool', 'crew', 'skill')),
    capability_key VARCHAR(200) NOT NULL, -- Matches crewai_agents.agent_key or similar
    action VARCHAR(20) NOT NULL CHECK (action IN ('registered', 'updated', 'deprecated')),
    action_details JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Prevent duplicate entries for same SD + capability + action
    UNIQUE(sd_uuid, capability_key, action)
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sd_capabilities_sd_uuid ON sd_capabilities(sd_uuid);
CREATE INDEX IF NOT EXISTS idx_sd_capabilities_capability_key ON sd_capabilities(capability_key);
CREATE INDEX IF NOT EXISTS idx_sd_capabilities_action ON sd_capabilities(action);
CREATE INDEX IF NOT EXISTS idx_sd_capabilities_created_at ON sd_capabilities(created_at);

COMMENT ON TABLE sd_capabilities IS
'Junction table tracking which capabilities were registered/updated/deprecated by which Strategic Directives. Provides full audit trail.';

-- ============================================================================
-- PHASE 3: Create trigger function for capability lifecycle automation
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_handle_capability_lifecycle()
RETURNS TRIGGER AS $$
DECLARE
    cap_record JSONB;
    new_capability RECORD;
BEGIN
    -- Only trigger on status change to 'completed'
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN

        -- Process delivers_capabilities: Register new capabilities
        IF NEW.delivers_capabilities IS NOT NULL AND jsonb_array_length(NEW.delivers_capabilities) > 0 THEN
            FOR cap_record IN SELECT * FROM jsonb_array_elements(NEW.delivers_capabilities)
            LOOP
                -- Insert into crewai_agents if capability_type is 'agent'
                IF cap_record->>'capability_type' = 'agent' THEN
                    INSERT INTO crewai_agents (
                        agent_key,
                        name,
                        role,
                        goal,
                        backstory,
                        status,
                        created_at
                    ) VALUES (
                        cap_record->>'capability_key',
                        cap_record->>'name',
                        COALESCE(cap_record->>'role', cap_record->>'name'),
                        COALESCE(cap_record->>'goal', 'Automated agent from SD completion'),
                        COALESCE(cap_record->>'backstory', 'Auto-registered by ' || NEW.id),
                        'active',
                        NOW()
                    )
                    ON CONFLICT (agent_key) DO UPDATE SET
                        name = EXCLUDED.name,
                        status = 'active',
                        updated_at = NOW();
                END IF;

                -- Log to audit trail
                INSERT INTO sd_capabilities (
                    sd_uuid,
                    sd_id,
                    capability_type,
                    capability_key,
                    action,
                    action_details
                ) VALUES (
                    NEW.uuid_id,
                    NEW.id,
                    cap_record->>'capability_type',
                    cap_record->>'capability_key',
                    'registered',
                    cap_record
                )
                ON CONFLICT (sd_uuid, capability_key, action) DO NOTHING;
            END LOOP;
        END IF;

        -- Process modifies_capabilities: Update existing capabilities
        IF NEW.modifies_capabilities IS NOT NULL AND jsonb_array_length(NEW.modifies_capabilities) > 0 THEN
            FOR cap_record IN SELECT * FROM jsonb_array_elements(NEW.modifies_capabilities)
            LOOP
                -- Update crewai_agents
                UPDATE crewai_agents
                SET
                    name = COALESCE(cap_record->'updates'->>'name', name),
                    role = COALESCE(cap_record->'updates'->>'role', role),
                    goal = COALESCE(cap_record->'updates'->>'goal', goal),
                    status = COALESCE(cap_record->'updates'->>'status', status),
                    updated_at = NOW()
                WHERE agent_key = cap_record->>'capability_key';

                -- Log to audit trail
                INSERT INTO sd_capabilities (
                    sd_uuid,
                    sd_id,
                    capability_type,
                    capability_key,
                    action,
                    action_details
                ) VALUES (
                    NEW.uuid_id,
                    NEW.id,
                    COALESCE(cap_record->>'capability_type', 'agent'),
                    cap_record->>'capability_key',
                    'updated',
                    cap_record
                )
                ON CONFLICT (sd_uuid, capability_key, action) DO NOTHING;
            END LOOP;
        END IF;

        -- Process deprecates_capabilities: Mark capabilities as deprecated
        IF NEW.deprecates_capabilities IS NOT NULL AND jsonb_array_length(NEW.deprecates_capabilities) > 0 THEN
            FOR cap_record IN SELECT * FROM jsonb_array_elements(NEW.deprecates_capabilities)
            LOOP
                -- Update crewai_agents to deprecated status
                UPDATE crewai_agents
                SET
                    status = 'deprecated',
                    updated_at = NOW()
                WHERE agent_key = cap_record->>'capability_key';

                -- Log to audit trail
                INSERT INTO sd_capabilities (
                    sd_uuid,
                    sd_id,
                    capability_type,
                    capability_key,
                    action,
                    action_details
                ) VALUES (
                    NEW.uuid_id,
                    NEW.id,
                    COALESCE(cap_record->>'capability_type', 'agent'),
                    cap_record->>'capability_key',
                    'deprecated',
                    cap_record
                )
                ON CONFLICT (sd_uuid, capability_key, action) DO NOTHING;
            END LOOP;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_handle_capability_lifecycle() IS
'Trigger function that auto-registers, updates, or deprecates capabilities when an SD status changes to completed. Part of SD-CAPABILITY-LIFECYCLE-001.';

-- ============================================================================
-- PHASE 4: Create trigger on strategic_directives_v2
-- ============================================================================

-- Drop existing trigger if it exists (safe re-run)
DROP TRIGGER IF EXISTS trg_capability_lifecycle ON strategic_directives_v2;

-- Create trigger
CREATE TRIGGER trg_capability_lifecycle
    AFTER UPDATE ON strategic_directives_v2
    FOR EACH ROW
    EXECUTE FUNCTION fn_handle_capability_lifecycle();

COMMENT ON TRIGGER trg_capability_lifecycle ON strategic_directives_v2 IS
'Fires when SD status changes to completed, processing delivers/modifies/deprecates capabilities.';

-- ============================================================================
-- PHASE 5: Enable RLS on sd_capabilities (following project patterns)
-- ============================================================================

ALTER TABLE sd_capabilities ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access on sd_capabilities"
ON sd_capabilities
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Allow authenticated users to read
CREATE POLICY "Authenticated users can read sd_capabilities"
ON sd_capabilities
FOR SELECT
TO authenticated
USING (true);

-- ============================================================================
-- Verification Query (run after migration)
-- ============================================================================
-- SELECT
--     column_name,
--     data_type,
--     column_default
-- FROM information_schema.columns
-- WHERE table_name = 'strategic_directives_v2'
-- AND column_name LIKE '%capabilities%';
