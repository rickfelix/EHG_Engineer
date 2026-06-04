-- DOWN migration for SD-FDBK-INFRA-SUB-AGENT-REPO-001
-- Restores the original case-sensitive applications join (a.name = sd.target_application)
-- as defined in 20260530_applications_soft_delete_reconcile.sql. Reverses
-- 20260604_fix_v_sub_agent_repo_compliance_case_insensitive.sql.

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
LEFT JOIN applications a              ON a.name = sd.target_application AND a.deleted_at IS NULL;

COMMENT ON VIEW v_sub_agent_repo_compliance IS
  'SD-LEO-INFRA-FLEET-WIDE-SUB-001 FR-7b + SD-LEO-INFRA-VENTURE-LIFECYCLE-SOFT-001 FR-4: per-row compliance classification for the PLAN-TO-EXEC SUB_AGENT_REPO_RESOLUTION gate. The applications join now excludes tombstoned rows (deleted_at IS NULL) so a retired venture no longer influences gate verdicts; a retired target_application falls to unknown_application. Statuses: legacy, compliant, explicit_null, violation, cwd_leak, unknown_application.';
