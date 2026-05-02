-- Migration: Add forward-only status machine to venture_quality_findings
-- SD: SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-FR-C-001 (FR-4)
-- Date: 2026-05-02
--
-- Adds a status column with a CHECK constraint, three TIMESTAMPTZ markers
-- (sd_filed_at, resolved_at_v2, cancelled_at), and a BEFORE UPDATE trigger that
-- enforces forward-only state transitions per the FR-C′ status machine spec:
--
--   pending  -> sd_filed   (generator filed a remediation SD)
--   pending  -> cancelled  (LEAD direct-cancel without filing)
--   sd_filed -> resolved   (LEAD: remediation SD completed)
--   sd_filed -> cancelled  (LEAD: remediation SD cancelled)
--
-- All other transitions are rejected. Existing rows backfill to status='pending'
-- atomically via column DEFAULT (no UPDATE pass needed). The existing
-- UNIQUE (venture_id, finding_hash) constraint and the existing finding_hash
-- single-key dedup are preserved untouched.
--
-- NOTE: column name is `resolved_at_v2` because the original migration shipped
-- a `resolved_at TIMESTAMPTZ NULL` column already (see
-- 20260429_venture_quality_findings.sql). Renaming would break the existing
-- writer + the `venture_quality_findings_unresolved_idx` partial index. The
-- new column is the canonical "status-machine resolved_at"; the original
-- column is retained for backwards compatibility with the existing per-finding
-- generator (parent_finding_hash dedup model). Both are populated by the
-- BEFORE UPDATE trigger when a row transitions to status='resolved'.
--
-- Idempotent: uses IF NOT EXISTS / DO blocks throughout. Re-running this
-- migration is a no-op.

-- ----------------------------------------------------------------------------
-- 1. Add the status column with CHECK constraint and DEFAULT.
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'venture_quality_findings' AND column_name = 'status'
  ) THEN
    ALTER TABLE venture_quality_findings
      ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'venture_quality_findings'
      AND constraint_name = 'venture_quality_findings_status_chk'
  ) THEN
    ALTER TABLE venture_quality_findings
      ADD CONSTRAINT venture_quality_findings_status_chk
      CHECK (status IN ('pending', 'sd_filed', 'resolved', 'cancelled'));
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Add the three timestamp markers.
-- ----------------------------------------------------------------------------

ALTER TABLE venture_quality_findings
  ADD COLUMN IF NOT EXISTS sd_filed_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_at_v2 TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at   TIMESTAMPTZ;

-- ----------------------------------------------------------------------------
-- 3. Forward-only status transition trigger.
--
-- Allowed transitions (matching FR-C′ spec):
--   pending  -> sd_filed
--   pending  -> cancelled
--   sd_filed -> resolved
--   sd_filed -> cancelled
--   resolved -> resolved      (no-op self-update)
--   cancelled -> cancelled    (no-op self-update)
--   pending  -> pending       (no-op self-update)
--   sd_filed -> sd_filed      (no-op self-update; e.g., source_finding_ids[] append)
--
-- Anything else (in particular sd_filed->pending, resolved->anything,
-- cancelled->anything) raises an exception with a structured message.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION venture_quality_findings_status_transition_fn()
RETURNS TRIGGER AS $$
BEGIN
  -- Same-status updates are always allowed.
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'pending' AND NEW.status IN ('sd_filed', 'cancelled') THEN
    -- Auto-populate timestamp atomically with the status change if caller
    -- did not set it (defense-in-depth — caller should set it but trigger
    -- guarantees it).
    IF NEW.status = 'sd_filed' AND NEW.sd_filed_at IS NULL THEN
      NEW.sd_filed_at := now();
    END IF;
    IF NEW.status = 'cancelled' AND NEW.cancelled_at IS NULL THEN
      NEW.cancelled_at := now();
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'sd_filed' AND NEW.status IN ('resolved', 'cancelled') THEN
    IF NEW.status = 'resolved' AND NEW.resolved_at_v2 IS NULL THEN
      NEW.resolved_at_v2 := now();
    END IF;
    IF NEW.status = 'cancelled' AND NEW.cancelled_at IS NULL THEN
      NEW.cancelled_at := now();
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'invalid status transition: % -> % (venture_quality_findings.id=%)',
    OLD.status, NEW.status, OLD.id
    USING ERRCODE = '23514', HINT = 'Forward-only: pending->sd_filed/cancelled, sd_filed->resolved/cancelled';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS venture_quality_findings_status_transition_trg
  ON venture_quality_findings;

CREATE TRIGGER venture_quality_findings_status_transition_trg
  BEFORE UPDATE OF status ON venture_quality_findings
  FOR EACH ROW
  EXECUTE FUNCTION venture_quality_findings_status_transition_fn();

-- ----------------------------------------------------------------------------
-- 4. Index supporting FR-1's pending-finding scan filter.
-- ----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS venture_quality_findings_pending_idx
  ON venture_quality_findings (venture_id, finding_category, severity)
  WHERE status = 'pending';

COMMENT ON COLUMN venture_quality_findings.status IS
  'FR-C status machine. Forward-only transitions enforced by venture_quality_findings_status_transition_trg. pending->sd_filed/cancelled; sd_filed->resolved/cancelled.';

COMMENT ON COLUMN venture_quality_findings.sd_filed_at IS
  'Set atomically by BEFORE UPDATE trigger when status transitions pending->sd_filed.';

COMMENT ON COLUMN venture_quality_findings.resolved_at_v2 IS
  'Set atomically by BEFORE UPDATE trigger when status transitions sd_filed->resolved. Distinct from the legacy resolved_at column (kept for compatibility with the parent_finding_hash generator).';

COMMENT ON COLUMN venture_quality_findings.cancelled_at IS
  'Set atomically by BEFORE UPDATE trigger when status transitions to cancelled (from pending or sd_filed).';

-- ----------------------------------------------------------------------------
-- ROLLBACK (manual; not run automatically):
--
-- DROP TRIGGER IF EXISTS venture_quality_findings_status_transition_trg ON venture_quality_findings;
-- DROP FUNCTION IF EXISTS venture_quality_findings_status_transition_fn();
-- DROP INDEX IF EXISTS venture_quality_findings_pending_idx;
-- ALTER TABLE venture_quality_findings DROP CONSTRAINT IF EXISTS venture_quality_findings_status_chk;
-- ALTER TABLE venture_quality_findings DROP COLUMN IF EXISTS status;
-- ALTER TABLE venture_quality_findings DROP COLUMN IF EXISTS sd_filed_at;
-- ALTER TABLE venture_quality_findings DROP COLUMN IF EXISTS resolved_at_v2;
-- ALTER TABLE venture_quality_findings DROP COLUMN IF EXISTS cancelled_at;
-- ----------------------------------------------------------------------------
