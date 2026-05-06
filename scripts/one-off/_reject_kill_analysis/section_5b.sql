SELECT id, name, workflow_status, status, created_at, updated_at
    FROM public.ventures
    WHERE name ILIKE '%PrivacyPatrol%'
    ORDER BY updated_at DESC
    LIMIT 10;
