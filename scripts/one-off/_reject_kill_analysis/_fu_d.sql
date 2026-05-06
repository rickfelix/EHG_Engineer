SELECT n.nspname AS schema, p.proname, p.prosecdef
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
  AND p.prosecdef = true
  AND pg_get_functiondef(p.oid) ILIKE '%raw_user_meta_data%role%'
ORDER BY p.proname
LIMIT 15;
