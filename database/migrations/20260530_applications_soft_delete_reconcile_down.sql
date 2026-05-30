-- DOWN migration for SD-LEO-INFRA-VENTURE-LIFECYCLE-SOFT-001
-- Reverses 20260530_applications_soft_delete_reconcile.sql. Fully reversible:
-- restores the full (non-partial) unique indexes, drops the trigger + function, restores
-- the unfiltered gate view, and drops the tombstone columns. Run only when no tombstoned
-- applications rows exist (otherwise restoring the FULL unique indexes could fail on a
-- live+tombstoned name collision — clear tombstones first).

-- Restore the original unfiltered gate view (pre-FR-4)
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

DROP TRIGGER IF EXISTS trg_tombstone_application_on_venture_kill ON public.ventures;
DROP TRIGGER IF EXISTS trg_tombstone_application_on_venture_delete ON public.ventures;
DROP FUNCTION IF EXISTS public.fn_tombstone_application_on_venture_retire();

DROP INDEX IF EXISTS public.uq_applications_name_lower;
DROP INDEX IF EXISTS public.uq_applications_normalized_name;
CREATE UNIQUE INDEX IF NOT EXISTS uq_applications_name_lower
  ON public.applications (lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS uq_applications_normalized_name
  ON public.applications (normalized_name);

ALTER TABLE public.applications DROP COLUMN IF EXISTS deletion_reason;
ALTER TABLE public.applications DROP COLUMN IF EXISTS deleted_by;
ALTER TABLE public.applications DROP COLUMN IF EXISTS deleted_at;
