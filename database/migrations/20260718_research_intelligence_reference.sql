-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-INFRA-RESEARCH-INTELLIGENCE-OPERATOR-001-A (FR-2)
-- Standing landscape reference: the shared, versioned data product the
-- RESEARCH_INTELLIGENCE_OPERATOR maintains and that downstream children read.
--   Child B reads entry_type IN ('tech_landscape','model_landscape')
--   Child C reads entry_type IN ('market_size','unit_economics','comparables')
--   Child D reads versioned/superseded rows for forecast-vs-actual calibration
--
-- ADDITIVE: a new table, no ALTER of existing tables. RLS is enabled in this SAME
-- migration (tables need RLS at create time). The operator ships defined-but-unarmed,
-- so no data step runs here — rows are written later, only once armed, by
-- lib/agents/research-intelligence-operator.js ingestAcceptedSignals().

CREATE TABLE IF NOT EXISTS research_intelligence_reference (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_type    TEXT NOT NULL
                  CHECK (entry_type IN (
                    'tech_landscape', 'model_landscape',
                    'market_size', 'unit_economics', 'comparables'
                  )),
  subject       TEXT NOT NULL,                        -- canonical topic key (e.g. 'llm_frontier_models')
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,   -- the reference data itself
  source_refs   JSONB NOT NULL DEFAULT '[]'::jsonb,   -- provenance: youtube ids / urls
  confidence    TEXT NOT NULL DEFAULT 'unverified'
                  CHECK (confidence IN ('unverified', 'low', 'medium', 'high')),
  version       INTEGER NOT NULL DEFAULT 1,
  is_current    BOOLEAN NOT NULL DEFAULT TRUE,
  superseded_by UUID REFERENCES research_intelligence_reference(id),
  created_by    TEXT NOT NULL DEFAULT 'RESEARCH_INTELLIGENCE_OPERATOR',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE research_intelligence_reference IS
  'Standing landscape reference (SD-LEO-INFRA-RESEARCH-INTELLIGENCE-OPERATOR-001-A): the versioned data product the RESEARCH_INTELLIGENCE_OPERATOR maintains. entry_type discriminates tech/model-landscape rows (Child B) from market_size/unit_economics/comparables rows (Child C). One is_current row per (entry_type, subject); older versions are retained with is_current=false and superseded_by set (Child D calibration).';

-- Exactly one CURRENT version per (entry_type, subject); older versions kept for calibration.
CREATE UNIQUE INDEX IF NOT EXISTS uq_research_intel_ref_current
  ON research_intelligence_reference (entry_type, subject)
  WHERE is_current;

-- Fast lookup by discriminator family (B/C read paths).
CREATE INDEX IF NOT EXISTS idx_research_intel_ref_type_current
  ON research_intelligence_reference (entry_type)
  WHERE is_current;

-- RLS at create time. Reference data is holdco-internal: readable by authenticated
-- callers, writable only by the service role (the operator writes via service scripts).
ALTER TABLE research_intelligence_reference ENABLE ROW LEVEL SECURITY;

CREATE POLICY research_intel_ref_read ON research_intelligence_reference
  FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY research_intel_ref_service_write ON research_intelligence_reference
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
