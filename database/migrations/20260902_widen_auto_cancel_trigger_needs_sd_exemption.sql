-- Migration: widen the SD-completion auto-cancel trigger to exempt needs_sd rows
-- SD: SD-LEO-INFRA-SINGLE-ESCALATION-WRITER-001 (FR-4)
-- Amends: 20260525_auto_close_quick_fixes_on_sd_completion.sql
--   (fn_auto_close_quick_fixes_on_sd_completion / trg_auto_close_quick_fixes_on_sd_completion)
--
-- Problem: fn_auto_close_quick_fixes_on_sd_completion cancels every quick_fixes row
-- linked via resolution_sd_id to a completing SD, EXCEPT status IN
-- ('completed','cancelled','escalated','closed'). A "needs_sd" row -- status='open',
-- routing_tier=3, escalated_to_sd_id IS NULL (the derived predicate this SD introduces;
-- see lib/quick-fix/status-writer.cjs isNeedsSdRow) -- has status='open', so it is NOT
-- in that exclusion set and gets silently auto-cancelled by this SQL trigger with zero
-- disposition fields the instant an operator links resolution_sd_id to an SD that later
-- completes. This bypasses the JS-side single-writer choke point entirely: a SQL trigger
-- cannot be policed by a JS function. qf-link-resolution.mjs (the one script that sets
-- resolution_sd_id) carries the equivalent JS-side exemption via isNeedsSdRow for the
-- one path it controls directly; this migration closes the SQL-side path it does not.
--
-- Fix: widen the exclusion to also skip routing_tier=3 AND escalated_to_sd_id IS NULL
-- rows -- the SQL-side restatement of isNeedsSdRow (SQL cannot import a JS function, so
-- this is necessarily a second, hand-written representation of the same predicate at the
-- SQL boundary; TS-10's parametrized matrix test asserts the two stay equivalent).
--
-- Additive/idempotent: CREATE OR REPLACE FUNCTION only, no schema change, no backfill.
-- Requires the standard chairman apply ceremony before taking effect in prod; this SD's
-- EXEC phase stages the migration file only and does not apply it.

CREATE OR REPLACE FUNCTION fn_auto_close_quick_fixes_on_sd_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  -- Only fire when SD transitions TO completed status
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    UPDATE quick_fixes
    SET
      status = 'cancelled',
      completed_at = COALESCE(completed_at, NOW()),
      verified_by = COALESCE(verified_by, 'auto: SD completion'),
      verification_notes = COALESCE(verification_notes, '') ||
        CASE WHEN verification_notes IS NOT NULL AND verification_notes != '' THEN '; ' ELSE '' END ||
        'Auto-cancelled: superseded by SD ' || COALESCE(NEW.sd_key, NEW.id::text) || ' which reached completed status'
    WHERE resolution_sd_id = NEW.id
      AND status NOT IN ('completed', 'cancelled', 'escalated', 'closed')
      -- SD-LEO-INFRA-SINGLE-ESCALATION-WRITER-001 (FR-4): SQL-side isNeedsSdRow exemption.
      -- A needs_sd row (routing_tier=3, escalated_to_sd_id IS NULL) is explicitly awaiting
      -- an SD, not simply closed-loop work -- it must survive this auto-cancel even though
      -- its status='open' would otherwise match the NOT IN list above.
      AND NOT (routing_tier = 3 AND escalated_to_sd_id IS NULL);

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count > 0 THEN
      RAISE NOTICE 'Auto-cancelled % superseded quick-fix(es) for SD % (%)', v_updated_count, NEW.sd_key, NEW.id;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Non-blocking: log warning but never prevent SD completion
  RAISE WARNING 'fn_auto_close_quick_fixes_on_sd_completion failed for SD %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger itself is unchanged (same WHEN clause, same EXECUTE FUNCTION target) --
-- re-declared here only for idempotent re-apply safety, matching the source migration's
-- own convention.
DROP TRIGGER IF EXISTS trg_auto_close_quick_fixes_on_sd_completion ON strategic_directives_v2;

CREATE TRIGGER trg_auto_close_quick_fixes_on_sd_completion
  AFTER UPDATE ON strategic_directives_v2
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION fn_auto_close_quick_fixes_on_sd_completion();

-- ============================================================================
-- ROLLBACK (documented per this SD's adversarial-critique finding): to revert to the
-- pre-widened exemption, re-apply the ORIGINAL function body (drop the trailing
-- `AND NOT (routing_tier = 3 AND escalated_to_sd_id IS NULL)` clause):
--
-- CREATE OR REPLACE FUNCTION fn_auto_close_quick_fixes_on_sd_completion()
-- RETURNS TRIGGER AS $$
-- DECLARE
--   v_updated_count INTEGER;
-- BEGIN
--   IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
--     UPDATE quick_fixes
--     SET
--       status = 'cancelled',
--       completed_at = COALESCE(completed_at, NOW()),
--       verified_by = COALESCE(verified_by, 'auto: SD completion'),
--       verification_notes = COALESCE(verification_notes, '') ||
--         CASE WHEN verification_notes IS NOT NULL AND verification_notes != '' THEN '; ' ELSE '' END ||
--         'Auto-cancelled: superseded by SD ' || COALESCE(NEW.sd_key, NEW.id::text) || ' which reached completed status'
--     WHERE resolution_sd_id = NEW.id
--       AND status NOT IN ('completed', 'cancelled', 'escalated', 'closed');
--     GET DIAGNOSTICS v_updated_count = ROW_COUNT;
--     IF v_updated_count > 0 THEN
--       RAISE NOTICE 'Auto-cancelled % superseded quick-fix(es) for SD % (%)', v_updated_count, NEW.sd_key, NEW.id;
--     END IF;
--   END IF;
--   RETURN NEW;
-- EXCEPTION WHEN OTHERS THEN
--   RAISE WARNING 'fn_auto_close_quick_fixes_on_sd_completion failed for SD %: %', NEW.id, SQLERRM;
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;
--
-- POST-APPLY VERIFICATION QUERY (run daily, before vs. after apply):
--   SELECT date_trunc('day', completed_at) AS day, count(*)
--   FROM quick_fixes
--   WHERE verified_by = 'auto: SD completion'
--   GROUP BY 1 ORDER BY 1 DESC;
--
-- ROLLBACK TRIGGER CONDITION: roll back (re-apply the ORIGINAL body above) if that daily
-- count RISES unexpectedly after this migration applies -- a rise would indicate the
-- widened exemption is retaining rows that should legitimately have been auto-cancelled
-- (the inverse failure mode from the one this migration fixes), not the expected "small
-- and flat" count of ordinary (non-needs_sd) auto-cancellations continuing unaffected.
-- ============================================================================
