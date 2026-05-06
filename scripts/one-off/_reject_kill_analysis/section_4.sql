SELECT a.attname AS column_name, format_type(a.atttypid, a.atttypmod) AS data_type
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey)
    WHERE i.indrelid='auth.users'::regclass AND i.indisprimary;
