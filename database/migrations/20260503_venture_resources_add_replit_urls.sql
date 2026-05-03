-- Add repo_url + deployment_url columns to venture_resources for Stage 19 Replit registration.
-- SD-LEO-FEAT-STAGE-BUILD-REPLIT-001 / FR-4 / TR-4
--
-- Why first-class columns (not metadata JSONB):
--   The Stage 19 exit-gate enforcer (FR-2) reduces the existence check to two NOT NULL
--   predicates on indexed columns. Storing inside metadata JSONB would force jsonb_path_exists
--   on every advance — slower, harder to index, and less queryable from chairman_dashboard.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS.
-- No NOT NULL constraint (some venture types skip Replit). No default. Existing rows leave new
-- columns NULL — verified by AC-FR4-3.

ALTER TABLE venture_resources ADD COLUMN IF NOT EXISTS repo_url text;
ALTER TABLE venture_resources ADD COLUMN IF NOT EXISTS deployment_url text;

-- Partial unique index: prevent the same deployment_url being registered twice for one venture.
-- Partial (WHERE deployment_url IS NOT NULL) so existing/future rows without the column populated
-- are unaffected; verified by AC-FR4-4.
CREATE UNIQUE INDEX IF NOT EXISTS venture_resources_venture_deployment_url_uniq
  ON venture_resources (venture_id, deployment_url)
  WHERE deployment_url IS NOT NULL;
