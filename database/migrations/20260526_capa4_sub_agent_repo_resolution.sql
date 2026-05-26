-- SD-LEO-INFRA-FLEET-WIDE-SUB-001 — Fleet-wide sub-agent repo resolution
-- Additive migration: column + view. No drops, no rewrites, zero data risk.
-- Pairs with lib/sub-agents/resolve-repo.js (FR-1) and the PLAN-TO-EXEC SUB_AGENT_REPO_RESOLUTION gate (FR-3).

-- FR-7a: track which cwd the sub-agent ran from (enables CWD_LEAK detection at the gate)
ALTER TABLE sub_agent_execution_results
  ADD COLUMN IF NOT EXISTS executed_from_cwd TEXT;

COMMENT ON COLUMN sub_agent_execution_results.executed_from_cwd IS
  'SD-LEO-INFRA-FLEET-WIDE-SUB-001 FR-7: absolute cwd the sub-agent process ran from. NULL for legacy rows (LEGACY gate rule skips check). When populated, PLAN-TO-EXEC SUB_AGENT_REPO_RESOLUTION gate compares to metadata.repo_path: equal means CWD_LEAK (BLOCKED).';

-- FR-7b: compliance audit view (read-only; idempotent via CREATE OR REPLACE)
-- Backward-compat policy baked into the CASE: missing repo_path key = LEGACY (full credit)
CREATE OR REPLACE VIEW v_sub_agent_repo_compliance AS
SELECT
  saer.id,
  saer.created_at,
  saer.sd_id,
  sd.sd_key,
  sd.target_application,
  a.local_path AS expected_repo_path,
  saer.sub_agent_code,
  saer.phase,
  saer.metadata->>'repo_path' AS metadata_repo_path,
  (saer.metadata->>'repo_resolved')::boolean AS metadata_repo_resolved,
  saer.executed_from_cwd,
  CASE
    WHEN NOT (saer.metadata ? 'repo_path')              THEN 'legacy'
    WHEN a.local_path IS NULL                            THEN 'unknown_application'
    WHEN saer.metadata->>'repo_path' IS NULL             THEN 'explicit_null'
    WHEN saer.executed_from_cwd IS NOT NULL
         AND saer.metadata->>'repo_path' = saer.executed_from_cwd THEN 'cwd_leak'
    WHEN saer.metadata->>'repo_path' = a.local_path      THEN 'compliant'
    ELSE 'violation'
  END AS compliance_status
FROM sub_agent_execution_results saer
LEFT JOIN strategic_directives_v2 sd ON sd.id = saer.sd_id
LEFT JOIN applications a              ON a.name = sd.target_application;

COMMENT ON VIEW v_sub_agent_repo_compliance IS
  'SD-LEO-INFRA-FLEET-WIDE-SUB-001 FR-7b: per-row classification for PLAN-TO-EXEC SUB_AGENT_REPO_RESOLUTION gate and nightly audit. Statuses: legacy (no repo_path key, full credit — backward compat for 23,817 pre-existing rows), compliant (repo_path matches applications.local_path), explicit_null (key present but null — sub-agent claimed and returned null, BLOCKED), violation (mismatched path, BLOCKED), cwd_leak (path equals executed_from_cwd, BLOCKED), unknown_application (target_application not in applications table). Uses (metadata ? key) key-existence operator per JSONB null semantics — NOT IS NULL which conflates missing-key with explicit-json-null.';
