-- ============================================================================
-- Migration: v_sd_completion_integrity view
-- SD: SD-FDBK-INFRA-ATOMIC-REVERT-HELPER-001
-- Pattern: PAT-GHOST-COMPLETION-PARTIAL-REVERT-001
-- ============================================================================
--
-- Read-only view exposing ghost-completion detection for strategic_directives_v2.
-- Uses sd_phase_handoffs as the CANONICAL evidence source (NOT leo_handoff_executions,
-- which RCA confirmed is an unreconciled optimistic write-through cache populated by
-- LeadFinalApprovalExecutor BEFORE validation completes).
--
-- An SD is "ghost-completed" when:
--   (1) status='completed', AND
--   (2) sd_type is NOT one of the exempt types (orchestrator/documentation/docs),
--       which have alternate completion paths (complete_orchestrator_sd()), AND
--   (3) sd_phase_handoffs has NO accepted LEAD-FINAL-APPROVAL row AND
--       NO accepted BYPASS-COMPLETION row (BYPASS-COMPLETION is the documented
--       emergency completion path with 23 historical witnesses).
--
-- View is READ-ONLY. No triggers. No write enforcement. The companion follow-up
-- SD (feedback 7260707e) will sequence the trigger enforcement after the
-- LeadFinalApprovalExecutor pre-insert refactor.
--
-- COALESCE wraps sd_type in the NOT IN check because postgres three-valued logic
-- makes `NULL NOT IN (...)` evaluate to NULL (not TRUE), which would suppress
-- the ghost flag for SDs with NULL sd_type.
--
-- Enrichment columns lfa_rejected_count and lfa_last_attempted_at spare audit
-- script callers 2000+ correlated subquery round-trips when investigating ghosts.
-- ============================================================================

CREATE OR REPLACE VIEW v_sd_completion_integrity AS
SELECT
  sd.id,
  sd.sd_key,
  sd.uuid_id,
  sd.status,
  sd.current_phase,
  sd.sd_type,
  sd.updated_at,
  sd.created_at,
  (
    sd.status = 'completed'
    AND COALESCE(sd.sd_type, '') NOT IN ('orchestrator', 'documentation', 'docs')
    AND NOT EXISTS (
      SELECT 1
      FROM sd_phase_handoffs sph
      WHERE sph.sd_id = sd.id
        AND sph.handoff_type IN ('LEAD-FINAL-APPROVAL', 'BYPASS-COMPLETION')
        AND sph.status = 'accepted'
    )
  ) AS is_ghost_completed,
  (
    SELECT COUNT(*)::int
    FROM sd_phase_handoffs sph
    WHERE sph.sd_id = sd.id
      AND sph.handoff_type = 'LEAD-FINAL-APPROVAL'
      AND sph.status = 'rejected'
  ) AS lfa_rejected_count,
  (
    SELECT MAX(sph.created_at)
    FROM sd_phase_handoffs sph
    WHERE sph.sd_id = sd.id
      AND sph.handoff_type = 'LEAD-FINAL-APPROVAL'
  ) AS lfa_last_attempted_at
FROM strategic_directives_v2 sd;

COMMENT ON VIEW v_sd_completion_integrity IS
  'SD-FDBK-INFRA-ATOMIC-REVERT-HELPER-001: ghost-completion detection using sd_phase_handoffs as canonical evidence (NOT leo_handoff_executions). Read-only, advisory only. is_ghost_completed=true when status=completed AND no accepted LEAD-FINAL-APPROVAL/BYPASS-COMPLETION SPH row exists AND sd_type is not in exempt list. See PAT-GHOST-COMPLETION-PARTIAL-REVERT-001.';

-- ROLLBACK:
-- DROP VIEW IF EXISTS v_sd_completion_integrity CASCADE;
