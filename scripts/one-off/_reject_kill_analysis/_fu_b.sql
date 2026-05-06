SELECT id, name, status, workflow_status, killed_at, kill_reason,
       LENGTH(COALESCE(kill_reason, '')) AS kill_reason_len,
       deleted_at
FROM public.ventures
WHERE id = '08d20036-03c9-4a26-bbc5-f37a18dfdf23';
