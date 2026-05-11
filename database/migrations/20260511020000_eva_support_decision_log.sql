-- database/migrations/20260511020000_eva_support_decision_log.sql
--
-- SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-B / TR-1
-- Mirrors envelope v1.0 REQUIRED_FIELDS verbatim (see scripts/eva-support/decision-log-formatter.js).
-- service_role-only RLS posture (writer/reader is a server-side EVA process).

CREATE TABLE IF NOT EXISTS eva_support_decision_log (
  schema_version  VARCHAR(8)  NOT NULL CHECK (schema_version = '1.0'),
  task_id         TEXT        NOT NULL,
  sequence        INTEGER     NOT NULL CHECK (sequence > 0),
  timestamp       TIMESTAMPTZ NOT NULL,
  flow            TEXT        NOT NULL,
  eva_reply_summary       TEXT NOT NULL CHECK (length(eva_reply_summary)       <= 500),
  operator_input_summary  TEXT NOT NULL CHECK (length(operator_input_summary)  <= 500),
  override_reason TEXT,
  model           TEXT        NOT NULL,
  tokens_in       INTEGER     NOT NULL CHECK (tokens_in  >= 0),
  tokens_out      INTEGER     NOT NULL CHECK (tokens_out >= 0),
  "references"    JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, sequence)
);

-- Plain b-tree index on (timestamp DESC). NOTE: partial-index variant
-- "WHERE timestamp > now() - interval '14 days'" was REJECTED because
-- now() is STABLE, not IMMUTABLE — Postgres rejects non-IMMUTABLE
-- predicates in CREATE INDEX. The plain index serves the recentEntries
-- query equivalently via index range scan.
CREATE INDEX IF NOT EXISTS idx_eva_support_decision_log_ts
  ON eva_support_decision_log (timestamp DESC);

ALTER TABLE eva_support_decision_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all
  ON eva_support_decision_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE  eva_support_decision_log IS
  'EVA Support decision log. Mirrors envelope v1.0 REQUIRED_FIELDS verbatim per scripts/eva-support/decision-log-formatter.js. service_role-only RLS.';
COMMENT ON COLUMN eva_support_decision_log."references" IS
  'JSONB array of citation refs. Name matches envelope v1.0 REQUIRED_FIELDS verbatim; quote as "references" in raw SQL to avoid FK-reference keyword ambiguity.';
COMMENT ON COLUMN eva_support_decision_log.flow IS
  'Validated app-side against FLOWS list (see decision-log-formatter.js). No DB CHECK to keep value-set evolution in code.';

-- ROLLBACK: DROP TABLE IF EXISTS eva_support_decision_log;
