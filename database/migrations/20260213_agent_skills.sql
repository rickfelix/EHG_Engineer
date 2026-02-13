-- Migration: Agent Skills Table for Skill Packaging System
-- SD: SD-EVA-FEAT-SKILL-PACKAGING-001
-- Purpose: Store skill metadata with trigger conditions for context-based injection

-- Table: agent_skills
CREATE TABLE IF NOT EXISTS agent_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_key VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
  description TEXT,

  -- Context-based injection metadata
  triggers JSONB NOT NULL DEFAULT '[]',        -- Array of keyword strings for context matching
  context_keywords JSONB NOT NULL DEFAULT '[]', -- Broader context categories

  -- Requirements
  required_tools JSONB NOT NULL DEFAULT '[]',   -- Tools this skill needs (e.g., ["Bash", "Read"])
  context_access VARCHAR(20) DEFAULT 'readonly', -- 'full', 'readonly', 'minimal'

  -- Scope
  agent_scope JSONB NOT NULL DEFAULT '[]',      -- Agent codes that can use this (empty = all)
  category_scope JSONB NOT NULL DEFAULT '[]',   -- Category mappings (e.g., ["database", "infrastructure"])

  -- Dependencies
  dependencies JSONB NOT NULL DEFAULT '[]',     -- Other skill_keys this depends on

  -- Content
  content_hash VARCHAR(64),                     -- SHA256 of SKILL.md content for change detection
  file_path VARCHAR(500),                       -- Relative path to SKILL.md file

  -- Status
  active BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for context matching queries
CREATE INDEX idx_agent_skills_active ON agent_skills (active) WHERE active = true;
CREATE INDEX idx_agent_skills_triggers ON agent_skills USING GIN (triggers);
CREATE INDEX idx_agent_skills_context ON agent_skills USING GIN (context_keywords);
CREATE INDEX idx_agent_skills_agent_scope ON agent_skills USING GIN (agent_scope);

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_agent_skills_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_agent_skills_updated
  BEFORE UPDATE ON agent_skills
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_skills_timestamp();

-- Check constraint for version format (semver-like)
ALTER TABLE agent_skills
  ADD CONSTRAINT chk_skill_version CHECK (version ~ '^\d+\.\d+\.\d+$');

-- Check constraint for context_access
ALTER TABLE agent_skills
  ADD CONSTRAINT chk_skill_context_access CHECK (context_access IN ('full', 'readonly', 'minimal'));

COMMENT ON TABLE agent_skills IS 'Skill metadata for context-based injection into agent prompts (SD-EVA-FEAT-SKILL-PACKAGING-001)';
COMMENT ON COLUMN agent_skills.triggers IS 'Array of keyword strings that trigger this skill injection';
COMMENT ON COLUMN agent_skills.agent_scope IS 'Agent codes that can use this skill (empty array = all agents)';
