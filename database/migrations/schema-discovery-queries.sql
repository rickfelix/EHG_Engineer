-- Schema Discovery Queries for User Story Compatibility
-- Run these in Supabase SQL Editor to understand current schema

-- 1. Strategic Directives V2 Schema
SELECT
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'strategic_directives_v2'
ORDER BY ordinal_position;

-- Check constraints and keys
SELECT
    tc.constraint_type,
    tc.constraint_name,
    kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'strategic_directives_v2';

-- Sample data
SELECT id, legacy_id, title, category, status, priority
FROM strategic_directives_v2
LIMIT 2;

-- 2. Product Requirements V2 Schema
SELECT
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'product_requirements_v2'
ORDER BY ordinal_position;

-- Sample to see what JSON fields exist
SELECT
    id,
    strategic_directive_id,
    title,
    jsonb_object_keys(to_jsonb(product_requirements_v2)) as all_keys
FROM product_requirements_v2
LIMIT 1;

-- 3. SD Backlog Map Schema
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'sd_backlog_map'
ORDER BY ordinal_position;

-- Check existing constraints
SELECT
    tc.constraint_type,
    tc.constraint_name,
    kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'sd_backlog_map';

-- 4. Check for test-related tables
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND (table_name LIKE '%test%' OR table_name LIKE '%prd%playwright%');

-- 5. Check RLS status
SELECT
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('strategic_directives_v2', 'product_requirements_v2', 'sd_backlog_map');

-- 6. Check existing views
SELECT viewname
FROM pg_views
WHERE schemaname = 'public'
AND viewname LIKE '%story%' OR viewname LIKE '%gate%';