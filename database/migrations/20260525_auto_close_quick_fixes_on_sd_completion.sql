-- Migration: Auto-close quick-fixes superseded by a completing SD
-- SD: SD-LEO-INFRA-AUTO-CLOSE-QUICK-001
-- @approved-by: rickfelix@example.com
-- Pattern: clones fn_auto_close_deliverables_on_sd_completion (20260221) — chosen
-- over the feedback fn (20260207) because the deliverables fn carries the
-- EXCEPTION WHEN OTHERS handler + GET DIAGNOSTICS, so a failure here never aborts
-- the SD-completion transaction.
--
-- Problem: quick_fixes is the only work-item type with no SD-completion
-- reconciliation. feedback and sd_scope_deliverables auto-close on SD completion;
-- a QF resolved by a DIFFERENT SD (with no PR of its own) stays status='open' and
-- is re-recommended by sd-next indefinitely (incident: QF-20260521-962 sat open
-- 4 days after SD-LEO-REFAC-RETIRE-LEGACY-STAGE-001 fixed its symptom).

-- ============================================================================
-- FR-1: resolution link column. Additive, nullable, no backfill.
--   - ON DELETE SET NULL: it is a resolution pointer (like feedback.resolution_sd_id),
--     so deleting a resolving SD must NOT block — it just nulls the link.
--   - Exactly ONE FK (avoid the duplicate-FK anti-pattern on feedback.quick_fix_id).
-- ============================================================================

-- resolution_sd_id is TEXT: strategic_directives_v2.id is the sd_key (e.g.
-- 'SD-LEO-...'), not a UUID (the UUID lives in uuid_id). Mirrors feedback.resolution_sd_id.
ALTER TABLE quick_fixes
  ADD COLUMN IF NOT EXISTS resolution_sd_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quick_fixes_resolution_sd_id_fkey'
  ) THEN
    ALTER TABLE quick_fixes
      ADD CONSTRAINT quick_fixes_resolution_sd_id_fkey
      FOREIGN KEY (resolution_sd_id)
      REFERENCES strategic_directives_v2(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_quick_fixes_resolution_sd_id
  ON quick_fixes(resolution_sd_id)
  WHERE resolution_sd_id IS NOT NULL;

COMMENT ON COLUMN quick_fixes.resolution_sd_id IS
  'SD that resolved/superseded this QF. When that SD completes, trg_auto_close_quick_fixes_on_sd_completion cancels this QF. Populated operator-confirmed via the FR-3 close-the-loop prompt (SD-LEO-INFRA-AUTO-CLOSE-QUICK-001).';

-- ============================================================================
-- FR-2: trigger — cancel linked open QFs when the resolving SD completes.
--   - Target status='cancelled' (NOT 'completed'): the completed_requires_verification
--     CHECK rejects completing an unverified QF, which under a non-blocking trigger
--     would silently no-op and leave the QF open. 'cancelled' carries no verification
--     requirement and is semantically correct for supersession. It is also NOT in the
--     WHEN set of trg_auto_close_feedback_on_qf_completion (completed/shipped), so no
--     SD->QF->feedback cascade is triggered.
-- ============================================================================

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
      AND status NOT IN ('completed', 'cancelled', 'escalated', 'closed');

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

-- Idempotent re-create
DROP TRIGGER IF EXISTS trg_auto_close_quick_fixes_on_sd_completion ON strategic_directives_v2;

CREATE TRIGGER trg_auto_close_quick_fixes_on_sd_completion
  AFTER UPDATE ON strategic_directives_v2
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION fn_auto_close_quick_fixes_on_sd_completion();

-- No backfill: there is no reliable signal for which historical open QFs were
-- superseded by which completed SD (the link did not exist). The FR-3 advisory
-- prompt populates resolution_sd_id going forward.
