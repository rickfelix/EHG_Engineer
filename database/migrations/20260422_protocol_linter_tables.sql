-- SD-PROTOCOL-LINTER-001: Protocol Consistency Linter audit schema
-- Creates three tables for the linter's audit trail and adds an anchor_topic
-- column to leo_protocol_sections for the anchor-uniqueness rule.
--
-- Idempotent: all DDL uses IF EXISTS / IF NOT EXISTS guards so re-running
-- is safe across dev, staging, and prod environments.

BEGIN;

-- ============================================================================
-- 1. leo_lint_rules — rule registry with promotion state
-- ============================================================================
CREATE TABLE IF NOT EXISTS leo_lint_rules (
  rule_id              TEXT PRIMARY KEY,
  severity             TEXT NOT NULL CHECK (severity IN ('warn', 'block')),
  description          TEXT NOT NULL,
  source_path          TEXT NOT NULL,
  enabled              BOOLEAN NOT NULL DEFAULT TRUE,
  promoted_from_warn_at TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE leo_lint_rules IS
  'Registry of protocol-lint rules. Severity defaults to warn; promotion to block requires 2+ clean regens (see /admin/protocol-lint). SD-PROTOCOL-LINTER-001.';

CREATE INDEX IF NOT EXISTS idx_leo_lint_rules_enabled
  ON leo_lint_rules (enabled)
  WHERE enabled = TRUE;

-- ============================================================================
-- 2. leo_lint_run_history — one row per regen/audit/bypass run
-- ============================================================================
CREATE TABLE IF NOT EXISTS leo_lint_run_history (
  run_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger           TEXT NOT NULL CHECK (trigger IN ('regen', 'audit', 'bypass', 'precommit')),
  total_violations  INTEGER NOT NULL DEFAULT 0,
  critical_count    INTEGER NOT NULL DEFAULT 0,
  passed            BOOLEAN NOT NULL,
  bypass_reason     TEXT,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at          TIMESTAMPTZ,
  duration_ms       INTEGER,
  initiator         TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE leo_lint_run_history IS
  'Append-only log of every linter run. trigger=bypass rows track --skip-lint invocations for rate-limiting (3/week) and chairman dashboard reporting. SD-PROTOCOL-LINTER-001.';

CREATE INDEX IF NOT EXISTS idx_leo_lint_run_history_trigger_started
  ON leo_lint_run_history (trigger, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_leo_lint_run_history_started
  ON leo_lint_run_history (started_at DESC);

-- ============================================================================
-- 3. leo_lint_violations — one row per violation detected
-- ============================================================================
CREATE TABLE IF NOT EXISTS leo_lint_violations (
  violation_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id         UUID REFERENCES leo_lint_run_history (run_id) ON DELETE SET NULL,
  rule_id        TEXT NOT NULL REFERENCES leo_lint_rules (rule_id) ON DELETE RESTRICT,
  section_id     UUID,
  file_path      TEXT,
  severity       TEXT NOT NULL CHECK (severity IN ('warn', 'block')),
  message        TEXT NOT NULL,
  context        JSONB NOT NULL DEFAULT '{}'::jsonb,
  status         TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'acknowledged', 'resolved', 'false_positive')),
  status_reason  TEXT,
  detected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at    TIMESTAMPTZ,
  resolved_by    TEXT
);

COMMENT ON TABLE leo_lint_violations IS
  'Append-only audit of every violation produced by the protocol linter. status=false_positive flags rules for review when FP rate exceeds 10%. SD-PROTOCOL-LINTER-001.';

CREATE INDEX IF NOT EXISTS idx_leo_lint_violations_rule_detected
  ON leo_lint_violations (rule_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_leo_lint_violations_status_detected
  ON leo_lint_violations (status, detected_at DESC)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_leo_lint_violations_run
  ON leo_lint_violations (run_id);

CREATE INDEX IF NOT EXISTS idx_leo_lint_violations_section
  ON leo_lint_violations (section_id)
  WHERE section_id IS NOT NULL;

-- ============================================================================
-- 4. anchor_topic column on leo_protocol_sections
--    Supports the anchor-uniqueness rule (detects duplicated authoritative
--    lists across sections).
-- ============================================================================
ALTER TABLE leo_protocol_sections
  ADD COLUMN IF NOT EXISTS anchor_topic TEXT;

CREATE INDEX IF NOT EXISTS idx_leo_protocol_sections_anchor_topic
  ON leo_protocol_sections (anchor_topic)
  WHERE anchor_topic IS NOT NULL;

COMMENT ON COLUMN leo_protocol_sections.anchor_topic IS
  'Tags a section as the authoritative source for a specific topic (e.g., "9-question-gate", "pause-points"). Enables anchor-uniqueness rule: more than one section with the same anchor_topic is a violation. SD-PROTOCOL-LINTER-001.';

-- ============================================================================
-- 5. updated_at trigger for leo_lint_rules
-- ============================================================================
CREATE OR REPLACE FUNCTION tg_leo_lint_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leo_lint_rules_updated_at ON leo_lint_rules;
CREATE TRIGGER trg_leo_lint_rules_updated_at
  BEFORE UPDATE ON leo_lint_rules
  FOR EACH ROW
  EXECUTE FUNCTION tg_leo_lint_rules_updated_at();

COMMIT;

-- Rollback (manual, for reference):
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_leo_lint_rules_updated_at ON leo_lint_rules;
-- DROP FUNCTION IF EXISTS tg_leo_lint_rules_updated_at();
-- DROP TABLE IF EXISTS leo_lint_violations;
-- DROP TABLE IF EXISTS leo_lint_run_history;
-- DROP TABLE IF EXISTS leo_lint_rules;
-- ALTER TABLE leo_protocol_sections DROP COLUMN IF EXISTS anchor_topic;
-- COMMIT;
