-- Migration: Add tool_policy_profile to leo_sub_agents
-- SD: SD-EVA-FEAT-TOOL-POLICIES-001
-- Purpose: Per-agent tool policy profiles (full/coding/readonly/minimal)

-- Add column with default 'full' for backward compatibility
ALTER TABLE leo_sub_agents
ADD COLUMN IF NOT EXISTS tool_policy_profile VARCHAR(20) NOT NULL DEFAULT 'full';

-- Add CHECK constraint for allowed values
ALTER TABLE leo_sub_agents
ADD CONSTRAINT chk_tool_policy_profile
CHECK (tool_policy_profile IN ('full', 'coding', 'readonly', 'minimal'));

-- Comment
COMMENT ON COLUMN leo_sub_agents.tool_policy_profile IS 'Tool policy profile controlling which tools this sub-agent can use. full=all tools, coding=read+write+bash (no web), readonly=read-only tools, minimal=Read only.';
