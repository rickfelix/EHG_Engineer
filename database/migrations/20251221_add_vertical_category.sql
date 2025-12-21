-- Migration: Add vertical_category to ventures table
-- Purpose: Enable calibration service portfolio-level vertical tracking
-- Created: 2025-12-21
-- Part of: SOVEREIGN PIPE v3.7.0

-- Add vertical_category column to ventures table
ALTER TABLE ventures
ADD COLUMN IF NOT EXISTS vertical_category TEXT DEFAULT 'other';

-- Add check constraint for valid vertical categories
-- Valid values: healthcare, fintech, edtech, logistics, other
ALTER TABLE ventures
ADD CONSTRAINT ventures_vertical_category_check
CHECK (vertical_category IN ('healthcare', 'fintech', 'edtech', 'logistics', 'other'));

-- Add comment for documentation
COMMENT ON COLUMN ventures.vertical_category IS
'Industry vertical for calibration multipliers. Values: healthcare (1.5x), fintech (1.3x), edtech (1.2x), logistics (1.0x), other (1.0x)';

-- Create index for filtering by vertical
CREATE INDEX IF NOT EXISTS idx_ventures_vertical_category
ON ventures(vertical_category);
