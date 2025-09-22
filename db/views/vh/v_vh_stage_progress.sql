CREATE OR REPLACE VIEW v_vh_stage_progress AS
WITH governance AS (
    SELECT venture_id, sd_id FROM v_vh_governance_snapshot
)
SELECT
    v.id AS venture_id,
    stage.key::text AS stage,
    (COALESCE((stage.value->>'qa_score')::NUMERIC, 0) >= COALESCE(roll.qa_gate_min, 0)) AS gate_met,
    COALESCE(roll.qa_gate_min, 0) AS qa_gate_min
FROM vh_ventures v
LEFT JOIN governance g ON g.venture_id = v.id
LEFT JOIN LATERAL jsonb_each(v.stage_progress) AS stage(key, value) ON TRUE
LEFT JOIN LATERAL (
    SELECT MAX(r.qa_gate_min) AS qa_gate_min
    FROM v_eng_backlog_rollup r
    WHERE r.sd_id = g.sd_id
) roll ON TRUE;
