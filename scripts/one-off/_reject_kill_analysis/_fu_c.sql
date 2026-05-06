SELECT n.nspname AS schema, p.proname, p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
  AND pg_get_functiondef(p.oid) ILIKE '%fn_is_chairman%'
  AND p.proname != 'fn_is_chairman'
ORDER BY p.proname
LIMIT 20;
