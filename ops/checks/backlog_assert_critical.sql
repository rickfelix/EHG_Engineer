\set ON_ERROR_STOP on

-- psql will substitute :ORPHAN_MAX and :PRD_MAX with numbers provided via -v
DO $$
DECLARE
  v_orphans  INTEGER := 0;
  v_bad_prds INTEGER := 0;
BEGIN
  -- Orphan backlog items (no PRD link) – adjust to your real backlog table (sd_backlog_map)
  SELECT COUNT(*) INTO v_orphans
  FROM sd_backlog_map b
  LEFT JOIN product_requirements_v2 p ON p.id = b.prd_id
  WHERE p.id IS NULL;

  -- PRD contract violations (sd link, completeness, risk enum, acceptance criteria)
  SELECT COUNT(*) INTO v_bad_prds
  FROM product_requirements_v2 p
  LEFT JOIN strategic_directives_v2 sd ON sd.id = p.sd_id
  WHERE sd.id IS NULL
     OR p.completeness_score IS NULL
     OR p.completeness_score < 0
     OR p.completeness_score > 100
     OR p.risk_rating NOT IN ('low','medium','high')
     OR p.acceptance_criteria_json IS NULL
     OR p.acceptance_criteria_json::text IN ('[]','{}');

  IF v_orphans > :ORPHAN_MAX THEN
    RAISE EXCEPTION 'Backlog orphans (% > %)', v_orphans, :ORPHAN_MAX;
  END IF;

  IF v_bad_prds > :PRD_MAX THEN
    RAISE EXCEPTION 'PRD contract violations (% > %)', v_bad_prds, :PRD_MAX;
  END IF;
END $$;