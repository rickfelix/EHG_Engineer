-- Set Defaults for Missing Required Fields
-- Generated: 2025-11-15T14:13:07.044Z

-- Strategic Directives: Generate titles from id
UPDATE strategic_directives_v2
SET title = CONCAT('Strategic Directive: ', id)
WHERE title IS NULL OR title = '';

-- Product Requirements: Generate titles from directive
UPDATE product_requirements_v2 prd
SET title = CONCAT(sd.title, ' - PRD')
FROM strategic_directives_v2 sd
WHERE prd.directive_id = sd.id
  AND (prd.title IS NULL OR prd.title = '');