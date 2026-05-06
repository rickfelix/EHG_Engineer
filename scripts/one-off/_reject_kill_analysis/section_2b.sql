SELECT n.nspname AS schema, p.proname, p.prosrc IS NOT NULL AS has_body
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname ILIKE '%sd_completed%'
       OR p.proname ILIKE '%venture_killed%'
       OR p.proname ILIKE '%venture_status%'
       OR p.proname ILIKE '%workflow_status%'
    ORDER BY p.proname;
