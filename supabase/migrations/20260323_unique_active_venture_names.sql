-- Enforce unique venture names among active/paused ventures.
-- Completed, cancelled, and archived ventures can reuse names.
-- Applied: 2026-03-23

CREATE UNIQUE INDEX IF NOT EXISTS idx_ventures_unique_active_name
  ON ventures (name)
  WHERE status IN ('active', 'paused');

COMMENT ON INDEX idx_ventures_unique_active_name IS
  'Prevents duplicate venture names among active/paused ventures. Archived/completed/cancelled can reuse names.';
