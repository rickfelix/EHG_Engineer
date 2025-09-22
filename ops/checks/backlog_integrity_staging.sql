-- Backlog Integrity Checks for STAGING
-- Targeting REAL schema: sd_backlog_map, strategic_directives_v2, product_requirements_v2
-- With user's 3 edits applied:
--   1. Check governance fields: owner, decision_log_ref, evidence_ref
--   2. Check PRD contract fields: completeness_score, risk_rating, acceptance_criteria_json
--   3. Accept both priority vocabularies: P0-P3 OR High/Medium/Low

-- 1. SD Metadata Gaps (governance contract)
\copy (
  SELECT 
    sd.sd_key,
    sd.title,
    CASE 
      WHEN sd.owner IS NULL THEN 'missing_owner'
      WHEN sd.decision_log_ref IS NULL THEN 'missing_decision_log'
      WHEN sd.evidence_ref IS NULL THEN 'missing_evidence'
      ELSE 'unknown_gap'
    END as gap_type,
    sd.status,
    sd.created_at
  FROM strategic_directives_v2 sd
  WHERE sd.owner IS NULL 
     OR sd.decision_log_ref IS NULL 
     OR sd.evidence_ref IS NULL
  ORDER BY sd.created_at DESC
) TO 'sd_metadata_gaps.csv' WITH CSV HEADER;

-- 2. PRD Contract Gaps
\copy (
  SELECT 
    pr.prd_id,
    pr.title,
    CASE
      WHEN pr.completeness_score IS NULL THEN 'missing_completeness_score'
      WHEN pr.completeness_score < 0 OR pr.completeness_score > 100 THEN 'invalid_completeness_score'
      WHEN pr.risk_rating IS NULL THEN 'missing_risk_rating'
      WHEN pr.risk_rating NOT IN ('low', 'medium', 'high') THEN 'invalid_risk_rating'
      WHEN pr.acceptance_criteria_json IS NULL THEN 'missing_acceptance_criteria'
      WHEN pr.acceptance_criteria_json::text = '[]' THEN 'empty_acceptance_criteria'
      ELSE 'unknown_gap'
    END as gap_type,
    pr.completeness_score,
    pr.risk_rating,
    pr.created_at
  FROM product_requirements_v2 pr
  WHERE pr.completeness_score IS NULL 
     OR pr.completeness_score < 0 
     OR pr.completeness_score > 100
     OR pr.risk_rating IS NULL
     OR pr.risk_rating NOT IN ('low', 'medium', 'high')
     OR pr.acceptance_criteria_json IS NULL
     OR pr.acceptance_criteria_json::text = '[]'
  ORDER BY pr.created_at DESC
) TO 'prd_contract_gaps.csv' WITH CSV HEADER;

-- 3. Backlog Shape Issues (with BOTH priority vocabularies)
\copy (
  SELECT 
    b.backlog_id,
    b.title,
    b.priority,
    CASE
      WHEN b.priority IS NULL THEN 'missing_priority'
      -- Accept BOTH vocabularies to avoid false positives
      WHEN b.priority NOT IN ('P0', 'P1', 'P2', 'P3', 'High', 'Medium', 'Low') THEN 'invalid_priority'
      WHEN b.story_points IS NULL THEN 'missing_story_points'
      WHEN b.story_points <= 0 OR b.story_points > 21 THEN 'invalid_story_points'
      WHEN b.description IS NULL OR LENGTH(TRIM(b.description)) = 0 THEN 'missing_description'
      ELSE 'unknown_issue'
    END as issue_type,
    b.story_points,
    b.created_at
  FROM sd_backlog_map b
  WHERE b.priority IS NULL 
     OR b.priority NOT IN ('P0', 'P1', 'P2', 'P3', 'High', 'Medium', 'Low')
     OR b.story_points IS NULL
     OR b.story_points <= 0
     OR b.story_points > 21
     OR b.description IS NULL
     OR LENGTH(TRIM(b.description)) = 0
  ORDER BY b.created_at DESC
) TO 'backlog_shape_issues.csv' WITH CSV HEADER;

-- 4. Traceability Gaps (if view exists)
-- This might fail if v_eng_trace doesn't exist yet, which is OK
\copy (
  SELECT 
    b.backlog_id,
    b.title,
    'orphaned_backlog_item' as gap_type,
    b.created_at
  FROM sd_backlog_map b
  LEFT JOIN strategic_directives_v2 sd ON b.sd_key = sd.sd_key
  WHERE sd.sd_key IS NULL
  ORDER BY b.created_at DESC
) TO 'traceability_gaps.csv' WITH CSV HEADER;

-- Summary output
\echo 'Backlog integrity checks complete. CSV reports generated.'