-- Child A: DB Schema Migrations
-- SD: SD-LEO-INFRA-EVA-STAGE-PIPELINE-002A
--
-- Adds missing columns that cause silent failures:
--   venture_artifacts.source       - Devil's Advocate artifact attribution
--   venture_artifacts.artifact_data - RealityTracker structured metadata
--   chairman_decisions.context      - DFE escalation decision context
--
-- All use IF NOT EXISTS for idempotency.

ALTER TABLE venture_artifacts ADD COLUMN IF NOT EXISTS source VARCHAR(100);
ALTER TABLE venture_artifacts ADD COLUMN IF NOT EXISTS artifact_data JSONB;
ALTER TABLE chairman_decisions ADD COLUMN IF NOT EXISTS context JSONB;
