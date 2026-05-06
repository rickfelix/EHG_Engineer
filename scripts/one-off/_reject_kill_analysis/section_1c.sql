SELECT con.conname, pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con
    JOIN pg_class cls ON cls.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = cls.relnamespace
    WHERE n.nspname='public' AND cls.relname='ventures' AND con.contype='c'
      AND pg_get_constraintdef(con.oid) ILIKE '%workflow_status%';
