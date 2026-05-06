SELECT con.conname, cls.relname AS child_table, pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con
    JOIN pg_class cls ON cls.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = cls.relnamespace
    WHERE con.contype='f' AND con.confrelid = 'public.ventures'::regclass
    ORDER BY cls.relname;
