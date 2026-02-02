-- Migration: Add integration_operationalization column to product_requirements_v2
-- SD: SD-LEO-INFRA-PRD-INTEGRATION-SECTION-001
-- Purpose: Store consolidated integration requirements in structured JSONB format
-- Date: 2026-02-02

-- FR-2: Add JSONB column for integration & operationalization content
-- Structure: { consumers, dependencies, data_contracts, runtime_config, observability_rollout }
ALTER TABLE product_requirements_v2
ADD COLUMN IF NOT EXISTS integration_operationalization JSONB;

-- FR-2: Add GIN index for efficient querying of integration data
CREATE INDEX IF NOT EXISTS idx_prd_integration_operationalization_gin
ON product_requirements_v2 USING GIN (integration_operationalization);

-- Add column comment for documentation
COMMENT ON COLUMN product_requirements_v2.integration_operationalization IS
'Consolidated Integration & Operationalization section content. JSONB structure with 5 required subsections:
- consumers: Who/what consumes this functionality (array of { name, type, journey })
- dependencies: Upstream/downstream systems (array of { name, direction, failure_mode })
- data_contracts: Schema and API contracts (array of { name, type, schema_ref })
- runtime_config: Configuration and deployment concerns (array of { name, env, default })
- observability_rollout: Monitoring, rollout, and rollback plans (object with metrics, alerts, rollback_plan)
Added by SD-LEO-INFRA-PRD-INTEGRATION-SECTION-001 to consolidate scattered integration requirements.';

-- Verification query
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_requirements_v2'
    AND column_name = 'integration_operationalization'
  ) THEN
    RAISE NOTICE 'SUCCESS: integration_operationalization column added to product_requirements_v2';
  ELSE
    RAISE EXCEPTION 'FAILED: Column was not created';
  END IF;
END $$;
