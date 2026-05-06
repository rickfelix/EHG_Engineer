SELECT event_type, COUNT(*) AS n
    FROM public.eva_events
    GROUP BY event_type
    ORDER BY n DESC
    LIMIT 30;
