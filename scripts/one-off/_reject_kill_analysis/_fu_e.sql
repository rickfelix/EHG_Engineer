SELECT n.nspname AS schema, p.proname, p.prosecdef,
       pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
  AND (p.proname ILIKE '%kill%' OR p.proname ILIKE '%reject%' OR p.proname ILIKE '%cancel%venture%')
ORDER BY p.proname
LIMIT 25;
