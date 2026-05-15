-- SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-F
-- Adds provenance_source TEXT to 3 canonical-writer target tables (feedback,
-- pocock_glossary_terms, pocock_adrs) and seeds the chairman_dashboard_config
-- kill-switch row default-all-OFF. Idempotent (IF NOT EXISTS guards), backward
-- compatible (NULLABLE, no DEFAULT, no CHECK), and rollback-documented.
--
-- v1 = WIRE-BUT-OFF. Phase-1 permissive; Phase-2 (separate sibling SD)
-- introduces a writer-entry-point format validator.
--
-- EXCLUDED tables (preserve heterogeneous existing provenance fields):
--   sd_phase_handoffs.created_by, retrospectives.generated_by,
--   sub_agent_execution_results.source (22931 legacy "manual" rows)
--
-- Rollback (uncomment + run via database-agent if needed):
--   ALTER TABLE feedback DROP COLUMN IF EXISTS provenance_source;
--   ALTER TABLE pocock_glossary_terms DROP COLUMN IF EXISTS provenance_source;
--   ALTER TABLE pocock_adrs DROP COLUMN IF EXISTS provenance_source;
--   DELETE FROM app_config WHERE key = 'pocock_provenance_writers';

BEGIN;

ALTER TABLE feedback
  ADD COLUMN IF NOT EXISTS provenance_source TEXT;

ALTER TABLE pocock_glossary_terms
  ADD COLUMN IF NOT EXISTS provenance_source TEXT;

ALTER TABLE pocock_adrs
  ADD COLUMN IF NOT EXISTS provenance_source TEXT;

COMMENT ON COLUMN feedback.provenance_source IS
  'AI-provenance source per Pocock pattern. Format: agent:SEAT:ROUND_ID | human:USER_ID. NULL = legacy / human-authored. Phase-1 permissive (no CHECK). SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-F.';

COMMENT ON COLUMN pocock_glossary_terms.provenance_source IS
  'AI-provenance source per Pocock pattern. Format: agent:SEAT:ROUND_ID | human:USER_ID. NULL = legacy / human-authored. SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-F.';

COMMENT ON COLUMN pocock_adrs.provenance_source IS
  'AI-provenance source per Pocock pattern. Format: agent:SEAT:ROUND_ID | human:USER_ID. NULL = legacy / human-authored. SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-F.';

-- Seed kill-switch row in app_config with all writers default OFF. Idempotent
-- via ON CONFLICT DO NOTHING (preserves operator flips on re-run).
INSERT INTO app_config (key, value, description)
VALUES (
  'pocock_provenance_writers',
  '{"feedback":{"emit":false,"prefix":false},"glossary":{"emit":false,"prefix":false},"adr":{"emit":false,"prefix":false},"handoff":{"emit":false,"prefix":false},"retro":{"emit":false,"prefix":false}}'::jsonb,
  'Per-writer kill-switch for AI-provenance emission (SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-F). Default all OFF v1. Env POCOCK_PROVENANCE_<WRITER> overrides at runtime.'
)
ON CONFLICT (key) DO NOTHING;

COMMIT;
