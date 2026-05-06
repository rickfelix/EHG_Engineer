SELECT schemaname, viewname
    FROM pg_views
    WHERE definition ILIKE '%workflow_status%' AND definition ILIKE '%ventures%'
    ORDER BY schemaname, viewname;
