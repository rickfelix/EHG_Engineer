-- Add local_path column to ventures for DB-derived registry view.
-- SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-A / PA-3
--
-- Why: applications/registry.json stores local_path for each registered venture
-- (e.g., 'C:/Users/rickf/Projects/_EHG/ehg'). The DB-derived registry view
-- vw_venture_registry needs this column to replace the static file lookup.
-- Per database-agent review: venture_resources is EAV and lacks flat columns,
-- so local_path lives on ventures directly (where repo_url, deployment_url,
-- deployment_target already live).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS. No NOT NULL constraint (existing rows
-- backfill via the seed migration; new ventures populate via Stage 19 register-
-- deployment endpoint).

ALTER TABLE ventures ADD COLUMN IF NOT EXISTS local_path TEXT;

COMMENT ON COLUMN ventures.local_path IS
'Absolute filesystem path to the venture''s local clone (e.g., C:/Users/rickf/Projects/_EHG/<venture>). Populated from applications/registry.json via seed migration; new ventures populate via post-Stage-19 register-deployment endpoint. Used by venture-resolver getVentureConfig() and by checkout-aware tooling.';
