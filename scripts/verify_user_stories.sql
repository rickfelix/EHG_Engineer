-- Comprehensive verification script for user stories
-- Run this after migration to ensure everything is correct

\echo 'Starting comprehensive user story verification...'

-- 1. Check table structure
\echo '1. Checking table structure...'
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'sd_backlog_map'
AND column_name IN ('item_type', 'parent_id', 'sequence_no',
                    'acceptance_criteria', 'verification_status',
                    'verification_source', 'last_verified_at', 'import_run_id')
ORDER BY ordinal_position;

-- 2. Check constraints
\echo '2. Checking constraints...'
SELECT conname, contype,
       pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conrelid = 'sd_backlog_map'::regclass
AND conname IN ('uk_sd_backlog_map_sd_backlog', 'fk_sd_backlog_map_sd_id');

-- 3. Check indexes
\echo '3. Checking indexes...'
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'sd_backlog_map'
AND indexname IN ('idx_story_list', 'idx_backlog_parent', 'idx_backlog_verification');

-- 4. Check views
\echo '4. Checking views...'
SELECT viewname, definition
FROM pg_views
WHERE viewname IN ('v_story_verification_status', 'v_sd_release_gate');

-- 5. Check function
\echo '5. Checking function...'
SELECT routine_name, data_type, routine_definition
FROM information_schema.routines
WHERE routine_name = 'fn_generate_stories_from_prd';

-- 6. Check permissions
\echo '6. Checking permissions...'
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_name = 'fn_generate_stories_from_prd';

-- 7. Test function execution
\echo '7. Testing function execution...'
SELECT fn_generate_stories_from_prd(
  'SD-TEST-001',
  'PRD-TEST-001'::uuid,
  'dry_run'
) AS test_result;

-- 8. Performance check
\echo '8. Checking query performance...'
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM v_story_verification_status
WHERE sd_key = 'SD-TEST-001'
ORDER BY sequence_no
LIMIT 20;

\echo 'Verification complete!'