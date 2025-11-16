-- Fix Invalid Priority Values
-- Generated: 2025-11-15T14:13:07.042Z

-- Strategic Directives: Normalize invalid priorities to medium
UPDATE strategic_directives_v2
SET priority = 'medium'
WHERE priority NOT IN ('critical', 'high', 'medium', 'low');