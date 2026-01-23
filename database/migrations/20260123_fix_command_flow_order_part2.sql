-- Migration: Fix command flow order - document before ship (Part 2)
-- Date: 2026-01-23
-- Purpose: Update the common_commands section example flow
-- Rationale: Consistency with main command flow

-- Update the common_commands section to fix the example flow
UPDATE leo_protocol_sections
SET content = REPLACE(
  content,
  'LEAD-FINAL-APPROVAL → /restart → Visual Review → /ship → /document → /learn → /leo next',
  'LEAD-FINAL-APPROVAL → /restart → Visual Review → /document → /ship → /learn → /leo next'
)
WHERE section_type = 'common_commands'
  AND content LIKE '%/ship → /document%';

-- Verify the update
SELECT section_type,
       CASE
         WHEN content LIKE '%Visual Review → /document → /ship%' THEN 'CORRECT'
         WHEN content LIKE '%Visual Review → /ship → /document%' THEN 'INCORRECT - needs fix'
         ELSE 'N/A'
       END as command_order_status
FROM leo_protocol_sections
WHERE section_type = 'common_commands';
