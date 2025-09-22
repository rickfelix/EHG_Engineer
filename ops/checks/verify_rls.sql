-- Verify Row-Level Security (RLS) is enabled
-- Expected: All sensitive tables should have rowsecurity = true

SELECT
    schemaname,
    tablename,
    rowsecurity,
    CASE
        WHEN rowsecurity THEN '✓ Enabled'
        ELSE '✗ Disabled - SECURITY RISK'
    END as status
FROM pg_tables
WHERE schemaname IN ('eng', 'vh')
ORDER BY schemaname, tablename;

-- Summary by schema
SELECT
    schemaname,
    COUNT(*) as total_tables,
    COUNT(*) FILTER (WHERE rowsecurity = true) as rls_enabled,
    COUNT(*) FILTER (WHERE rowsecurity = false) as rls_disabled,
    CASE
        WHEN COUNT(*) FILTER (WHERE rowsecurity = false) = 0 THEN '✓ All Protected'
        ELSE '✗ ' || COUNT(*) FILTER (WHERE rowsecurity = false) || ' Unprotected Tables'
    END as security_status
FROM pg_tables
WHERE schemaname IN ('eng', 'vh')
GROUP BY schemaname
ORDER BY schemaname;