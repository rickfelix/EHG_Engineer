SELECT t.typname, e.enumlabel, e.enumsortorder
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname IN (
      SELECT udt_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='ventures' AND column_name='workflow_status'
    )
    ORDER BY e.enumsortorder;
