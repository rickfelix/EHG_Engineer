-- @approved-by: codestreetlabs@gmail.com
-- Chairman verbal "A" at the Adam terminal 2026-09-03 ~00:3xZ (ceremony 3c; scribe Adam 673db833; coordinator 6ec96a84 queued it; SD-LEO-INFRA-SINGLE-ESCALATION-WRITER-001 FR-4; trigger swap exempting needs_sd rows from SD-completion auto-cancel; no data mutation)
-- Migration: widen the SD-completion auto-cancel trigger to exempt needs_sd rows
-- SD: SD-LEO-INFRA-SINGLE-ESCALATION-WRITER-001 (FR-4)
-- Amends: 20260525_auto_close_quick_fixes_on_sd_completion.sql
--   (fn_auto_close_quick_fixes_on_sd_completion / trg_auto_close_quick_fixes_on_sd_completion)
-- @chairman-gated: staged only, NOT applied to prod by this SD -- requires the standard
--   chairman apply ceremony (see check-migration-readiness.mjs's CHAIRMAN-GATED-EXEMPT-001
--   convention: this dedicated marker line downgrades the CREATE OR REPLACE body-divergence
--   check from a merge-blocking FAIL_DRIFT to an advisory EXPECTED_PENDING, since live !=
--   migration is the deliberately intended state at merge time for a staged-not-applied
--   migration, not drift).
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
--
-- SEARCH_PATH PIN (SECURITY finding, addressed): CREATE OR REPLACE FUNCTION resets EVERY
-- function attribute except ownership/grants -- it does NOT preserve proconfig. This
-- function's origin migration (20260525) carries no `SET search_path` clause, but LIVE
-- pg_proc.proconfig on the deployed function DOES (`search_path=public, extensions`),
-- added later by 20260602_pin_search_path_invoker_functions.sql's repo-wide hardening
-- sweep. Naively cloning the 20260525 source (as an earlier draft of this file did) would
-- have silently REVERTED that hardening on apply -- confirmed live via pg_proc, not
-- inferred from the source migration. Restating the pin here (and re-verifying it below)
-- follows the established pattern from SD-LEO-INFRA-FIX-CREATE-REPLACE-001's
-- 20260614_fix_create_or_replace_session_metadata_merge.sql (Adam same-object
-- coordination check, corr 580a91da), which caught the identical regression class.

CREATE OR REPLACE FUNCTION fn_auto_close_quick_fixes_on_sd_completion()
RETURNS TRIGGER
SET search_path TO 'public', 'extensions'
AS $$
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

-- In-migration self-verification: confirm this migration did not silently revert the
-- post-20260602 search_path hardening -- mirrors 20260614's own $verify_search_path$ block
-- (same regression class, same fix shape).
DO $verify_search_path$
DECLARE
  v_config TEXT[];
BEGIN
  SELECT proconfig INTO v_config
  FROM pg_proc
  WHERE proname = 'fn_auto_close_quick_fixes_on_sd_completion';

  ASSERT v_config IS NOT NULL AND 'search_path=public, extensions' = ANY(v_config),
    'SD-LEO-INFRA-SINGLE-ESCALATION-WRITER-001: search_path hardening (SET search_path TO public, extensions) is missing from fn_auto_close_quick_fixes_on_sd_completion after apply';

  RAISE NOTICE 'SD-LEO-INFRA-SINGLE-ESCALATION-WRITER-001 verify OK: search_path hardening preserved on fn_auto_close_quick_fixes_on_sd_completion.';
END
$verify_search_path$;

-- ============================================================================
-- ROLLBACK (documented per this SD's adversarial-critique finding): to revert to the
-- pre-widened exemption, re-apply the ORIGINAL function body (drop the trailing
-- `AND NOT (routing_tier = 3 AND escalated_to_sd_id IS NULL)` clause):
--
-- CREATE OR REPLACE FUNCTION fn_auto_close_quick_fixes_on_sd_completion()
-- RETURNS TRIGGER
-- SET search_path TO 'public', 'extensions'  -- preserve the post-20260602 hardening pin; the
--   rollback is itself a CREATE OR REPLACE and would silently strip it too if omitted here
-- AS $$
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
