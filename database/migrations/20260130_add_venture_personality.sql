-- Migration: Add venture_personality to strategic_directives_v2
-- SD: SD-LEO-ORCH-AESTHETIC-DESIGN-SYSTEM-001-A
-- Purpose: Support aesthetic-driven design system by storing venture personality
-- values that map to style vocabulary aesthetics.

-- Add venture_personality column
-- Valid values: 12 aesthetics + 2 special values (neutral, mixed)
ALTER TABLE strategic_directives_v2
ADD COLUMN IF NOT EXISTS venture_personality VARCHAR(50) DEFAULT 'neutral'
CHECK (venture_personality IN (
  'spartan',
  'enterprise',
  'startup',
  'dashboard',
  'consumer',
  'executive',
  'technical',
  'marketing',
  'minimal',
  'glass',
  'dark-mode-first',
  'accessible',
  'neutral',
  'mixed'
));

-- Create index for efficient filtering by personality
CREATE INDEX IF NOT EXISTS idx_strategic_directives_v2_venture_personality
ON strategic_directives_v2(venture_personality);

-- Add comment explaining the column
COMMENT ON COLUMN strategic_directives_v2.venture_personality IS
'Maps to EHG style vocabulary aesthetics. Determines design constraints, token preferences, and typography for SD-related UI. See lib/design/venture-personality-mapping.js';

-- Update existing SDs to have default value (idempotent)
UPDATE strategic_directives_v2
SET venture_personality = 'neutral'
WHERE venture_personality IS NULL;
