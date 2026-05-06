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
