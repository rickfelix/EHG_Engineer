SELECT n.nspname AS schema, p.proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname ILIKE '%sd_completed%'
       OR p.proname ILIKE '%venture_killed%'
       OR p.proname ILIKE '%venture_status%'
       OR p.proname ILIKE '%workflow_status%'
    ORDER BY p.proname;
