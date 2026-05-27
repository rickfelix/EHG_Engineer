-- Migration: Add DEFAULT 'sd_recommendation' to eva_support_decision_log.decision_kind.
--
-- Source: SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C / CP-0 follow-up. Fixes a latent regression
-- introduced by the earlier 20260527_eva-support-decision-log-decision-kind-metadata.sql
-- migration which added decision_kind NOT NULL but did NOT add a DEFAULT. Existing Phase 2
-- writer (lib/eva-support/decision-log-store.js::insertEntry) builds rows from REQUIRED_FIELDS
-- which does NOT include decision_kind; any future Phase 2 insert would therefore fail with
-- "null value in column decision_kind violates not-null constraint".
--
-- 'sd_recommendation' is the most semantically conservative default — it is the kind the
-- Phase 3 emitter writes, and it is benign for any Phase 2 envelope writer (the existing
-- insertEntry has no concept of kind and treats all rows as a generic decision log).
--
-- Safety: additive, non-breaking. Existing rows (count was 0 before any of these migrations,
-- backfilled to 'sd_recommendation' by the prior migration) are unaffected. The CHECK
-- constraint already validates the enum.
--
-- Rollback: ALTER TABLE eva_support_decision_log ALTER COLUMN decision_kind DROP DEFAULT;

ALTER TABLE eva_support_decision_log
  ALTER COLUMN decision_kind SET DEFAULT 'sd_recommendation';

COMMENT ON COLUMN eva_support_decision_log.decision_kind IS
  'Enum tag for EVA Support decision-log entry kind. DEFAULT ''sd_recommendation'' preserves the existing Phase 2 insertEntry API (REQUIRED_FIELDS does not include decision_kind). See PRD-SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C FR-5: sd_recommendation (chairman-facing SD creation suggestion), reader_disabled (EVA_SD_READER_ENABLED=false audit), reader_error (sd-reader query failure), render_crashed (recommendation render failed but audit row landed via try/finally), skipped_duplicate (≥80% intent match with existing SD).';
