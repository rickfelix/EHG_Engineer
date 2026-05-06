SELECT table_name
    FROM information_schema.tables
    WHERE table_schema='public'
      AND (table_name LIKE '%_log' OR table_name LIKE '%_audit' OR table_name LIKE '%_history' OR table_name LIKE '%_events')
    ORDER BY table_name;
