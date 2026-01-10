-- Migration: Capability Ledger V2 - Enhanced Taxonomy and Plane 1 Integration
-- SD: SD-CAP-LEDGER-001 | US-002
-- Date: 2026-01-08
-- Purpose: Extend sd_capabilities with comprehensive taxonomy and Plane 1 scoring
-- Based on: Ground-Truth Triangulation Synthesis recommendations

-- ============================================================================
-- PHASE 1: Expand capability_type constraint with full taxonomy
-- ============================================================================

-- Drop existing constraint to replace with expanded version
ALTER TABLE sd_capabilities
  DROP CONSTRAINT IF EXISTS sd_capabilities_capability_type_check;

-- Add expanded capability_type constraint with full taxonomy
-- Categories: ai_automation, infrastructure, application, integration, governance
ALTER TABLE sd_capabilities
  ADD CONSTRAINT sd_capabilities_capability_type_check
  CHECK (capability_type IN (
    -- AI & Automation
    'agent', 'crew', 'tool', 'skill',
    -- Infrastructure
    'database_schema', 'database_function', 'rls_policy', 'migration',
    -- Application
    'api_endpoint', 'component', 'hook', 'service', 'utility',
    -- Integration
    'workflow', 'webhook', 'external_integration',
    -- Governance
    'validation_rule', 'quality_gate', 'protocol'
  ));

COMMENT ON COLUMN sd_capabilities.capability_type IS
'Capability type from formal taxonomy. Categories: ai_automation (agent, crew, tool, skill), infrastructure (database_schema, database_function, rls_policy, migration), application (api_endpoint, component, hook, service, utility), integration (workflow, webhook, external_integration), governance (validation_rule, quality_gate, protocol)';

-- ============================================================================
-- PHASE 2: Add capability metadata columns
-- ============================================================================

-- 2.1: Category column for grouping
ALTER TABLE sd_capabilities
  ADD COLUMN IF NOT EXISTS category VARCHAR(50);

-- Update category based on capability_type
UPDATE sd_capabilities
SET category = CASE
  WHEN capability_type IN ('agent', 'crew', 'tool', 'skill') THEN 'ai_automation'
  WHEN capability_type IN ('database_schema', 'database_function', 'rls_policy', 'migration') THEN 'infrastructure'
  WHEN capability_type IN ('api_endpoint', 'component', 'hook', 'service', 'utility') THEN 'application'
  WHEN capability_type IN ('workflow', 'webhook', 'external_integration') THEN 'integration'
  WHEN capability_type IN ('validation_rule', 'quality_gate', 'protocol') THEN 'governance'
  ELSE 'application' -- Default fallback
END
WHERE category IS NULL;

-- Add constraint for category
ALTER TABLE sd_capabilities
  ADD CONSTRAINT sd_capabilities_category_check
  CHECK (category IN ('ai_automation', 'infrastructure', 'application', 'integration', 'governance'));

-- 2.2: Human-readable name and description
ALTER TABLE sd_capabilities
  ADD COLUMN IF NOT EXISTS name VARCHAR(200);

ALTER TABLE sd_capabilities
  ADD COLUMN IF NOT EXISTS description TEXT;

-- ============================================================================
-- PHASE 3: Add Plane 1 scoring fields
-- ============================================================================
-- Plane 1 (Capability Graph) scoring components:
-- - Graph Centrality Gain (0-5): How central to capability graph
-- - Maturity Lift (0-5): What maturity level does this add
-- - Extraction Clarity (0-5): How reusable/extractable

-- 3.1: Maturity score (0-5)
ALTER TABLE sd_capabilities
  ADD COLUMN IF NOT EXISTS maturity_score INTEGER DEFAULT 0
  CHECK (maturity_score >= 0 AND maturity_score <= 5);

COMMENT ON COLUMN sd_capabilities.maturity_score IS
'Maturity level 0-5. Per taxonomy criteria: 0=concept, 1=basic, 2=functional, 3=reliable, 4=production-grade, 5=fully autonomous/published';

-- 3.2: Extraction score (0-5) - How reusable
ALTER TABLE sd_capabilities
  ADD COLUMN IF NOT EXISTS extraction_score INTEGER DEFAULT 0
  CHECK (extraction_score >= 0 AND extraction_score <= 5);

COMMENT ON COLUMN sd_capabilities.extraction_score IS
'Extraction/reusability level 0-5. Per taxonomy: 0=hardcoded, 1=configurable, 2=adaptable, 3=generic, 4=published, 5=marketplace-ready';

-- 3.3: Graph centrality (computed from reuse patterns)
ALTER TABLE sd_capabilities
  ADD COLUMN IF NOT EXISTS graph_centrality_score INTEGER DEFAULT 0
  CHECK (graph_centrality_score >= 0 AND graph_centrality_score <= 5);

COMMENT ON COLUMN sd_capabilities.graph_centrality_score IS
'Graph centrality 0-5. Computed from dependency analysis and reuse count. Higher = more central to capability ecosystem';

-- 3.4: Category weight for Plane 1 calculation
ALTER TABLE sd_capabilities
  ADD COLUMN IF NOT EXISTS category_weight DECIMAL(3,2) DEFAULT 1.0;

COMMENT ON COLUMN sd_capabilities.category_weight IS
'Weight multiplier for Plane 1 scoring. ai_automation=1.5, governance=1.3, infrastructure=1.2, integration=1.1, application=1.0';

-- 3.5: Computed Plane 1 total (sum of subscores * weight)
ALTER TABLE sd_capabilities
  ADD COLUMN IF NOT EXISTS plane1_score DECIMAL(5,2) DEFAULT 0;

COMMENT ON COLUMN sd_capabilities.plane1_score IS
'Computed Plane 1 score = (maturity + extraction + centrality) * category_weight. Max ~22.5 for AI capabilities';

-- ============================================================================
-- PHASE 4: Add reuse tracking fields
-- ============================================================================

-- 4.1: Count of times this capability was reused
ALTER TABLE sd_capabilities
  ADD COLUMN IF NOT EXISTS reuse_count INTEGER DEFAULT 0;

COMMENT ON COLUMN sd_capabilities.reuse_count IS
'Number of times this capability was reused in other SDs or ventures';

-- 4.2: Array of SD IDs that reuse this capability
ALTER TABLE sd_capabilities
  ADD COLUMN IF NOT EXISTS reused_by_sds JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN sd_capabilities.reused_by_sds IS
'Array of SD IDs that reuse this capability: [{sd_id, date, context}]';

-- 4.3: First registration date (for age calculation)
ALTER TABLE sd_capabilities
  ADD COLUMN IF NOT EXISTS first_registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- 4.4: Last reuse date
ALTER TABLE sd_capabilities
  ADD COLUMN IF NOT EXISTS last_reused_at TIMESTAMP;

-- 4.5: Source file paths where capability is implemented
ALTER TABLE sd_capabilities
  ADD COLUMN IF NOT EXISTS source_files JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN sd_capabilities.source_files IS
'Array of file paths where this capability is implemented: ["lib/foo.js", "src/components/Bar.tsx"]';

-- ============================================================================
-- PHASE 5: Add dependency tracking
-- ============================================================================

-- 5.1: Capabilities this depends on
ALTER TABLE sd_capabilities
  ADD COLUMN IF NOT EXISTS depends_on JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN sd_capabilities.depends_on IS
'Array of capability_keys this capability depends on';

-- 5.2: Capabilities that depend on this
ALTER TABLE sd_capabilities
  ADD COLUMN IF NOT EXISTS depended_by JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN sd_capabilities.depended_by IS
'Array of capability_keys that depend on this capability';

-- ============================================================================
-- PHASE 6: Create indexes for new columns
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_sd_capabilities_category ON sd_capabilities(category);
CREATE INDEX IF NOT EXISTS idx_sd_capabilities_maturity ON sd_capabilities(maturity_score);
CREATE INDEX IF NOT EXISTS idx_sd_capabilities_plane1 ON sd_capabilities(plane1_score DESC);
CREATE INDEX IF NOT EXISTS idx_sd_capabilities_reuse_count ON sd_capabilities(reuse_count DESC);

-- ============================================================================
-- PHASE 7: Create trigger to auto-compute Plane 1 score
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_compute_plane1_score()
RETURNS TRIGGER AS $$
BEGIN
  -- Set category weight based on capability type
  NEW.category_weight := CASE
    WHEN NEW.capability_type IN ('agent', 'crew', 'tool', 'skill') THEN 1.5
    WHEN NEW.capability_type IN ('validation_rule', 'quality_gate', 'protocol') THEN 1.3
    WHEN NEW.capability_type IN ('database_schema', 'database_function', 'rls_policy', 'migration') THEN 1.2
    WHEN NEW.capability_type IN ('workflow', 'webhook', 'external_integration') THEN 1.1
    ELSE 1.0
  END;

  -- Set category based on type
  NEW.category := CASE
    WHEN NEW.capability_type IN ('agent', 'crew', 'tool', 'skill') THEN 'ai_automation'
    WHEN NEW.capability_type IN ('database_schema', 'database_function', 'rls_policy', 'migration') THEN 'infrastructure'
    WHEN NEW.capability_type IN ('api_endpoint', 'component', 'hook', 'service', 'utility') THEN 'application'
    WHEN NEW.capability_type IN ('workflow', 'webhook', 'external_integration') THEN 'integration'
    WHEN NEW.capability_type IN ('validation_rule', 'quality_gate', 'protocol') THEN 'governance'
    ELSE 'application'
  END;

  -- Compute graph centrality from reuse count (0-5, +1 per 2 reuses)
  NEW.graph_centrality_score := LEAST(5, FLOOR(COALESCE(NEW.reuse_count, 0) / 2));

  -- Compute Plane 1 total
  NEW.plane1_score := (
    COALESCE(NEW.maturity_score, 0) +
    COALESCE(NEW.extraction_score, 0) +
    NEW.graph_centrality_score
  ) * NEW.category_weight;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_compute_plane1_score ON sd_capabilities;

CREATE TRIGGER trg_compute_plane1_score
  BEFORE INSERT OR UPDATE ON sd_capabilities
  FOR EACH ROW
  EXECUTE FUNCTION fn_compute_plane1_score();

-- ============================================================================
-- PHASE 8: Create capability_reuse junction table for detailed tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS capability_reuse_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capability_id UUID NOT NULL REFERENCES sd_capabilities(id) ON DELETE CASCADE,
  capability_key VARCHAR(200) NOT NULL,
  reusing_sd_id VARCHAR(100) NOT NULL,
  reusing_sd_uuid UUID REFERENCES strategic_directives_v2(uuid_id) ON DELETE SET NULL,
  reuse_context TEXT, -- Description of how it was reused
  reuse_type VARCHAR(50) CHECK (reuse_type IN ('direct', 'extended', 'forked', 'referenced')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_capability_reuse_capability ON capability_reuse_log(capability_id);
CREATE INDEX IF NOT EXISTS idx_capability_reuse_sd ON capability_reuse_log(reusing_sd_id);

COMMENT ON TABLE capability_reuse_log IS
'Detailed log of capability reuse events. Tracks when, where, and how capabilities are reused across SDs.';

-- Enable RLS
ALTER TABLE capability_reuse_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on capability_reuse_log"
ON capability_reuse_log
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Authenticated users can read capability_reuse_log"
ON capability_reuse_log
FOR SELECT
TO authenticated
USING (true);

-- ============================================================================
-- PHASE 9: Create function to record capability reuse
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_record_capability_reuse(
  p_capability_key VARCHAR(200),
  p_reusing_sd_id VARCHAR(100),
  p_reuse_context TEXT DEFAULT NULL,
  p_reuse_type VARCHAR(50) DEFAULT 'direct'
)
RETURNS VOID AS $$
DECLARE
  v_capability_id UUID;
  v_sd_uuid UUID;
BEGIN
  -- Find the capability
  SELECT id INTO v_capability_id
  FROM sd_capabilities
  WHERE capability_key = p_capability_key
  LIMIT 1;

  IF v_capability_id IS NULL THEN
    RAISE NOTICE 'Capability not found: %', p_capability_key;
    RETURN;
  END IF;

  -- Find the SD UUID
  SELECT uuid_id INTO v_sd_uuid
  FROM strategic_directives_v2
  WHERE id = p_reusing_sd_id;

  -- Insert reuse log entry
  INSERT INTO capability_reuse_log (
    capability_id,
    capability_key,
    reusing_sd_id,
    reusing_sd_uuid,
    reuse_context,
    reuse_type
  ) VALUES (
    v_capability_id,
    p_capability_key,
    p_reusing_sd_id,
    v_sd_uuid,
    p_reuse_context,
    p_reuse_type
  );

  -- Update capability reuse metrics
  UPDATE sd_capabilities
  SET
    reuse_count = reuse_count + 1,
    last_reused_at = CURRENT_TIMESTAMP,
    reused_by_sds = reused_by_sds || jsonb_build_array(jsonb_build_object(
      'sd_id', p_reusing_sd_id,
      'date', CURRENT_TIMESTAMP::text,
      'context', p_reuse_context
    ))
  WHERE id = v_capability_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_record_capability_reuse IS
'Records when a capability is reused by another SD. Updates reuse metrics and logs the event.';

-- ============================================================================
-- PHASE 10: Create view for capability ledger dashboard
-- ============================================================================

CREATE OR REPLACE VIEW v_capability_ledger AS
SELECT
  sc.id,
  sc.capability_key,
  sc.name,
  sc.description,
  sc.capability_type,
  sc.category,
  sc.maturity_score,
  sc.extraction_score,
  sc.graph_centrality_score,
  sc.plane1_score,
  sc.reuse_count,
  sc.first_registered_at,
  sc.last_reused_at,
  sc.sd_id AS registered_by_sd,
  sd.title AS sd_title,
  sc.action,
  sc.source_files,
  -- Age in days
  EXTRACT(DAY FROM (CURRENT_TIMESTAMP - sc.first_registered_at))::INTEGER AS age_days,
  -- Reuse rate (reuses per 30 days of existence)
  CASE
    WHEN EXTRACT(DAY FROM (CURRENT_TIMESTAMP - sc.first_registered_at)) > 0
    THEN ROUND((sc.reuse_count::DECIMAL / EXTRACT(DAY FROM (CURRENT_TIMESTAMP - sc.first_registered_at)) * 30)::NUMERIC, 2)
    ELSE 0
  END AS reuse_rate_per_month
FROM sd_capabilities sc
LEFT JOIN strategic_directives_v2 sd ON sc.sd_uuid = sd.uuid_id
WHERE sc.action = 'registered'
ORDER BY sc.plane1_score DESC, sc.reuse_count DESC;

COMMENT ON VIEW v_capability_ledger IS
'Dashboard view of the capability ledger showing all registered capabilities with Plane 1 scores and reuse metrics.';

-- ============================================================================
-- Verification queries (uncomment to run after migration)
-- ============================================================================
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'sd_capabilities'
-- ORDER BY ordinal_position;

-- SELECT * FROM v_capability_ledger LIMIT 10;
