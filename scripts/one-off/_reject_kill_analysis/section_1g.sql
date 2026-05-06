SELECT workflow_status, COUNT(*) AS n
    FROM public.ventures
    GROUP BY workflow_status
    ORDER BY n DESC;
