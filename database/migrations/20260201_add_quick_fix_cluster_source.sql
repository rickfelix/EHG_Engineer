-- SD-LEO-ENH-QUICK-FIX-PATTERN-001: Add quick_fix_cluster as valid source
-- This allows the feedback-clusterer to track patterns from quick_fixes

-- Drop existing constraint
ALTER TABLE issue_patterns DROP CONSTRAINT IF EXISTS issue_patterns_source_check;

-- Add updated constraint with quick_fix_cluster
ALTER TABLE issue_patterns 
ADD CONSTRAINT issue_patterns_source_check 
CHECK (source IN ('retrospective', 'feedback_cluster', 'manual', 'quick_fix_cluster'));
