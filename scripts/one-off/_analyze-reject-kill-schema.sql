-- Read-only schema-impact analysis for SD-LEO-FEAT-STAGE-REJECT-KILL-001
-- Routed via `supabase db query --linked --file` (canonical Windows apply path).
-- NO MIGRATIONS APPLIED. Selects only.

\echo '========== [1a] ventures.workflow_status column type =========='
SELECT c.table_schema, c.table_name, c.column_name, c.data_type,
       c.udt_schema, c.udt_name, c.is_nullable, c.column_default
FROM information_schema.columns c
WHERE c.table_schema='public' AND c.table_name='ventures' AND c.column_name='workflow_status';

\echo '========== [1b] enum labels for the udt =========='
SELECT t.typname, e.enumlabel, e.enumsortorder
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE t.typname IN (
  SELECT udt_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='ventures' AND column_name='workflow_status'
)
ORDER BY e.enumsortorder;

\echo '========== [1c] CHECK constraints on ventures referencing workflow_status =========='
SELECT con.conname, pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class cls ON cls.oid = con.conrelid
JOIN pg_namespace n ON n.oid = cls.relnamespace
WHERE n.nspname='public' AND cls.relname='ventures' AND con.contype='c'
  AND pg_get_constraintdef(con.oid) ILIKE '%workflow_status%';

\echo '========== [1d] domain definitions if any =========='
SELECT d.typname AS domain_name, t.typname AS base_type, pg_get_constraintdef(c.oid) AS check_def
FROM pg_type d
JOIN pg_type t ON t.oid = d.typbasetype
LEFT JOIN pg_constraint c ON c.contypid = d.oid
WHERE d.typtype='d' AND d.typname IN (
  SELECT udt_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='ventures' AND column_name='workflow_status'
);

\echo '========== [1e] partial indexes on ventures referencing workflow_status =========='
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='public' AND tablename='ventures' AND indexdef ILIKE '%workflow_status%';

\echo '========== [1f] views referencing ventures + workflow_status =========='
SELECT schemaname, viewname
FROM pg_views
WHERE definition ILIKE '%workflow_status%' AND definition ILIKE '%ventures%'
ORDER BY schemaname, viewname;

\echo '========== [1g] distinct workflow_status values currently in use =========='
SELECT workflow_status, COUNT(*) AS n
FROM public.ventures
GROUP BY workflow_status
ORDER BY n DESC;

\echo '========== [2a] Triggers on public.ventures =========='
SELECT t.tgname,
       t.tgenabled,
       pg_get_triggerdef(t.oid) AS definition,
       p.proname AS func_name,
       n2.nspname AS func_schema
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
JOIN pg_namespace n2 ON n2.oid = p.pronamespace
WHERE NOT t.tgisinternal AND n.nspname='public' AND c.relname='ventures'
ORDER BY t.tgname;

\echo '========== [2b] Trigger function bodies (ventures + sd_completed family) =========='
SELECT n.nspname AS schema, p.proname, pg_get_functiondef(p.oid) AS def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname ILIKE '%sd_completed%'
   OR p.proname ILIKE '%venture_killed%'
   OR p.proname ILIKE '%venture_status%'
   OR p.proname ILIKE '%workflow_status%'
ORDER BY p.proname;

\echo '========== [2c] FK references INTO ventures.id =========='
SELECT con.conname, cls.relname AS child_table, pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class cls ON cls.oid = con.conrelid
JOIN pg_namespace n ON n.oid = cls.relnamespace
WHERE con.contype='f' AND con.confrelid = 'public.ventures'::regclass
ORDER BY cls.relname;

\echo '========== [3a] eva_events CHECK constraints (chk_event_type focus) =========='
SELECT con.conname, pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class cls ON cls.oid = con.conrelid
JOIN pg_namespace n ON n.oid = cls.relnamespace
WHERE n.nspname='public' AND cls.relname='eva_events' AND con.contype='c'
ORDER BY con.conname;

\echo '========== [3b] eva_events column inventory =========='
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='eva_events'
ORDER BY ordinal_position;

\echo '========== [3c] distinct event_type currently in eva_events =========='
SELECT event_type, COUNT(*) AS n
FROM public.eva_events
GROUP BY event_type
ORDER BY n DESC
LIMIT 30;

\echo '========== [4] auth.users PK type =========='
SELECT a.attname AS column_name, format_type(a.atttypid, a.atttypmod) AS data_type
FROM pg_index i
JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey)
WHERE i.indrelid='auth.users'::regclass AND i.indisprimary;

\echo '========== [5a] ventures column inventory (look for killed_at / kill_reason) =========='
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='ventures'
ORDER BY ordinal_position;

\echo '========== [5b] PrivacyPatrol AI venture lookup =========='
SELECT id, name, workflow_status, status, created_at, updated_at
FROM public.ventures
WHERE name ILIKE '%PrivacyPatrol%'
ORDER BY updated_at DESC
LIMIT 10;

\echo '========== [5c] ventures with kill-like columns / signals =========='
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='ventures'
  AND column_name IN ('killed_at','kill_reason','rejected_at','reject_reason','status_reason','cancellation_reason','cancelled_at','rejected_by_user_id','killed_by_user_id');

\echo '========== [5d] chairman lookup by email =========='
SELECT id, email,
       raw_user_meta_data->>''role'' AS meta_role,
       raw_app_meta_data->>''role'' AS app_role,
       created_at
FROM auth.users
WHERE email = 'rickfelix2000@gmail.com'
LIMIT 5;

\echo '========== [5e] users with chairman/lead role =========='
SELECT id, email,
       raw_user_meta_data->>''role'' AS meta_role,
       raw_app_meta_data->>''role'' AS app_role
FROM auth.users
WHERE raw_user_meta_data->>'role' IN ('chairman','lead')
   OR raw_app_meta_data->>'role' IN ('chairman','lead')
ORDER BY created_at
LIMIT 10;

\echo '========== [6a] SECURITY DEFINER funcs that reference auth.jwt() =========='
SELECT n.nspname AS schema, p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosecdef = true
  AND n.nspname='public'
  AND pg_get_functiondef(p.oid) ILIKE '%auth.jwt()%'
ORDER BY p.proname
LIMIT 30;

\echo '========== [6b] full body of canonical SECURITY DEFINER+auth.jwt() funcs (top 6) =========='
SELECT n.nspname || '.' || p.proname AS qualified, pg_get_functiondef(p.oid) AS def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosecdef = true
  AND n.nspname='public'
  AND pg_get_functiondef(p.oid) ILIKE '%auth.jwt()%'
ORDER BY p.proname
LIMIT 6;

\echo '========== [6c] RLS policies (INSERT/ALL) sample =========='
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND (cmd='INSERT' OR cmd='ALL')
ORDER BY tablename, policyname
LIMIT 30;

\echo '========== [6d] audit-style table names (for naming convention) =========='
SELECT table_name
FROM information_schema.tables
WHERE table_schema='public'
  AND (table_name LIKE '%_log' OR table_name LIKE '%_audit' OR table_name LIKE '%_history' OR table_name LIKE '%_events')
ORDER BY table_name;
