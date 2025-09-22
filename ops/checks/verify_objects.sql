-- Verify database objects exist
-- Expected: eng, vh, audit, views schemas with appropriate tables

SELECT
    table_schema as schema,
    table_name as object,
    table_type as type
FROM information_schema.tables
WHERE table_schema IN ('eng', 'vh', 'audit', 'views')
  AND table_type IN ('BASE TABLE', 'VIEW')
ORDER BY table_schema, table_type, table_name;

-- Count objects by schema
SELECT
    table_schema,
    COUNT(*) FILTER (WHERE table_type = 'BASE TABLE') as tables,
    COUNT(*) FILTER (WHERE table_type = 'VIEW') as views
FROM information_schema.tables
WHERE table_schema IN ('eng', 'vh', 'audit', 'views')
GROUP BY table_schema
ORDER BY table_schema;