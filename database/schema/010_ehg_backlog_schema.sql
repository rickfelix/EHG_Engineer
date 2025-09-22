-- EHG Backlog Import Schema
-- Non-lossy import with lifecycle management
-- Created: 2025-01-10

-- Strategic Directives from Backlog
CREATE TABLE IF NOT EXISTS strategic_directives_backlog (
  sd_id VARCHAR(100) PRIMARY KEY,
  sequence_rank INTEGER NOT NULL,
  sd_title VARCHAR(500) NOT NULL,
  page_category VARCHAR(100),
  page_title VARCHAR(200),
  total_items INTEGER DEFAULT 0,
  h_count INTEGER DEFAULT 0,
  m_count INTEGER DEFAULT 0,
  l_count INTEGER DEFAULT 0,
  future_count INTEGER DEFAULT 0,
  must_have_count INTEGER DEFAULT 0,
  wish_list_count INTEGER DEFAULT 0,
  must_have_pct DECIMAL(5,2),
  rolled_triage VARCHAR(20), -- 'High', 'Medium', 'Low', 'Future'
  readiness DECIMAL(10,2),
  must_have_density DECIMAL(10,2),
  new_module_pct DECIMAL(10,2),
  previous_sd_id VARCHAR(100),
  extras JSONB DEFAULT '{}'::jsonb,
  import_metadata JSONB DEFAULT '{}'::jsonb,
  -- Lifecycle management
  import_run_id UUID,
  present_in_latest_import BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Backlog Items Mapping
CREATE TABLE IF NOT EXISTS sd_backlog_map (
  sd_id VARCHAR(100) REFERENCES strategic_directives_backlog(sd_id) ON DELETE CASCADE,
  backlog_id VARCHAR(100),
  backlog_title VARCHAR(500),
  description_raw TEXT,        -- From "Description" for tag parsing
  item_description TEXT,       -- From "Description.1" actual item text
  my_comments TEXT,
  priority VARCHAR(20),
  stage_number INTEGER,
  phase VARCHAR(50),
  new_module BOOLEAN DEFAULT false,
  extras JSONB DEFAULT '{}'::jsonb,
  -- Lifecycle management
  import_run_id UUID,
  present_in_latest_import BOOLEAN DEFAULT false,
  PRIMARY KEY (sd_id, backlog_id)
);

-- Import Audit Trail
CREATE TABLE IF NOT EXISTS import_audit (
  id SERIAL PRIMARY KEY,
  import_run_id UUID DEFAULT gen_random_uuid(),
  file_path TEXT,
  file_checksum VARCHAR(64),
  tab_name VARCHAR(100),
  rows_processed INTEGER,
  rows_imported INTEGER,
  warnings JSONB DEFAULT '[]'::jsonb,
  errors JSONB DEFAULT '[]'::jsonb,
  status VARCHAR(20),
  dry_run BOOLEAN DEFAULT false,
  import_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Optimized Indices
CREATE INDEX IF NOT EXISTS idx_sd_backlog_sequence ON strategic_directives_backlog(sequence_rank);
CREATE INDEX IF NOT EXISTS idx_sd_backlog_triage ON strategic_directives_backlog(rolled_triage);
CREATE INDEX IF NOT EXISTS idx_sd_backlog_priority ON strategic_directives_backlog(must_have_pct DESC, sequence_rank ASC);
CREATE INDEX IF NOT EXISTS idx_sd_backlog_page ON strategic_directives_backlog(page_title);
CREATE INDEX IF NOT EXISTS idx_sd_backlog_import_run ON strategic_directives_backlog(import_run_id);
CREATE INDEX IF NOT EXISTS idx_sd_backlog_latest ON strategic_directives_backlog(present_in_latest_import);
CREATE INDEX IF NOT EXISTS idx_sd_map_sd ON sd_backlog_map(sd_id);
CREATE INDEX IF NOT EXISTS idx_sd_map_import_run ON sd_backlog_map(import_run_id);

-- Update trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_sd_backlog_updated_at ON strategic_directives_backlog;
CREATE TRIGGER update_sd_backlog_updated_at 
  BEFORE UPDATE ON strategic_directives_backlog
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- PRD Generation Support View
-- Deprecated: canonical definition lives in db/views/eng/v_eng_prd_payload_v1.sql.

-- PRD Storage Table
CREATE TABLE IF NOT EXISTS product_requirements_v3 (
  prd_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id VARCHAR(100) REFERENCES strategic_directives_backlog(sd_id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'superseded')),
  content_md TEXT NOT NULL,
  content_json JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by TEXT DEFAULT 'leopr-proc',
  import_run_id UUID,
  notes TEXT,
  UNIQUE (sd_id, version)
);

-- Grant permissions (for RLS)
GRANT ALL ON strategic_directives_backlog TO authenticated;
GRANT ALL ON sd_backlog_map TO authenticated;
GRANT ALL ON import_audit TO authenticated;
GRANT ALL ON product_requirements_v3 TO authenticated;
GRANT SELECT ON v_prd_sd_payload TO authenticated;