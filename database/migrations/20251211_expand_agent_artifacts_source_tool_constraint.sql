-- Migration: Expand agent_artifacts source_tool constraint
-- Date: 2025-12-11
-- SD: SD-FOUND-AGENTIC-CONTEXT-001 (Agentic Context Engineering v3.0)
-- Purpose: Add additional source_tool values for sub-agent executor and other tools

-- ============================================================================
-- Step 1: Drop the existing constraint
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_source_tool'
    ) THEN
        ALTER TABLE agent_artifacts DROP CONSTRAINT chk_source_tool;
        RAISE NOTICE 'Dropped existing chk_source_tool constraint';
    ELSE
        RAISE NOTICE 'No chk_source_tool constraint found';
    END IF;
END $$;

-- ============================================================================
-- Step 2: Add expanded constraint with all needed source tools
-- ============================================================================

ALTER TABLE agent_artifacts
ADD CONSTRAINT chk_source_tool CHECK (
    source_tool IS NULL OR
    source_tool IN (
        -- Original Claude Code tools
        'Read',
        'Bash',
        'Write',
        'Glob',
        'Grep',
        'Edit',
        'Task',
        'WebFetch',
        'WebSearch',
        'other',

        -- LEO Protocol additions (Agentic Context Engineering v3.0)
        'sub-agent-executor',    -- Sub-agent instruction storage
        'artifact-tools',        -- Direct artifact creation
        'leo-executor',          -- LEO protocol executor
        'handoff-validator',     -- Handoff validation artifacts
        'contract-system',       -- Task contract system
        'test-script'            -- Test scripts
    )
);

COMMENT ON CONSTRAINT chk_source_tool ON agent_artifacts IS
'Allowed source tools for artifact creation.
Expanded to support LEO Protocol sub-agent executor and contract system.
SD: SD-FOUND-AGENTIC-CONTEXT-001';

-- ============================================================================
-- Step 3: Verify the constraint
-- ============================================================================

DO $$
DECLARE
    v_constraint_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_source_tool'
    ) INTO v_constraint_exists;

    IF v_constraint_exists THEN
        RAISE NOTICE 'Migration complete: chk_source_tool constraint updated';
    ELSE
        RAISE EXCEPTION 'Migration failed: constraint not created';
    END IF;
END $$;
