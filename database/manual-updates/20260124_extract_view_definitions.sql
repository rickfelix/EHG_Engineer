-- ==============================================================================
-- EXTRACT ACTUAL VIEW DEFINITIONS
-- ==============================================================================
-- Run this in Supabase SQL Editor to get the real view definitions
-- Then we can modify them to remove legacy_id references
-- ==============================================================================

-- Get all view definitions that reference legacy_id
SELECT
    c.relname as view_name,
    CASE c.relkind
        WHEN 'v' THEN 'VIEW'
        WHEN 'm' THEN 'MATERIALIZED VIEW'
    END as view_type,
    pg_get_viewdef(c.oid, true) as view_definition
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
AND c.relkind IN ('v', 'm')
AND pg_get_viewdef(c.oid, true) LIKE '%legacy_id%'
ORDER BY c.relkind, c.relname;
