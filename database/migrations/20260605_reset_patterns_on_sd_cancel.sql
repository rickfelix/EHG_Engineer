-- Migration: reset assigned issue_patterns to active when their SD is cancelled
-- SD-LEO-INFRA-CLOSE-ISSUE-PATTERN-001 (audit finding #3 — closure-loop gap)
--
-- Problem: when an SD is cancelled, issue_patterns assigned to it
-- (status='assigned', assigned_sd_id = the SD id OR sd_key) were never reset, so
-- they dangled on a dead SD and became invisible to the learning queue
-- (v_patterns_with_decay filters status='active'). The completion side
-- (resolveLearningItems) already flips assigned->resolved; the cancellation side
-- had no handler. This adds the missing, path-agnostic cancellation closure.
--
-- Design (testing-agent CONDITIONAL_PASS, case C1 — failure isolation):
--   * The trigger is condition-gated to fire ONLY on the status->cancelled
--     transition (AFTER UPDATE OF status + WHEN clause), so it never runs on
--     ordinary SD writes.
--   * The reset call is wrapped in BEGIN..EXCEPTION WHEN OTHERS so a reset
--     failure (RLS / constraint / lock) degrades to a WARNING and can NEVER roll
--     back the SD-cancellation transaction (a trigger shares the statement's tx).
--   * The reset touches ONLY status/assigned_sd_id/assignment_date/metadata
--     (minimal column set), so the BEFORE-UPDATE trg_set_dedup_fingerprint
--     recomputes a byte-identical fingerprint (inputs source|category|summary
--     are untouched) and the partial unique index cannot be violated.
--   * The reset touches ONLY issue_patterns (never writes back to
--     strategic_directives_v2), so there is no cancel-trigger re-entry loop.

-- ============================================================
-- FORWARD
-- ============================================================

-- Canonical reset implementation, shared by the trigger (and callable directly,
-- e.g. by a reconciler or cancel-sd.js). Matches assigned_sd_id stored as either
-- the SD uuid (as text) or the sd_key (assigned_sd_id is VARCHAR, not a real FK).
-- Returns the number of patterns reset. Postgres evaluates every SET right-hand
-- side against the OLD row, so the breadcrumb captures the prior assignment even
-- though the same statement nulls those columns.
CREATE OR REPLACE FUNCTION reset_cancelled_sd_patterns(p_sd_id TEXT, p_sd_key TEXT)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  WITH updated AS (
    UPDATE issue_patterns
    SET status = 'active',
        assigned_sd_id = NULL,
        assignment_date = NULL,
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'last_cancelled_assignment',
          jsonb_build_object(
            'sd_key', COALESCE(p_sd_key, p_sd_id),
            'prior_assigned_sd_id', assigned_sd_id,
            'prior_assignment_date', assignment_date,
            'reset_at', now()
          )
        ),
        updated_at = now()
    WHERE status = 'assigned'
      AND assigned_sd_id IS NOT NULL
      AND assigned_sd_id IN (p_sd_id, p_sd_key)
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Trigger function: calls the reset under an exception guard so a reset failure
-- can never abort the SD cancellation (case C1).
CREATE OR REPLACE FUNCTION trg_fn_reset_patterns_on_sd_cancel()
RETURNS TRIGGER AS $$
DECLARE
  v_reset INTEGER;
BEGIN
  BEGIN
    v_reset := reset_cancelled_sd_patterns(NEW.id::text, NEW.sd_key);
    IF v_reset > 0 THEN
      RAISE NOTICE 'closure-loop: reset % assigned issue_pattern(s) for cancelled SD %',
        v_reset, COALESCE(NEW.sd_key, NEW.id::text);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Failure isolation: degrade to a warning; the SD stays cancelled.
    RAISE WARNING 'closure-loop: reset_cancelled_sd_patterns failed for SD % (%): % — cancellation preserved',
      COALESCE(NEW.sd_key, ''), NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Condition-gated trigger: fires ONLY when status transitions INTO 'cancelled'.
DROP TRIGGER IF EXISTS trg_reset_patterns_on_sd_cancel ON strategic_directives_v2;
CREATE TRIGGER trg_reset_patterns_on_sd_cancel
  AFTER UPDATE OF status ON strategic_directives_v2
  FOR EACH ROW
  WHEN (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
  EXECUTE FUNCTION trg_fn_reset_patterns_on_sd_cancel();

-- ============================================================
-- ROLLBACK (manual)
-- ============================================================
-- DROP TRIGGER IF EXISTS trg_reset_patterns_on_sd_cancel ON strategic_directives_v2;
-- DROP FUNCTION IF EXISTS trg_fn_reset_patterns_on_sd_cancel();
-- DROP FUNCTION IF EXISTS reset_cancelled_sd_patterns(TEXT, TEXT);
