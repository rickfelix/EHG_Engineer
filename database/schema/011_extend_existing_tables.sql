-- Extend Existing Tables for EHG Backlog Import
-- Non-breaking changes to preserve backward compatibility
-- Created: 2025-01-10

-- =============================================================================
-- A. Extend strategic_directives_v2 with backlog rollup fields
-- =============================================================================

ALTER TABLE strategic_directives_v2
  ADD COLUMN IF NOT EXISTS h_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS m_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS l_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS future_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS must_have_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wish_list_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS must_have_pct NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS rolled_triage TEXT,
  ADD COLUMN IF NOT EXISTS readiness NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS must_have_density NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS new_module_pct NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS import_run_id UUID,
  ADD COLUMN IF NOT EXISTS present_in_latest_import BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS sequence_rank INTEGER; -- Add if missing

-- Optional constraint for triage values
ALTER TABLE strategic_directives_v2
  DROP CONSTRAINT IF EXISTS chk_sd_v2_triage;
  
ALTER TABLE strategic_directives_v2
  ADD CONSTRAINT chk_sd_v2_triage
  CHECK (rolled_triage IS NULL OR rolled_triage IN ('High', 'Medium', 'Low', 'Future'));

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sd_v2_seq ON strategic_directives_v2(sequence_rank);
CREATE INDEX IF NOT EXISTS idx_sd_v2_triage ON strategic_directives_v2(rolled_triage);
CREATE INDEX IF NOT EXISTS idx_sd_v2_latest ON strategic_directives_v2(present_in_latest_import);
CREATE INDEX IF NOT EXISTS idx_sd_v2_priority ON strategic_directives_v2(must_have_pct DESC, sequence_rank ASC);
CREATE INDEX IF NOT EXISTS idx_sd_v2_import_run ON strategic_directives_v2(import_run_id);

-- =============================================================================
-- B. Create sd_backlog_map for item-level details
-- =============================================================================

CREATE TABLE IF NOT EXISTS sd_backlog_map (
  sd_id VARCHAR(50) REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
  backlog_id VARCHAR(100),
  backlog_title VARCHAR(500),
  description_raw TEXT,        -- From "Description" (tag source)
  item_description TEXT,       -- From "Description.1" (user-facing)
  my_comments TEXT,
  priority TEXT,
  stage_number INTEGER,
  phase TEXT,
  new_module BOOLEAN DEFAULT false,
  extras JSONB DEFAULT '{}'::jsonb,
  import_run_id UUID,
  present_in_latest_import BOOLEAN DEFAULT false,
  PRIMARY KEY (sd_id, backlog_id)
);

CREATE INDEX IF NOT EXISTS idx_sd_map_sd ON sd_backlog_map(sd_id);
CREATE INDEX IF NOT EXISTS idx_sd_map_import ON sd_backlog_map(import_run_id);
CREATE INDEX IF NOT EXISTS idx_sd_map_latest ON sd_backlog_map(present_in_latest_import);

-- =============================================================================
-- C. Extend product_requirements_v2 with Evidence Appendix
-- =============================================================================

ALTER TABLE product_requirements_v2
  ADD COLUMN IF NOT EXISTS evidence_appendix TEXT,
  ADD COLUMN IF NOT EXISTS backlog_items JSONB DEFAULT '[]'::jsonb;

-- =============================================================================
-- D. Compatibility View (optional - for backward compatibility)
-- =============================================================================

CREATE OR REPLACE VIEW strategic_directives_backlog AS
SELECT
  id AS sd_id,
  sequence_rank,
  title AS sd_title,
  category AS page_category,
  NULL AS page_title,  -- Add mapping if available
  (SELECT COUNT(*) FROM sd_backlog_map m WHERE m.sd_id = v2.id) AS total_items,
  h_count,
  m_count,
  l_count,
  future_count,
  must_have_count,
  wish_list_count,
  must_have_pct,
  rolled_triage,
  readiness,
  must_have_density,
  new_module_pct,
  metadata AS extras,
  import_run_id,
  present_in_latest_import,
  created_at,
  updated_at
FROM strategic_directives_v2 v2
WHERE import_run_id IS NOT NULL;  -- Only show imported SDs in this view

-- =============================================================================
-- E. PRD Generation View (updated to use existing tables)
-- =============================================================================

CREATE OR REPLACE VIEW v_prd_sd_payload AS
SELECT
  sd.id AS sd_id,
  sd.sequence_rank,
  sd.title AS sd_title,
  sd.category AS page_category,
  NULL AS page_title,  -- Add mapping if available
  sd.rolled_triage,
  (SELECT COUNT(*) FROM sd_backlog_map m WHERE m.sd_id = sd.id) AS total_items,
  sd.h_count,
  sd.m_count,
  sd.l_count,
  sd.future_count,
  sd.must_have_count,
  sd.wish_list_count,
  sd.must_have_pct,
  sd.readiness,
  sd.must_have_density,
  sd.new_module_pct,
  sd.metadata AS sd_extras,
  sd.import_run_id,
  COALESCE(
    json_agg(
      jsonb_build_object(
        'backlog_id',       m.backlog_id,
        'backlog_title',    m.backlog_title,
        'description_raw',  m.description_raw,
        'item_description', m.item_description,
        'my_comments',      m.my_comments,
        'priority',         m.priority,
        'stage_number',     m.stage_number,
        'phase',            m.phase,
        'new_module',       m.new_module,
        'extras',           m.extras
      )
      ORDER BY m.stage_number NULLS LAST, m.backlog_id
    ) FILTER (WHERE m.backlog_id IS NOT NULL),
    '[]'::json
  ) AS items
FROM strategic_directives_v2 sd
LEFT JOIN sd_backlog_map m ON m.sd_id = sd.id
WHERE sd.import_run_id IS NOT NULL  -- Only imported SDs
GROUP BY sd.id;

-- =============================================================================
-- F. Audit table remains the same
-- =============================================================================

-- Keep using the existing import_audit table created earlier

-- =============================================================================
-- G. Grant permissions
-- =============================================================================

GRANT ALL ON sd_backlog_map TO authenticated;
GRANT SELECT ON strategic_directives_backlog TO authenticated;
GRANT SELECT ON v_prd_sd_payload TO authenticated;