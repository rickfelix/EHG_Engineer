-- Verify UAT data was seeded correctly

-- Count test cases
SELECT
  'Test Cases' as entity,
  COUNT(*) as total_count
FROM uat_cases

UNION ALL

-- Count by section
SELECT
  'Section: ' || section as entity,
  COUNT(*) as total_count
FROM uat_cases
GROUP BY section

UNION ALL

-- Count by priority
SELECT
  'Priority: ' || priority as entity,
  COUNT(*) as total_count
FROM uat_cases
GROUP BY priority

ORDER BY entity;