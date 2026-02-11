-- Migration: work_item_thresholds table
-- SD: SD-LEO-ENH-IMPLEMENT-TIERED-QUICK-001
-- Purpose: Database-driven tier boundaries for unified work-item routing
-- Date: 2026-02-11

-- Create the thresholds table
CREATE TABLE IF NOT EXISTS work_item_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier1_max_loc INTEGER NOT NULL DEFAULT 30,
  tier2_max_loc INTEGER NOT NULL DEFAULT 75,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  change_reason TEXT,
  supersedes_id UUID REFERENCES work_item_thresholds(id)
);

-- Enable RLS
ALTER TABLE work_item_thresholds ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY authenticated_read_work_item_thresholds ON work_item_thresholds
  FOR SELECT TO authenticated USING (true);

CREATE POLICY service_role_all_work_item_thresholds ON work_item_thresholds
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Partial unique index: only one active row at a time
CREATE UNIQUE INDEX idx_work_item_thresholds_single_active
  ON work_item_thresholds (is_active) WHERE is_active = true;

-- Index for quick lookups
CREATE INDEX idx_work_item_thresholds_active
  ON work_item_thresholds (is_active, created_at DESC);

-- Seed the default active row
INSERT INTO work_item_thresholds (tier1_max_loc, tier2_max_loc, is_active, created_by, change_reason)
VALUES (30, 75, true, 'migration', 'Initial default thresholds: Tier 1 <=30 LOC, Tier 2 <=75 LOC, Tier 3 >75 LOC');

-- Add routing_tier and routing_threshold_id columns to quick_fixes table for audit trail
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quick_fixes' AND column_name = 'routing_tier') THEN
    ALTER TABLE quick_fixes ADD COLUMN routing_tier INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quick_fixes' AND column_name = 'routing_threshold_id') THEN
    ALTER TABLE quick_fixes ADD COLUMN routing_threshold_id UUID REFERENCES work_item_thresholds(id);
  END IF;
END $$;
