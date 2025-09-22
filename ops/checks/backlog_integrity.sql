-- SD governance metadata gaps
SELECT sd.sd_key, sd.owner, sd.decision_log_ref, sd.evidence_ref
FROM eng.strategic_directives_v2 sd
WHERE (sd.owner IS NULL OR sd.owner = '')
   OR (sd.decision_log_ref IS NULL OR sd.decision_log_ref = '')
   OR (sd.evidence_ref IS NULL OR sd.evidence_ref = '');

-- PRD contract issues
SELECT p.id AS prd_id, p.sd_id, p.completeness_score, p.risk_rating, p.acceptance_criteria_json
FROM eng.product_requirements_v2 p
LEFT JOIN eng.strategic_directives_v2 sd ON sd.id = p.sd_id
WHERE sd.id IS NULL
   OR p.completeness_score NOT BETWEEN 0 AND 100
   OR p.risk_rating NOT IN ('low','medium','high')
   OR p.acceptance_criteria_json IS NULL
   OR p.acceptance_criteria_json::text IN ('[]','{}');

-- Backlog shape problems (orphans/enums/qa floor)
SELECT b.id AS backlog_id, b.prd_id, b.type, b.state, b.priority, b.qa_gate_min
FROM eng.eng_backlog b
LEFT JOIN eng.product_requirements_v2 p ON p.id = b.prd_id
WHERE p.id IS NULL
   OR b.type IS NULL
   OR b.state IS NULL
   OR b.priority NOT IN ('P0','P1','P2','P3')
   OR b.qa_gate_min IS NULL;

-- Traceability gaps (SD→PRD→Backlog + commit/PR linkage)
SELECT t.sd_id, t.prd_id, t.backlog_id, t.commit_sha, t.pr_url
FROM v_eng_trace t
WHERE t.sd_id IS NULL OR t.prd_id IS NULL OR t.backlog_id IS NULL
   OR t.commit_sha IS NULL OR t.pr_url IS NULL;