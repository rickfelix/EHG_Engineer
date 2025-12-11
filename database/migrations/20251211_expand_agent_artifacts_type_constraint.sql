-- Migration: Expand agent_artifacts type constraint
-- Date: 2025-12-11
-- SD: SD-FOUND-AGENTIC-CONTEXT-001 (Agentic Context Engineering v3.0)
-- Purpose: Add additional artifact types needed for contract-based sub-agent handoffs
--
-- Current allowed types: ['file_read']
-- New types to add: tool_output, bash_output, grep_result, sub_agent_instructions,
--                   analysis, summary, context, contract_input, contract_output

-- ============================================================================
-- Step 1: Drop the existing constraint
-- ============================================================================

DO $$
BEGIN
    -- Try to drop the constraint if it exists
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'agent_artifacts_type_check'
    ) THEN
        ALTER TABLE agent_artifacts DROP CONSTRAINT agent_artifacts_type_check;
        RAISE NOTICE 'Dropped existing agent_artifacts_type_check constraint';
    ELSE
        RAISE NOTICE 'No agent_artifacts_type_check constraint found';
    END IF;
END $$;

-- ============================================================================
-- Step 2: Add expanded constraint with all needed types
-- ============================================================================

ALTER TABLE agent_artifacts
ADD CONSTRAINT agent_artifacts_type_check CHECK (
    type IN (
        -- Original types
        'file_read',

        -- Tool output types (Agentic Context Engineering v3.0)
        'tool_output',       -- Generic tool output
        'bash_output',       -- Bash command output
        'grep_result',       -- Grep search results
        'glob_result',       -- Glob file pattern matches
        'web_fetch',         -- Web fetch results
        'database_query',    -- Database query results

        -- Sub-agent related types
        'sub_agent_instructions',  -- Instructions stored for sub-agent
        'contract_input',          -- Input artifacts for task contracts
        'contract_output',         -- Output artifacts from task contracts

        -- Analysis types
        'analysis',          -- Code/system analysis
        'summary',           -- Summarized content
        'context',           -- Context/background information
        'decision',          -- Decision documentation

        -- Other
        'research',          -- Research findings
        'plan',              -- Planning artifacts
        'validation'         -- Validation results
    )
);

COMMENT ON CONSTRAINT agent_artifacts_type_check ON agent_artifacts IS
'Allowed artifact types for Agentic Context Engineering v3.0.
Expanded from original file_read to support tool output wrapping and sub-agent contracts.
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
        WHERE conname = 'agent_artifacts_type_check'
    ) INTO v_constraint_exists;

    IF v_constraint_exists THEN
        RAISE NOTICE 'Migration complete: agent_artifacts_type_check constraint updated';
    ELSE
        RAISE EXCEPTION 'Migration failed: constraint not created';
    END IF;
END $$;
