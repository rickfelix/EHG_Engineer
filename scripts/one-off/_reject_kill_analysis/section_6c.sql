SELECT schemaname, tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname='public' AND (cmd='INSERT' OR cmd='ALL')
    ORDER BY tablename, policyname
    LIMIT 30;
