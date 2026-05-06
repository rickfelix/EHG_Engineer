SELECT 'venture_status_enum' AS enum_name, e.enumlabel, e.enumsortorder
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname = 'venture_status_enum'
ORDER BY e.enumsortorder;
