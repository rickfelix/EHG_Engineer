-- Migration: Add evolution tracking columns to discovery_strategies
-- SD: SD-LEO-FEAT-ADAPTIVE-DISCOVERY-STRATEGY-001
-- Phase 1: Enable strategy lineage tracking for future adaptive evolution

-- Add evolution tracking columns
ALTER TABLE discovery_strategies
  ADD COLUMN IF NOT EXISTS is_baseline BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_strategies JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS generation INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS performance_data JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

-- Mark original 4 strategies as baselines
UPDATE discovery_strategies
SET is_baseline = true, generation = 0
WHERE strategy_key IN ('trend_scanner', 'democratization_finder', 'capability_overhang', 'nursery_reeval');

-- Index for active strategy queries
CREATE INDEX IF NOT EXISTS idx_discovery_strategies_active
  ON discovery_strategies (is_active) WHERE is_active = true;
