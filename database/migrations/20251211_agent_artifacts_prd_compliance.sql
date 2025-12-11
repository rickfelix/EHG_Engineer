-- Migration: Agent Artifacts PRD Compliance
-- Date: 2025-12-11
-- SD: SD-FOUND-AGENTIC-CONTEXT-001
-- Purpose: Add missing columns/indexes from PRD to align existing agent_artifacts table
-- Context: agent_artifacts table exists but deviates from PRD in 4 areas

-- ============================================================================
-- 1. Add session_id column and foreign key
-- Required for session isolation (PRD requirement)
-- ============================================================================

DO $$
DECLARE
    v_table_exists BOOLEAN;
BEGIN
    -- Check if leo_session_tracking table exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'leo_session_tracking'
    ) INTO v_table_exists;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'agent_artifacts' AND column_name = 'session_id'
    ) THEN
        IF v_table_exists THEN
            -- Add with FK if leo_session_tracking exists
            ALTER TABLE agent_artifacts
            ADD COLUMN session_id UUID REFERENCES leo_session_tracking(id) ON DELETE SET NULL;
            RAISE NOTICE 'Added session_id column with FK to leo_session_tracking';
        ELSE
            -- Add without FK if table doesn't exist (can add FK later)
            ALTER TABLE agent_artifacts
            ADD COLUMN session_id UUID;
            RAISE NOTICE 'Added session_id column without FK (leo_session_tracking does not exist)';
        END IF;
    ELSE
        RAISE NOTICE 'session_id column already exists';
    END IF;
END $$;

-- Create index for session lookups
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_session
ON agent_artifacts(session_id);

-- ============================================================================
-- 2. Add source_tool column
-- Required for tracking which tool generated the artifact
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'agent_artifacts' AND column_name = 'source_tool'
    ) THEN
        ALTER TABLE agent_artifacts
        ADD COLUMN source_tool VARCHAR(50);

        -- Add check constraint for valid tool names
        ALTER TABLE agent_artifacts
        ADD CONSTRAINT chk_source_tool CHECK (
            source_tool IS NULL OR
            source_tool IN ('Read', 'Bash', 'Write', 'Glob', 'Grep', 'Edit', 'Task', 'WebFetch', 'WebSearch', 'other')
        );

        RAISE NOTICE 'Added source_tool column to agent_artifacts';
    ELSE
        RAISE NOTICE 'source_tool column already exists';
    END IF;
END $$;

-- Create index for source_tool filtering
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_source_tool
ON agent_artifacts(source_tool);

-- ============================================================================
-- 3. Add expires_at index for cleanup job performance
-- Required for efficient cleanup of expired artifacts
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_agent_artifacts_expires
ON agent_artifacts(expires_at)
WHERE expires_at IS NOT NULL;

-- ============================================================================
-- 4. Add quality tracking fields (align with venture_artifacts pattern)
-- Optional but recommended for consistency
-- ============================================================================

DO $$
BEGIN
    -- Add quality_score column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'agent_artifacts' AND column_name = 'quality_score'
    ) THEN
        ALTER TABLE agent_artifacts
        ADD COLUMN quality_score INTEGER CHECK (quality_score IS NULL OR quality_score BETWEEN 0 AND 100);

        RAISE NOTICE 'Added quality_score column';
    END IF;

    -- Add validation_status column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'agent_artifacts' AND column_name = 'validation_status'
    ) THEN
        ALTER TABLE agent_artifacts
        ADD COLUMN validation_status VARCHAR(20) DEFAULT 'pending'
            CHECK (validation_status IN ('pending', 'validated', 'rejected', 'needs_revision'));

        RAISE NOTICE 'Added validation_status column';
    END IF;

    -- Add validated_at column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'agent_artifacts' AND column_name = 'validated_at'
    ) THEN
        ALTER TABLE agent_artifacts
        ADD COLUMN validated_at TIMESTAMPTZ;

        RAISE NOTICE 'Added validated_at column';
    END IF;

    -- Add validated_by column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'agent_artifacts' AND column_name = 'validated_by'
    ) THEN
        ALTER TABLE agent_artifacts
        ADD COLUMN validated_by VARCHAR(100);

        RAISE NOTICE 'Added validated_by column';
    END IF;
END $$;

-- Index for filtering by validation status
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_validation_status
ON agent_artifacts(validation_status);

-- ============================================================================
-- 5. Add updated_at column and trigger
-- Required for audit trail
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'agent_artifacts' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE agent_artifacts
        ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();

        RAISE NOTICE 'Added updated_at column';
    END IF;
END $$;

-- Create or replace trigger function for updated_at
CREATE OR REPLACE FUNCTION update_agent_artifacts_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists and recreate
DROP TRIGGER IF EXISTS trg_agent_artifacts_updated ON agent_artifacts;

CREATE TRIGGER trg_agent_artifacts_updated
BEFORE UPDATE ON agent_artifacts
FOR EACH ROW
EXECUTE FUNCTION update_agent_artifacts_timestamp();

-- ============================================================================
-- 6. Enhanced helper functions with session support
-- ============================================================================

-- Update create_artifact to support session_id and source_tool
CREATE OR REPLACE FUNCTION create_artifact_v2(
    p_session_id UUID DEFAULT NULL,
    p_sd_id TEXT DEFAULT NULL,
    p_type TEXT DEFAULT 'tool_output',
    p_source_tool TEXT DEFAULT 'other',
    p_summary TEXT DEFAULT '',
    p_content_text TEXT DEFAULT NULL,
    p_confidence TEXT DEFAULT 'HIGH',
    p_expires_in_hours INTEGER DEFAULT 2,
    p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE (
    artifact_id UUID,
    pointer_text TEXT,
    token_count INTEGER
) AS $$
DECLARE
    v_artifact_id UUID;
    v_token_count INTEGER;
    v_expires_at TIMESTAMPTZ;
BEGIN
    -- Calculate token count (rough estimate: 1 token per 4 chars)
    v_token_count := COALESCE(LENGTH(p_content_text) / 4, 0);

    -- Calculate expiration
    v_expires_at := NOW() + (p_expires_in_hours || ' hours')::INTERVAL;

    -- Insert artifact
    INSERT INTO agent_artifacts (
        session_id,
        sd_id,
        type,
        source_tool,
        summary,
        content_text,
        confidence,
        token_count,
        expires_at,
        metadata,
        created_at
    ) VALUES (
        p_session_id,
        p_sd_id,
        p_type,
        p_source_tool,
        p_summary,
        p_content_text,
        p_confidence,
        v_token_count,
        v_expires_at,
        p_metadata,
        NOW()
    )
    RETURNING id INTO v_artifact_id;

    -- Return artifact info
    RETURN QUERY SELECT
        v_artifact_id,
        FORMAT('artifact://%s [%s tokens, expires %s]', v_artifact_id, v_token_count, v_expires_at),
        v_token_count;
END;
$$ LANGUAGE plpgsql;

-- Function to read artifact by ID
CREATE OR REPLACE FUNCTION read_artifact_v2(
    p_artifact_id UUID
)
RETURNS TABLE (
    content TEXT,
    summary TEXT,
    confidence TEXT,
    token_count INTEGER,
    source_tool VARCHAR,
    expires_at TIMESTAMPTZ,
    is_expired BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.content_text AS content,
        a.summary,
        a.confidence,
        a.token_count,
        a.source_tool,
        a.expires_at,
        (a.expires_at IS NOT NULL AND a.expires_at < NOW()) AS is_expired
    FROM agent_artifacts a
    WHERE a.id = p_artifact_id;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup expired artifacts
CREATE OR REPLACE FUNCTION cleanup_expired_artifacts_v2()
RETURNS TABLE (
    deleted_count INTEGER,
    freed_tokens INTEGER
) AS $$
DECLARE
    v_deleted_count INTEGER;
    v_freed_tokens INTEGER;
BEGIN
    -- Get counts before deletion
    SELECT COUNT(*), COALESCE(SUM(token_count), 0)
    INTO v_deleted_count, v_freed_tokens
    FROM agent_artifacts
    WHERE expires_at IS NOT NULL AND expires_at < NOW();

    -- Delete expired artifacts
    DELETE FROM agent_artifacts
    WHERE expires_at IS NOT NULL AND expires_at < NOW();

    RETURN QUERY SELECT v_deleted_count, v_freed_tokens;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
DECLARE
    v_column_count INTEGER;
    v_index_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_column_count
    FROM information_schema.columns
    WHERE table_name = 'agent_artifacts';

    SELECT COUNT(*) INTO v_index_count
    FROM pg_indexes
    WHERE tablename = 'agent_artifacts';

    RAISE NOTICE 'Migration complete: agent_artifacts has % columns and % indexes', v_column_count, v_index_count;
END $$;

-- Show final schema
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'agent_artifacts'
ORDER BY ordinal_position;
