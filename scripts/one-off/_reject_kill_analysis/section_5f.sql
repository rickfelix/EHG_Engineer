SELECT id, name, workflow_status, status, metadata, updated_at
    FROM public.ventures
    WHERE name ILIKE '%PrivacyPatrol%'
    ORDER BY updated_at DESC
    LIMIT 5;
