-- Migration: Add parent_sd_id column for Child SD Pattern
-- Date: 2025-11-07
-- Learning Source: SD-CREWAI-ARCHITECTURE-001
-- Purpose: Enable hierarchical parent/child SD relationships

-- Add parent_sd_id column to strategic_directives_v2
ALTER TABLE strategic_directives_v2
ADD COLUMN IF NOT EXISTS parent_sd_id TEXT REFERENCES strategic_directives_v2(id);

-- Create index for efficient parent/child queries
CREATE INDEX IF NOT EXISTS idx_sd_parent ON strategic_directives_v2(parent_sd_id);

-- Create view for parent/child relationships
CREATE OR REPLACE VIEW sd_children AS
SELECT
  parent.id as parent_id,
  parent.title as parent_title,
  parent.status as parent_status,
  parent.progress as parent_progress,
  child.id as child_id,
  child.title as child_title,
  child.status as child_status,
  child.progress as child_progress,
  child.priority as child_priority,
  child.current_phase as child_phase
FROM strategic_directives_v2 parent
JOIN strategic_directives_v2 child ON child.parent_sd_id = parent.id
ORDER BY parent.id, child.priority DESC, child.id;

-- Create function to calculate parent SD progress from children
CREATE OR REPLACE FUNCTION calculate_parent_sd_progress(p_sd_id TEXT)
RETURNS INTEGER AS $$
DECLARE
  v_child_count INTEGER;
  v_weighted_progress NUMERIC;
BEGIN
  -- Count children and calculate weighted progress
  SELECT COUNT(*),
         COALESCE(SUM(progress *
           CASE priority
             WHEN 'critical' THEN 0.40
             WHEN 'high' THEN 0.30
             WHEN 'medium' THEN 0.20
             WHEN 'low' THEN 0.10
             ELSE 0.25  -- Default weight if priority not set
           END), 0)
  INTO v_child_count, v_weighted_progress
  FROM strategic_directives_v2
  WHERE parent_sd_id = p_sd_id;

  IF v_child_count = 0 THEN
    -- No children, return NULL (use standard progress calculation)
    RETURN NULL;
  ELSE
    -- Has children, return weighted child progress
    RETURN ROUND(v_weighted_progress);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create function to check if all child SDs are completed
CREATE OR REPLACE FUNCTION all_children_completed(p_sd_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_child_count INTEGER;
  v_completed_count INTEGER;
BEGIN
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE status = 'completed')
  INTO v_child_count, v_completed_count
  FROM strategic_directives_v2
  WHERE parent_sd_id = p_sd_id;

  IF v_child_count = 0 THEN
    -- No children
    RETURN TRUE;
  ELSE
    -- All children must be completed
    RETURN v_child_count = v_completed_count;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Add comment to document the column
COMMENT ON COLUMN strategic_directives_v2.parent_sd_id IS
'Parent SD ID for Child SD Pattern. If set, this SD is a child implementation unit of the parent orchestrator SD. Parent SDs coordinate children but do not contain implementation code.';

-- Example usage comments
/*
Example: Payment System with Child SDs

-- Parent SD (Orchestrator)
INSERT INTO strategic_directives_v2 (id, title, parent_sd_id)
VALUES ('SD-PAYMENT-001', 'Payment System Architecture', NULL);

-- Child SDs (Implementation Units)
INSERT INTO strategic_directives_v2 (id, title, parent_sd_id, priority)
VALUES
  ('SD-PAYMENT-001-STRIPE', 'Stripe Integration', 'SD-PAYMENT-001', 'high'),
  ('SD-PAYMENT-001-PAYPAL', 'PayPal Integration', 'SD-PAYMENT-001', 'high'),
  ('SD-PAYMENT-001-WEBHOOK', 'Webhook System', 'SD-PAYMENT-001', 'medium');

-- Query parent with children
SELECT * FROM sd_children WHERE parent_id = 'SD-PAYMENT-001';

-- Calculate parent progress from children
SELECT calculate_parent_sd_progress('SD-PAYMENT-001');

-- Check if all children complete
SELECT all_children_completed('SD-PAYMENT-001');
*/
