-- Venture Factory: Service Expansion
-- SD: SD-LEO-ORCH-EHG-VENTURE-FACTORY-001-F
-- Registers: marketing_analysis, customer_service_triage, confidence_scoring
-- Idempotent: ON CONFLICT DO NOTHING

-- ============================================================
-- 1. Register marketing_analysis service
-- ============================================================
INSERT INTO ehg_services (service_key, display_name, description, artifact_schema)
VALUES (
  'marketing_analysis',
  'Marketing Analysis',
  'Analyzes market segments, competitors, growth potential, and risk factors for venture positioning',
  '{
    "type": "object",
    "required": ["market_segment", "analysis_type"],
    "properties": {
      "market_segment": {
        "type": "string",
        "description": "Target market segment for analysis"
      },
      "analysis_type": {
        "type": "string",
        "enum": ["competitor", "growth", "risk", "comprehensive"],
        "description": "Type of marketing analysis to perform"
      },
      "competitor_names": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Optional list of specific competitors to analyze"
      },
      "time_horizon_months": {
        "type": "integer",
        "minimum": 1,
        "maximum": 60,
        "default": 12,
        "description": "Analysis time horizon in months"
      }
    }
  }'::jsonb
)
ON CONFLICT (service_key) DO NOTHING;

-- ============================================================
-- 2. Register customer_service_triage service
-- ============================================================
INSERT INTO ehg_services (service_key, display_name, description, artifact_schema)
VALUES (
  'customer_service_triage',
  'Customer Service Triage',
  'Triages customer service requests with priority-based queuing and SLA tracking',
  '{
    "type": "object",
    "required": ["category", "priority"],
    "properties": {
      "category": {
        "type": "string",
        "enum": ["billing", "technical", "account", "general", "escalation"],
        "description": "Customer service request category"
      },
      "priority": {
        "type": "integer",
        "minimum": 1,
        "maximum": 5,
        "description": "Priority level (1=highest, 5=lowest)"
      },
      "customer_tier": {
        "type": "string",
        "enum": ["free", "starter", "professional", "enterprise"],
        "default": "free",
        "description": "Customer subscription tier"
      },
      "sla_target_hours": {
        "type": "number",
        "minimum": 0.5,
        "maximum": 168,
        "description": "SLA target resolution time in hours"
      },
      "description": {
        "type": "string",
        "maxLength": 2000,
        "description": "Customer issue description"
      }
    }
  }'::jsonb
)
ON CONFLICT (service_key) DO NOTHING;

-- ============================================================
-- 3. Register confidence_scoring service
-- ============================================================
INSERT INTO ehg_services (service_key, display_name, description, artifact_schema)
VALUES (
  'confidence_scoring',
  'Confidence Scoring',
  'Calculates and aggregates confidence scores across venture deliverables for quality assessment',
  '{
    "type": "object",
    "required": ["dimensions"],
    "properties": {
      "dimensions": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["name", "weight"],
          "properties": {
            "name": { "type": "string" },
            "weight": { "type": "number", "minimum": 0, "maximum": 1 },
            "threshold": { "type": "number", "minimum": 0, "maximum": 1 }
          }
        },
        "minItems": 1,
        "description": "Scoring dimensions with weights"
      },
      "aggregation_method": {
        "type": "string",
        "enum": ["weighted_average", "minimum", "geometric_mean"],
        "default": "weighted_average",
        "description": "Method for aggregating dimension scores"
      },
      "pass_threshold": {
        "type": "number",
        "minimum": 0,
        "maximum": 1,
        "default": 0.7,
        "description": "Minimum aggregate score to pass"
      }
    }
  }'::jsonb
)
ON CONFLICT (service_key) DO NOTHING;

-- ============================================================
-- 4. Extend ehg_services with version, sla_tier, config_schema
-- ============================================================
ALTER TABLE ehg_services
  ADD COLUMN IF NOT EXISTS version TEXT NOT NULL DEFAULT '1.0.0',
  ADD COLUMN IF NOT EXISTS sla_tier TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS config_schema JSONB;

-- Add check constraint for sla_tier
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ehg_services_sla_tier_check'
  ) THEN
    ALTER TABLE ehg_services ADD CONSTRAINT ehg_services_sla_tier_check
      CHECK (sla_tier IN ('free', 'standard', 'premium', 'enterprise'));
  END IF;
END $$;

-- ============================================================
-- 5. Create service_versions table for versioned service contracts
-- ============================================================
CREATE TABLE IF NOT EXISTS service_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES ehg_services(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  artifact_schema JSONB NOT NULL,
  changelog TEXT,
  deprecated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(service_id, version)
);

CREATE INDEX IF NOT EXISTS idx_service_versions_service_id ON service_versions(service_id);

-- ============================================================
-- 6. Add SLA priority index for task queuing performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_service_tasks_priority_sla
  ON service_tasks(status, priority ASC, created_at ASC)
  WHERE status = 'pending';
