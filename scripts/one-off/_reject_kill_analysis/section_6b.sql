SELECT n.nspname || '.' || p.proname AS qualified, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef = true
      AND n.nspname='public'
      AND pg_get_functiondef(p.oid) ILIKE '%auth.jwt()%'
    ORDER BY p.proname
    LIMIT 3;
