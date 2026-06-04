-- Migration: lower()-normalize the v_sub_agent_repo_compliance join on target_application
-- SD-FDBK-INFRA-SUB-AGENT-REPO-001 (feedback e2002372)
--
-- The applications join was case-sensitive (a.name = sd.target_application), so venture SDs
-- whose target_application casing differs from applications.name — e.g. DataDistill SDs with
-- target_application='datadistill' vs applications.name='DataDistill' — resolved to
-- compliance_status='unknown_application' for EVERY DataDistill venture SD, even with a correct
-- active applications row and correct metadata.repo_path. (Non-blocking: unknown_application
-- falls through to PASS, but the classification was wrong.)
--
-- Fix: lower()-normalize BOTH sides of the join. ONLY the join predicate changes; the
-- compliance_status CASE, the column list, and the deleted_at IS NULL tombstone filter are
-- preserved verbatim from 20260530_applications_soft_delete_reconcile.sql. Idempotent
-- (CREATE OR REPLACE VIEW); reversible via the _down migration.

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
LEFT JOIN applications a              ON lower(a.name) = lower(sd.target_application) AND a.deleted_at IS NULL;

COMMENT ON VIEW v_sub_agent_repo_compliance IS
  'SD-LEO-INFRA-FLEET-WIDE-SUB-001 FR-7b + SD-LEO-INFRA-VENTURE-LIFECYCLE-SOFT-001 FR-4 + SD-FDBK-INFRA-SUB-AGENT-REPO-001: per-row compliance classification for the PLAN-TO-EXEC SUB_AGENT_REPO_RESOLUTION gate. The applications join is lower()-normalized on both sides (lower(a.name) = lower(sd.target_application)) so venture SDs whose target_application casing differs from applications.name (e.g. datadistill vs DataDistill) resolve correctly; it excludes tombstoned rows (deleted_at IS NULL) so a retired venture no longer influences gate verdicts; a retired/unmatched target_application falls to unknown_application. Statuses: legacy, compliant, explicit_null, violation, cwd_leak, unknown_application.';
