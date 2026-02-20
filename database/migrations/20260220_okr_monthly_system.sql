-- Migration: OKR Monthly System
-- Purpose: Add columns/tables for monthly OKR generation, vision linkage, and generation logging
-- Author: Claude (SD-EHG-ORCH-GOVERNANCE-STACK-001-D)
-- Date: 2026-02-20

-- ============================================================================
-- 1. ADD vision_dimension_code TO key_results (FR-003)
-- ============================================================================

ALTER TABLE key_results
  ADD COLUMN IF NOT EXISTS vision_dimension_code TEXT;

COMMENT ON COLUMN key_results.vision_dimension_code
  IS 'EVA vision dimension code (A01-A10, V01-V08) this KR maps to';

CREATE INDEX IF NOT EXISTS idx_key_results_vision_dimension
  ON key_results(vision_dimension_code) WHERE vision_dimension_code IS NOT NULL;

-- ============================================================================
-- 2. ADD source_type TO key_results (FR-002/FR-006)
-- ============================================================================

ALTER TABLE key_results
  ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'manual'
    CHECK (source_type IN ('top_down', 'bottom_up', 'manual'));

COMMENT ON COLUMN key_results.source_type
  IS 'How this KR was generated: top_down (vision gaps), bottom_up (SD retrospectives), manual';

-- ============================================================================
-- 3. ADD generation_period TO objectives
-- ============================================================================

ALTER TABLE objectives
  ADD COLUMN IF NOT EXISTS generation_id UUID;

COMMENT ON COLUMN objectives.generation_id
  IS 'References okr_generation_log.id if this objective was auto-generated';

-- ============================================================================
-- 4. CREATE okr_generation_log TABLE (FR-002/FR-006)
-- ============================================================================

CREATE TABLE IF NOT EXISTS okr_generation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_date DATE NOT NULL,
  period TEXT NOT NULL,                          -- "2026-03", "2026-04"
  vision_id UUID REFERENCES strategic_vision(id),
  top_down_count INT NOT NULL DEFAULT 0,
  bottom_up_count INT NOT NULL DEFAULT 0,
  total_krs_generated INT NOT NULL DEFAULT 0,
  top_down_ratio NUMERIC(3,2) DEFAULT 0.40,     -- Actual ratio achieved
  bottom_up_ratio NUMERIC(3,2) DEFAULT 0.60,
  source_breakdown JSONB DEFAULT '{}',           -- Detailed sources
  status TEXT DEFAULT 'completed' CHECK (status IN ('running', 'completed', 'failed')),
  error_message TEXT,
  created_by TEXT DEFAULT 'eva-scheduler',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_okr_gen_log_period ON okr_generation_log(period);
CREATE INDEX IF NOT EXISTS idx_okr_gen_log_date ON okr_generation_log(generation_date);

COMMENT ON TABLE okr_generation_log
  IS 'Audit trail for automated OKR generation runs';

-- ============================================================================
-- 5. UPDATE v_okr_hierarchy VIEW to include vision_dimension_code
-- ============================================================================

CREATE OR REPLACE VIEW v_okr_hierarchy AS
SELECT
  sv.id AS vision_id,
  sv.code AS vision_code,
  sv.title AS vision_title,
  sv.statement AS vision_statement,
  o.id AS objective_id,
  o.code AS objective_code,
  o.title AS objective_title,
  o.cadence,
  o.period,
  o.is_active AS objective_active,
  kr.id AS kr_id,
  kr.code AS kr_code,
  kr.title AS kr_title,
  kr.metric_type,
  kr.baseline_value,
  kr.current_value,
  kr.target_value,
  kr.unit,
  kr.direction,
  kr.confidence,
  kr.status AS kr_status,
  kr.is_active AS kr_active,
  kr.vision_dimension_code,
  kr.source_type,
  CASE
    WHEN kr.target_value = kr.baseline_value THEN
      CASE WHEN kr.current_value >= kr.target_value THEN 100 ELSE 0 END
    ELSE
      LEAST(100, GREATEST(0,
        ROUND(((kr.current_value - COALESCE(kr.baseline_value, 0))::NUMERIC /
               NULLIF(kr.target_value - COALESCE(kr.baseline_value, 0), 0)) * 100)
      ))
  END AS progress_pct
FROM strategic_vision sv
LEFT JOIN objectives o ON o.vision_id = sv.id
LEFT JOIN key_results kr ON kr.objective_id = o.id
WHERE sv.is_active = TRUE;

-- ============================================================================
-- 6. RLS Policies for okr_generation_log
-- ============================================================================

ALTER TABLE okr_generation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on okr_generation_log"
  ON okr_generation_log FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Authenticated read on okr_generation_log"
  ON okr_generation_log FOR SELECT
  USING (auth.role() = 'authenticated');
