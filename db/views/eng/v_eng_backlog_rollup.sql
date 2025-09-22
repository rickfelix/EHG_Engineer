CREATE OR REPLACE VIEW v_eng_backlog_rollup AS
SELECT
    prd.sd_id                   AS sd_id,
    bl.id                       AS item_id,
    bl.type,
    bl.qa_gate_min,
    CASE bl.state
        WHEN 'done' THEN 100
        WHEN 'doing' THEN 50
        WHEN 'blocked' THEN 10
        ELSE 0
    END                         AS readiness_score
FROM eng_backlog bl
JOIN product_requirements_v2 prd
  ON bl.prd_id = prd.prd_uuid;
