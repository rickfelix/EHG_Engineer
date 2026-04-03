-- Migration: Add skill_key column to leo_protocol_sections
-- SD: SD-LEO-INFRA-CUSTOM-SKILLS-PROTOCOL-001
-- Purpose: Tags which protocol sections map to which generated skill files

ALTER TABLE leo_protocol_sections
ADD COLUMN IF NOT EXISTS skill_key VARCHAR(50);

-- Index for efficient skill_key lookups during generation
CREATE INDEX IF NOT EXISTS idx_leo_protocol_sections_skill_key
ON leo_protocol_sections (skill_key)
WHERE skill_key IS NOT NULL;

COMMENT ON COLUMN leo_protocol_sections.skill_key IS 'Maps section to generated skill file in .claude/commands/<skill_key>.md. NULL = not part of any skill.';
