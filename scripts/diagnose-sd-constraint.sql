-- Diagnostic script to check actual constraint in database
-- Run this with: psql $DATABASE_URL -f scripts/diagnose-sd-constraint.sql

\echo '=== Strategic Directives V2 Constraint Diagnosis ==='
\echo ''

\echo '1. Table structure and constraints:'
\d+ strategic_directives_v2

\echo ''
\echo '2. Specific check constraints:'
SELECT
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'strategic_directives_v2'::regclass
  AND contype = 'c'  -- check constraints
ORDER BY conname;

\echo ''
\echo '3. Triggers on strategic_directives_v2:'
SELECT
  tgname AS trigger_name,
  proname AS function_name,
  tgtype AS trigger_type
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE tgrelid = 'strategic_directives_v2'::regclass
ORDER BY tgname;

\echo ''
\echo '4. Current unique status values in table:'
SELECT DISTINCT status, COUNT(*) as count
FROM strategic_directives_v2
GROUP BY status
ORDER BY status;

\echo ''
\echo '5. SDs with progress = 100:'
SELECT sd_key, sd_id, status, progress, title
FROM strategic_directives_v2
WHERE progress = 100
LIMIT 5;
