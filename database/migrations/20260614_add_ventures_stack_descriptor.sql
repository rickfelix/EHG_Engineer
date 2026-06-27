-- SD-EHG-FEAT-AUTOMATED-RESILIENT-VENTURE-001-A (FR-5)
-- Additive / reversible: adds a nullable JSONB column to `ventures`.
-- No default, no backfill — DATA-SAFE.
-- DO NOT EXECUTE directly; apply via the approved migration pipeline.
-- SD-LEO-INFRA-S19-BRIDGE-UNBLOCK-SCHEMA-DRIFT-001 FR-1: apply the additive column that wedged the S19 bridge
-- @approved-by: codestreetlabs@gmail.com

ALTER TABLE ventures ADD COLUMN IF NOT EXISTS stack_descriptor JSONB;

-- ROLLBACK: ALTER TABLE ventures DROP COLUMN IF EXISTS stack_descriptor;
