-- Delete all manual UAT test cases
-- This migration removes manual test cases and keeps only automatic ones

DELETE FROM uat_cases
WHERE test_type = 'manual';

-- Show remaining test counts
SELECT
  test_type,
  COUNT(*) as count
FROM uat_cases
GROUP BY test_type
ORDER BY test_type;