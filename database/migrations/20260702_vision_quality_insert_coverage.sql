-- @approved-by: codestreetlabs@gmail.com
-- Migration: BEFORE INSERT coverage + NULL-safe chairman_approved guard for eva_vision_documents
-- SD: SD-LEO-INFRA-REAL-VENTURE-VISION-ENRICH-UNDERPRODUCTION-S19-001-C (FR-1, FR-2)
--
-- Problem 1 (FR-1): enforce_vision_quality_on_advancement (20260314_quality_checked_enforcement_triggers.sql,
-- re-defined 20260407_fix_vision_quality_bypass.sql) fires BEFORE UPDATE ON eva_vision_documents only. A
-- direct INSERT with status='active' or chairman_approved=true and quality_checked=false bypasses
-- enforcement entirely, since there is no matching BEFORE INSERT trigger.
--
-- Problem 2 (FR-2): the existing UPDATE-path chairman-approval check is
--   NEW.chairman_approved = true AND OLD.chairman_approved = false AND NEW.quality_checked = false
-- Under Postgres NULL semantics, `OLD.chairman_approved = false` evaluates to NULL (falsy) when
-- OLD.chairman_approved IS NULL, so a NULL -> true transition on a quality_checked=false row would
-- NOT be rejected. COALESCE(OLD.chairman_approved, false) closes this. NOTE (verified via live
-- BEGIN/ROLLBACK dry-run, DATABASE sub-agent): eva_vision_documents.chairman_approved is
-- `boolean NOT NULL DEFAULT false`, so this specific NULL state is not reachable via normal UPDATE
-- DML today -- this half of the fix is defensive hardening, not a currently-exploitable live gap.
-- It is still required because the SAME function body now also backs the new BEFORE INSERT trigger
-- below (FR-1), where the branch genuinely matters (an INSERT row has no OLD at all).
--
-- Confirmed live instance (RCA, 2026-07-01): Market Modeling SaaS venture has chairman_approved=true,
-- quality_checked=false, created_by='database-agent (venture-1 seed)' via a direct INSERT.
--
-- Both fixes reuse the EXACT existing enforcement predicate and the EXACT existing
-- leo.chairman_approval_bypass session-variable escape hatch (20260407_fix_vision_quality_bypass.sql) —
-- no new bypass mechanism, no change to on_chairman_approval_side_effects.

-- 1. Extend enforce_vision_quality_on_advancement with the COALESCE NULL-safety fix.
--    Function body is shared by BOTH the existing BEFORE UPDATE trigger and the new BEFORE INSERT
--    trigger below (TG_OP branches so the INSERT case treats OLD.* as absent/false).
CREATE OR REPLACE FUNCTION enforce_vision_quality_on_advancement()
RETURNS TRIGGER AS $$
DECLARE
  old_chairman_approved BOOLEAN;
  old_status TEXT;
BEGIN
  -- Allow bypass when chairman approval trigger is coordinating within the same transaction.
  IF current_setting('leo.chairman_approval_bypass', true) = 'true' THEN
    RAISE NOTICE 'enforce_vision_quality_on_advancement: bypass active (chairman approval side-effect), allowing status transition for vision_key=%', NEW.vision_key;
    RETURN NEW;
  END IF;

  -- On INSERT there is no OLD row — treat the "prior" state as false/absent so a fresh row that
  -- ALREADY sets status='active' or chairman_approved=true with quality_checked=false is caught
  -- exactly like an UPDATE transitioning into that same state would be.
  IF TG_OP = 'INSERT' THEN
    old_chairman_approved := false;
    old_status := NULL;
  ELSE
    -- FR-2: COALESCE closes the NULL -> true gap (OLD.chairman_approved = false previously
    -- evaluated to NULL — falsy — when OLD.chairman_approved WAS NULL, silently allowing the
    -- transition through).
    old_chairman_approved := COALESCE(OLD.chairman_approved, false);
    old_status := OLD.status;
  END IF;

  -- Block status change to 'active' if quality not checked.
  IF NEW.status = 'active' AND (old_status IS DISTINCT FROM 'active') AND NEW.quality_checked = false THEN
    RAISE EXCEPTION 'Cannot set vision status to active: quality_checked is false. Vision content does not meet minimum quality thresholds. Check quality_issues for details. (vision_key: %)', NEW.vision_key;
  END IF;

  -- Block chairman approval if quality not checked.
  IF NEW.chairman_approved = true AND old_chairman_approved = false AND NEW.quality_checked = false THEN
    RAISE EXCEPTION 'Cannot approve vision: quality_checked is false. Vision content does not meet minimum quality thresholds. Check quality_issues for details. (vision_key: %)', NEW.vision_key;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. FR-1: new BEFORE INSERT trigger reusing the same function — a draft/stub INSERT (status !=
--    'active', chairman_approved != true) is never touched, mirroring the existing UPDATE trigger's
--    exact predicate. This is additive: the existing BEFORE UPDATE trigger
--    (trg_enforce_vision_quality_advancement) is untouched.
DROP TRIGGER IF EXISTS trg_enforce_vision_quality_insert ON eva_vision_documents;
CREATE TRIGGER trg_enforce_vision_quality_insert
  BEFORE INSERT ON eva_vision_documents
  FOR EACH ROW
  EXECUTE FUNCTION enforce_vision_quality_on_advancement();

-- Rollback:
-- DROP TRIGGER IF EXISTS trg_enforce_vision_quality_insert ON eva_vision_documents;
-- (function revert: re-apply the CREATE OR REPLACE FUNCTION body from 20260407_fix_vision_quality_bypass.sql)
