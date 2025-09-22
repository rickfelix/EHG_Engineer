CREATE OR REPLACE VIEW v_vh_governance_snapshot AS
SELECT
    v.id AS venture_id,
    COALESCE(v.sd_id, trace.sd_id)         AS sd_id,
    COALESCE(v.prd_id, trace.prd_id)       AS prd_id,
    COALESCE(v.backlog_id, trace.backlog_id) AS backlog_id,
    COALESCE(v.gate_status, trace.gate_status, 'pending') AS gate_status,
    NOW()::timestamptz AS last_sync_at
FROM vh_ventures v
LEFT JOIN LATERAL (
    SELECT t.sd_id, t.prd_id, t.backlog_id, t.commit_sha, t.pr_url, t.gate_status
    FROM vh_ingest.eng_trace t
    WHERE (v.prd_id IS NOT NULL AND t.prd_id = v.prd_id)
       OR (v.sd_id IS NOT NULL AND t.sd_id = v.sd_id)
    ORDER BY t.prd_id IS NOT NULL DESC
    LIMIT 1
) trace ON TRUE;
