-- Migration: Add eva_support_decision_log.decision_kind + metadata columns for SD recommendation audit.
-- Source: SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C, PRD FR-0 Migration 2, DATABASE deep review evidence row 64396c27.
-- Why: PRD FR-5 (recommendation emitter) writes one row per outcome (sd_recommendation | reader_disabled |
-- reader_error | render_crashed | skipped_duplicate). Existing schema has no decision_kind column and no
-- generic metadata jsonb — the existing 'references' jsonb is semantically for citations, not decision payload.
-- Safety: additive, non-breaking. eva_support_decision_log has 0 rows currently (Phase 2 just shipped).
-- Default '{}'::jsonb on metadata satisfies NOT NULL for any future inserts.
-- Rollback: ALTER TABLE eva_support_decision_log DROP CONSTRAINT IF EXISTS eva_support_decision_log_decision_kind_check;
--           ALTER TABLE eva_support_decision_log DROP COLUMN IF EXISTS metadata, DROP COLUMN IF EXISTS decision_kind;

ALTER TABLE eva_support_decision_log
  ADD COLUMN IF NOT EXISTS decision_kind text;

-- Backfill any existing rows to a safe default before enforcing NOT NULL.
-- (Defensive: if migration is re-applied or future rows exist, this is idempotent.)
UPDATE eva_support_decision_log
  SET decision_kind = 'sd_recommendation'
  WHERE decision_kind IS NULL;

ALTER TABLE eva_support_decision_log
  ALTER COLUMN decision_kind SET NOT NULL;

-- Add CHECK constraint with IF NOT EXISTS guard (PostgreSQL 9.6+ ADD CONSTRAINT supports name re-use protection
-- via DO block).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'eva_support_decision_log_decision_kind_check'
  ) THEN
    ALTER TABLE eva_support_decision_log
      ADD CONSTRAINT eva_support_decision_log_decision_kind_check
      CHECK (decision_kind IN (
        'sd_recommendation',
        'reader_disabled',
        'reader_error',
        'render_crashed',
        'skipped_duplicate'
      ));
  END IF;
END$$;

ALTER TABLE eva_support_decision_log
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN eva_support_decision_log.decision_kind IS
  'Enum tag for EVA Support decision-log entry kind. See PRD-SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C FR-5: sd_recommendation (chairman-facing SD creation suggestion), reader_disabled (EVA_SD_READER_ENABLED=false audit), reader_error (sd-reader query failure), render_crashed (recommendation render failed but audit row landed via try/finally), skipped_duplicate (≥80% intent match with existing SD).';

COMMENT ON COLUMN eva_support_decision_log.metadata IS
  'JSONB payload specific to decision_kind. For sd_recommendation: { eva_invocation_id, intent_text, recommended_sd_key, confidence, counterfactual, outcome: approved|declined|skipped_duplicate|render_crashed, override_reason?, dup_sd_key?, error_message? }. For reader_disabled: { eva_invocation_id, flag_value: false|unset, invoked_at }. Schema is forward-extensible without column changes.';
