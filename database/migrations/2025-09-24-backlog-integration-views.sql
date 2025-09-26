-- Backlog Integration Views Migration
-- Purpose: Create application-specific views for backlog data integration
-- Target: EHG_ENGINEER application infrastructure
-- Date: 2025-09-24

-- Drop existing views if they exist
DROP VIEW IF EXISTS v_ehg_engineer_backlog CASCADE;
DROP VIEW IF EXISTS v_ehg_backlog CASCADE;
DROP VIEW IF EXISTS v_backlog_validation CASCADE;

-- ============================================================
-- View 1: EHG_ENGINEER Backlog Items
-- Purpose: Filter backlog items for EHG_Engineer development platform
-- ============================================================
CREATE OR REPLACE VIEW v_ehg_engineer_backlog AS
SELECT
  b.backlog_id,
  b.backlog_title,
  b.description_raw,
  b.item_description,
  b.my_comments,
  b.priority,
  b.stage_number,
  b.phase,
  b.new_module,
  b.extras,
  b.sd_id,
  sd.title as sd_title,
  sd.priority as sd_priority,
  sd.status as sd_status,
  sd.target_application,
  -- Calculated fields
  CASE
    WHEN b.priority = 'Critical' THEN 1
    WHEN b.priority = 'High' THEN 2
    WHEN b.priority = 'Medium' THEN 3
    WHEN b.priority = 'Low' THEN 4
    ELSE 5
  END as priority_rank,
  -- Completion tracking
  b.completion_status,
  b.completed_by_sd,
  b.completed_by_prd,
  b.completion_date
FROM sd_backlog_map b
INNER JOIN strategic_directives_v2 sd ON b.sd_id = sd.id
WHERE sd.target_application = 'EHG_ENGINEER'
ORDER BY priority_rank, b.stage_number;

COMMENT ON VIEW v_ehg_engineer_backlog IS 'Backlog items specific to EHG_Engineer development platform';

-- ============================================================
-- View 2: EHG Business Application Backlog Items
-- Purpose: Filter backlog items for EHG business application
-- ============================================================
CREATE OR REPLACE VIEW v_ehg_backlog AS
SELECT
  b.backlog_id,
  b.backlog_title,
  b.description_raw,
  b.item_description,
  b.my_comments,
  b.priority,
  b.stage_number,
  b.phase,
  b.new_module,
  b.extras,
  b.sd_id,
  sd.title as sd_title,
  sd.priority as sd_priority,
  sd.status as sd_status,
  COALESCE(sd.target_application, 'EHG') as target_application,
  -- Calculated fields
  CASE
    WHEN b.priority = 'Critical' THEN 1
    WHEN b.priority = 'High' THEN 2
    WHEN b.priority = 'Medium' THEN 3
    WHEN b.priority = 'Low' THEN 4
    ELSE 5
  END as priority_rank,
  -- Completion tracking
  b.completion_status,
  b.completed_by_sd,
  b.completed_by_prd,
  b.completion_date
FROM sd_backlog_map b
INNER JOIN strategic_directives_v2 sd ON b.sd_id = sd.id
WHERE sd.target_application = 'EHG'
   OR sd.target_application IS NULL
ORDER BY priority_rank, b.stage_number;

COMMENT ON VIEW v_ehg_backlog IS 'Backlog items specific to EHG business application';

-- ============================================================
-- View 3: Backlog Validation and Cross-Reference Analysis
-- Purpose: Detect potential application boundary violations
-- ============================================================
CREATE OR REPLACE VIEW v_backlog_validation AS
SELECT
  sd.id as sd_id,
  sd.title as sd_title,
  sd.target_application,
  sd.status as sd_status,
  COUNT(b.backlog_id) as total_items,
  COUNT(CASE WHEN b.priority = 'Critical' THEN 1 END) as critical_items,
  COUNT(CASE WHEN b.priority = 'High' THEN 1 END) as high_items,
  COUNT(CASE WHEN b.completion_status = 'completed' THEN 1 END) as completed_items,
  -- Cross-application detection
  COUNT(CASE
    WHEN sd.target_application = 'EHG_ENGINEER'
     AND (b.item_description ILIKE '%EHG %'
      OR b.item_description ILIKE '%business%'
      OR b.item_description ILIKE '%venture%'
      OR b.item_description ILIKE '%customer%')
     AND b.item_description NOT ILIKE '%EHG_Engineer%'
    THEN 1
  END) as potential_ehg_in_engineer,
  COUNT(CASE
    WHEN (sd.target_application = 'EHG' OR sd.target_application IS NULL)
     AND (b.item_description ILIKE '%EHG_Engineer%'
      OR b.item_description ILIKE '%LEO Protocol%'
      OR b.item_description ILIKE '%Claude Code%'
      OR b.item_description ILIKE '%development workflow%')
    THEN 1
  END) as potential_engineer_in_ehg,
  -- Summary metrics
  ROUND(
    COUNT(CASE WHEN b.completion_status = 'completed' THEN 1 END)::NUMERIC /
    NULLIF(COUNT(b.backlog_id), 0) * 100,
    2
  ) as completion_percentage,
  MAX(b.completion_date) as last_completion_date
FROM strategic_directives_v2 sd
LEFT JOIN sd_backlog_map b ON sd.id = b.sd_id
GROUP BY sd.id, sd.title, sd.target_application, sd.status
ORDER BY
  CASE
    WHEN potential_ehg_in_engineer > 0 OR potential_engineer_in_ehg > 0 THEN 0
    ELSE 1
  END,
  total_items DESC;

COMMENT ON VIEW v_backlog_validation IS 'Validation view to detect potential application boundary violations and track completion';

-- ============================================================
-- Indexes for Performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_sd_backlog_map_sd_id
  ON sd_backlog_map(sd_id);

CREATE INDEX IF NOT EXISTS idx_sd_backlog_map_priority
  ON sd_backlog_map(priority);

CREATE INDEX IF NOT EXISTS idx_sd_backlog_map_completion
  ON sd_backlog_map(completion_status);

CREATE INDEX IF NOT EXISTS idx_strategic_directives_target_app
  ON strategic_directives_v2(target_application);

-- ============================================================
-- Grant Permissions
-- ============================================================
GRANT SELECT ON v_ehg_engineer_backlog TO authenticated;
GRANT SELECT ON v_ehg_backlog TO authenticated;
GRANT SELECT ON v_backlog_validation TO authenticated;

-- ============================================================
-- Verification Queries
-- ============================================================
-- Test query 1: Count items per application
SELECT
  'EHG_ENGINEER' as application,
  COUNT(*) as backlog_count
FROM v_ehg_engineer_backlog
UNION ALL
SELECT
  'EHG' as application,
  COUNT(*) as backlog_count
FROM v_ehg_backlog;

-- Test query 2: Check for potential violations
SELECT
  sd_id,
  sd_title,
  target_application,
  potential_ehg_in_engineer,
  potential_engineer_in_ehg
FROM v_backlog_validation
WHERE potential_ehg_in_engineer > 0
   OR potential_engineer_in_ehg > 0;