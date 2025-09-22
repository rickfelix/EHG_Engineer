CREATE OR REPLACE VIEW v_eng_trace AS
SELECT
    sd.sd_uuid        AS sd_id,
    prd.prd_uuid      AS prd_id,
    bl.id             AS backlog_id,
    COALESCE(bl.commit_sha, prd.commit_sha) AS commit_sha,
    COALESCE(bl.pr_url, prd.pr_url)         AS pr_url,
    bl.gate_status    AS gate_status
FROM strategic_directives_v2 sd
LEFT JOIN product_requirements_v2 prd
       ON prd.sd_id = sd.sd_uuid
LEFT JOIN eng_backlog bl
       ON bl.prd_id = prd.prd_uuid;
