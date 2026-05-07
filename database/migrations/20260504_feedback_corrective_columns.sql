-- SD-LEO-INFRA-CORRECTIVE-FINDING-REDIRECT-001 — PR1 of 5
-- Adds 6 nullable columns to feedback table to support corrective-finding redirect.
-- Findings from corrective-sd-generator and quality-findings/sd-generator now record
-- here (category='corrective_finding') instead of inserting draft SDs into
-- strategic_directives_v2. The triage CLI promotes selected findings to SDs.
--
-- Validated by DATABASE sub-agent run b2db4da3-dc33-4f85-b7eb-fcd1e0d088d2:
--   - feedback table verified: 57 cols, 843 rows, NOT NULL{id, type, source_application,
--     source_type, title, feedback_type}
--   - All 6 proposed names confirmed not present (no collision)
--   - ADD COLUMN nullable is non-blocking on PG 11+ (no table rewrite)
--   - promoted_to_sd_id MUST be varchar(50) — feedback.sd_id/strategic_directive_id/
--     resolution_sd_id all store sd_key strings, not UUIDs
--
-- Apply: supabase db query --linked --file database/migrations/20260504_feedback_corrective_columns.sql
-- Rollback: ALTER TABLE feedback DROP COLUMN IF EXISTS x6 (see rollback block at end, commented)

ALTER TABLE feedback
  ADD COLUMN IF NOT EXISTS corrective_class    text,
  ADD COLUMN IF NOT EXISTS source_gate         text,
  ADD COLUMN IF NOT EXISTS gate_run_id         uuid,
  ADD COLUMN IF NOT EXISTS promoted_to_sd_id   varchar(50),
  ADD COLUMN IF NOT EXISTS promoted_at         timestamptz,
  ADD COLUMN IF NOT EXISTS promoted_by         text;

COMMENT ON COLUMN feedback.corrective_class IS
  'Classification of corrective finding (vision_gap, arch_gap, lifecycle_feature, cli_validation, etc.). Set when category=corrective_finding. NULL for non-corrective rows.';
COMMENT ON COLUMN feedback.source_gate IS
  'Which gate detected the finding (eva_vision_score, eva_heal_score, s20_code_quality_gate). NULL for non-corrective rows.';
COMMENT ON COLUMN feedback.gate_run_id IS
  'Backref to the source gate run record (e.g., eva_vision_scores.id). NULL when source has no run-id concept. No FK constraint due to multi-source.';
COMMENT ON COLUMN feedback.promoted_to_sd_id IS
  'sd_key string of the SD created when triage CLI promoted this finding. NULL until promotion. varchar(50) matches feedback.sd_id semantics.';
COMMENT ON COLUMN feedback.promoted_at IS
  'Timestamp when triage CLI promoted this finding to an SD. Set together with promoted_to_sd_id.';
COMMENT ON COLUMN feedback.promoted_by IS
  'session_id of the operator who ran corrective-triage promote. Audit trail.';

-- ROLLBACK (uncomment if needed):
-- ALTER TABLE feedback
--   DROP COLUMN IF EXISTS corrective_class,
--   DROP COLUMN IF EXISTS source_gate,
--   DROP COLUMN IF EXISTS gate_run_id,
--   DROP COLUMN IF EXISTS promoted_to_sd_id,
--   DROP COLUMN IF EXISTS promoted_at,
--   DROP COLUMN IF EXISTS promoted_by;
