SELECT c.table_schema, c.table_name, c.column_name, c.data_type,
           c.udt_schema, c.udt_name, c.is_nullable, c.column_default
    FROM information_schema.columns c
    WHERE c.table_schema='public' AND c.table_name='ventures' AND c.column_name='workflow_status';
