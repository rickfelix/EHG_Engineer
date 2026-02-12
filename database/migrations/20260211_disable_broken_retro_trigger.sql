-- Disable the broken extract_protocol_improvements_from_retro trigger
-- The trigger function doesn't match the protocol_improvement_queue schema
-- It tries to insert with columns that don't exist (improvement_text, category, priority_score)
-- and is missing required columns (target_table, target_operation, improvement_type, payload, description)

-- Disable the trigger so we can safely update learning_extracted_at
DROP TRIGGER IF EXISTS trg_extract_protocol_improvements ON retrospectives;

-- Comment the function to document why it's disabled
COMMENT ON FUNCTION extract_protocol_improvements_from_retro() IS
'DISABLED 2026-02-11: Function schema does not match protocol_improvement_queue table structure.
Needs complete rewrite to use correct columns: description, improvement_type, target_table,
target_operation, payload, source_type (must be LEAD_TO_PLAN|PLAN_TO_EXEC|SD_COMPLETION), etc.';

SELECT 'Trigger trg_extract_protocol_improvements has been disabled' as status;
