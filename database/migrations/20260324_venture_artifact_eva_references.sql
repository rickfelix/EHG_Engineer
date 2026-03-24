-- Migration: Add EVA reference columns to venture_artifacts
-- SD: SD-LEO-INFRA-STREAM-VENTURE-EVA-002-A
-- Purpose: Enable evidence chain linkage from venture_artifacts to EVA governance records
-- Behavior: Adds nullable soft-reference columns with partial indexes for efficient HEAL queries

-- Add supports_vision_key column (soft reference to eva_vision_documents.vision_key)
ALTER TABLE venture_artifacts
  ADD COLUMN IF NOT EXISTS supports_vision_key VARCHAR(100);

-- Add supports_plan_key column (soft reference to eva_architecture_plans.plan_key)
ALTER TABLE venture_artifacts
  ADD COLUMN IF NOT EXISTS supports_plan_key VARCHAR(100);

-- Partial indexes for efficient HEAL evidence queries (only index non-null values)
CREATE INDEX IF NOT EXISTS idx_va_supports_vision_key
  ON venture_artifacts(supports_vision_key)
  WHERE supports_vision_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_va_supports_plan_key
  ON venture_artifacts(supports_plan_key)
  WHERE supports_plan_key IS NOT NULL;

-- Composite index for HEAL evidence chain queries that filter by vision_key + is_current
CREATE INDEX IF NOT EXISTS idx_va_vision_key_current
  ON venture_artifacts(supports_vision_key, is_current)
  WHERE supports_vision_key IS NOT NULL AND is_current = true;

CREATE INDEX IF NOT EXISTS idx_va_plan_key_current
  ON venture_artifacts(supports_plan_key, is_current)
  WHERE supports_plan_key IS NOT NULL AND is_current = true;

-- Rollback SQL:
-- DROP INDEX IF EXISTS idx_va_plan_key_current;
-- DROP INDEX IF EXISTS idx_va_vision_key_current;
-- DROP INDEX IF EXISTS idx_va_supports_plan_key;
-- DROP INDEX IF EXISTS idx_va_supports_vision_key;
-- ALTER TABLE venture_artifacts DROP COLUMN IF EXISTS supports_plan_key;
-- ALTER TABLE venture_artifacts DROP COLUMN IF EXISTS supports_vision_key;
