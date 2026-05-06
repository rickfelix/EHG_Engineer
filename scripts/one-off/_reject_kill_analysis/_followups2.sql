-- venture_status_enum (status column) labels
SELECT 'venture_status_enum' AS enum_name, e.enumlabel, e.enumsortorder
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname = 'venture_status_enum'
ORDER BY e.enumsortorder;

-- Existing PrivacyPatrol AI venture: kill columns + status
SELECT id, name, status, workflow_status, killed_at, kill_reason,
       LENGTH(COALESCE(kill_reason, '')) AS kill_reason_len,
       deleted_at
FROM public.ventures
WHERE id = '08d20036-03c9-4a26-bbc5-f37a18dfdf23';

-- Look for SECURITY DEFINER funcs that call fn_is_chairman() (the canonical role check)
SELECT n.nspname AS schema, p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
  AND pg_get_functiondef(p.oid) ILIKE '%fn_is_chairman%'
  AND p.proname != 'fn_is_chairman'
ORDER BY p.proname
LIMIT 15;

-- Look for SECURITY DEFINER funcs that read raw_user_meta_data->>'role' (alternative role check)
SELECT n.nspname AS schema, p.proname, p.prosecdef
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
  AND p.prosecdef = true
  AND pg_get_functiondef(p.oid) ILIKE '%raw_user_meta_data%role%'
ORDER BY p.proname
LIMIT 10;

-- Inspect any function whose name suggests venture-kill/reject logic
SELECT n.nspname AS schema, p.proname, p.prosecdef,
       pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
  AND (p.proname ILIKE '%kill%' OR p.proname ILIKE '%reject%' OR p.proname ILIKE '%cancel%venture%')
ORDER BY p.proname
LIMIT 20;

-- Check audit_log + operations_audit_log shape (canonical audit pattern)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='operations_audit_log'
ORDER BY ordinal_position;
