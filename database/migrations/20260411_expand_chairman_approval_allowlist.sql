-- SD-FIX-PROGRAMMATIC-APPROVAL-GUARD-ORCH-001-A
-- Fix: Expand chairman_decisions approval trigger allowlist for monitoring/testing agents
--
-- The existing trigger (20260320_prevent_s16_programmatic_approval.sql) blocks all
-- non-chairman decided_by values. This prevents automated pipeline testing from
-- exercising kill gates and promotion gates.
--
-- Changes:
--   1. Expand allowlist: chairman_ui/dashboard/manual + monitoring_agent + testing_agent
--   2. CISO guardrail: agent identities require non-null context with stage + timestamp
--   3. Chairman UI path unchanged (no context requirement for human approvals)
--
-- Rollback:
--   Re-apply 20260320_prevent_s16_programmatic_approval.sql to restore original behavior

CREATE OR REPLACE FUNCTION reject_s16_programmatic_approval()
RETURNS TRIGGER AS $$
DECLARE
  v_is_chairman BOOLEAN;
  v_is_agent BOOLEAN;
  v_context JSONB;
BEGIN
  -- Only enforce on stage 16 transitions from pending to approved
  IF NEW.lifecycle_stage = 16
     AND NEW.status = 'approved'
     AND (OLD.status IS DISTINCT FROM 'approved')
  THEN
    -- Chairman UI: decided_by contains 'chairman' (original behavior preserved)
    v_is_chairman := NEW.decided_by IS NOT NULL
                     AND LOWER(NEW.decided_by) LIKE '%chairman%';

    -- Registered agent identities (exact match only — no LIKE patterns)
    v_is_agent := NEW.decided_by IS NOT NULL
                  AND NEW.decided_by = ANY(ARRAY['monitoring_agent', 'testing_agent']);

    -- Block if neither chairman nor registered agent
    IF NOT v_is_chairman AND NOT v_is_agent THEN
      RAISE EXCEPTION
        'Stage 16 (Blueprint->Build) requires chairman or registered agent approval. '
        'decided_by=% is not in the allowlist. '
        'Allowed: chairman_*, monitoring_agent, testing_agent.',
        COALESCE(NEW.decided_by, 'NULL');
    END IF;

    -- CISO guardrail: agent identities must provide evaluation payload
    IF v_is_agent THEN
      v_context := NEW.context;

      IF v_context IS NULL THEN
        RAISE EXCEPTION
          'Agent approval requires evaluation payload. '
          'decided_by=% must include non-null context with stage and timestamp keys.',
          NEW.decided_by;
      END IF;

      IF NOT (v_context ? 'stage') OR NOT (v_context ? 'timestamp') THEN
        RAISE EXCEPTION
          'Agent approval context must contain "stage" and "timestamp" keys. '
          'decided_by=% provided context without required keys.',
          NEW.decided_by;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reject_s16_programmatic_approval() IS
  'Guards Stage 16 (Blueprint->Build) approval. Allows chairman UI (decided_by LIKE %chairman%), '
  'monitoring_agent, and testing_agent. Agent identities require non-null context column with '
  'stage and timestamp keys (CISO guardrail). SD-FIX-PROGRAMMATIC-APPROVAL-GUARD-ORCH-001-A.';

-- Trigger already exists from 20260320 migration — function replacement is sufficient.
-- No need to recreate trigger since it references the same function name.
