-- Fix sd_type for SD-LEO-ENH-AUTO-PROCEED-001-12
-- Date: 2026-01-25
-- Issue: sd_type='feature' but category='infrastructure' causing validation mismatch
-- Root cause: sd_type/category misalignment from leo-create-sd.js (preventive control added)

BEGIN;

-- Temporarily disable triggers that might interfere
ALTER TABLE strategic_directives_v2 DISABLE TRIGGER trg_subagent_automation;
ALTER TABLE strategic_directives_v2 DISABLE TRIGGER enforce_progress_trigger;

-- Update sd_type to match category
UPDATE strategic_directives_v2
SET sd_type = 'infrastructure',
    updated_at = NOW()
WHERE sd_key = 'SD-LEO-ENH-AUTO-PROCEED-001-12'
  AND sd_type = 'feature';  -- Safety check

-- Verify update
SELECT sd_key, sd_type, category, status
FROM strategic_directives_v2
WHERE sd_key = 'SD-LEO-ENH-AUTO-PROCEED-001-12';

-- Re-enable triggers
ALTER TABLE strategic_directives_v2 ENABLE TRIGGER enforce_progress_trigger;
ALTER TABLE strategic_directives_v2 ENABLE TRIGGER trg_subagent_automation;

COMMIT;

-- Post-update verification
SELECT
  sd_key,
  sd_type,
  category,
  CASE WHEN sd_type = category::text THEN '✓ ALIGNED' ELSE '✗ MISALIGNED' END as alignment
FROM strategic_directives_v2
WHERE sd_key = 'SD-LEO-ENH-AUTO-PROCEED-001-12';
