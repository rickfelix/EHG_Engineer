-- Migration: Fix command flow order - document before ship
-- Date: 2026-01-23
-- Purpose: Update the command ecosystem flow to place /document before /ship
-- Rationale: Documentation should be included in the PR, not created after shipping

-- Update the skill_intent_detection section to fix the command flow
UPDATE leo_protocol_sections
SET content = REPLACE(
  content,
  'SD Complete → /restart (if UI) → /uat → /ship → /document → /learn → /leo next',
  'SD Complete → /restart (if UI) → /uat → /document → /ship → /learn → /leo next'
)
WHERE section_type = 'skill_intent_detection'
  AND content LIKE '%/ship → /document%';

-- Verify the update
SELECT section_type,
       CASE
         WHEN content LIKE '%/document → /ship%' THEN 'CORRECT'
         WHEN content LIKE '%/ship → /document%' THEN 'INCORRECT - needs fix'
         ELSE 'N/A'
       END as command_order_status
FROM leo_protocol_sections
WHERE section_type = 'skill_intent_detection';
