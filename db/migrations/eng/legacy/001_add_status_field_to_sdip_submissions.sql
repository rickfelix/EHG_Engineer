-- Migration: Add status field to sdip_submissions table
-- Created: 2025-09-05
-- Purpose: Support Draft, Ready, Submitted status system in directive-dash-lab

-- Add status field with proper constraints
ALTER TABLE sdip_submissions 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft' 
CHECK (status IN ('draft', 'ready', 'submitted'));

-- Create index for performance on status queries
CREATE INDEX IF NOT EXISTS idx_sdip_submissions_status 
ON sdip_submissions(status);

-- Update existing records to have proper status based on current state
UPDATE sdip_submissions 
SET status = CASE 
    WHEN resulting_sd_id IS NOT NULL THEN 'submitted'
    WHEN validation_complete = true AND all_gates_passed = true THEN 'ready'
    ELSE 'draft'
END
WHERE status IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN sdip_submissions.status IS 'Submission workflow status: draft (in progress), ready (complete but not submitted), submitted (strategic directive created)';