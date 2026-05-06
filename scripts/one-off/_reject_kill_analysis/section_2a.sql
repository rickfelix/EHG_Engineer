SELECT t.tgname, t.tgenabled,
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
