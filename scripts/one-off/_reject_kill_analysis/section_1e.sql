SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname='public' AND tablename='ventures' AND indexdef ILIKE '%workflow_status%';
