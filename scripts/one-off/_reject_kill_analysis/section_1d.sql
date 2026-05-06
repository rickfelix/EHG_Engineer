SELECT d.typname AS domain_name, t.typname AS base_type, pg_get_constraintdef(c.oid) AS check_def
    FROM pg_type d
    JOIN pg_type t ON t.oid = d.typbasetype
    LEFT JOIN pg_constraint c ON c.contypid = d.oid
    WHERE d.typtype='d' AND d.typname IN (
      SELECT udt_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='ventures' AND column_name='workflow_status'
    );
