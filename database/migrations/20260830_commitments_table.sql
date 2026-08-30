-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-INFRA-OPEN-COMMITMENTS-RECONCILED-001 / FR-3
-- Minimal durable table for verbal/role-message commitments (e.g. a chairman/coordinator
-- verbal promise, not backed by a queryable session_coordination row). Written by the send
-- path (coordinator-reply.cjs / worker-signal.cjs) when a message body declares a
-- commitment; read by the extended relay-drop-gauge (FR-2) so a verbal commitment is
-- queryable within the same minute it is sent. Additive only -- no existing table touched.
--
-- Rollback (uncomment + execute via database-agent if needed):
--   DROP TABLE IF EXISTS commitments;

BEGIN;

CREATE TABLE IF NOT EXISTS commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_session TEXT NOT NULL,
  counterparty_session TEXT,
  subject TEXT NOT NULL,
  due_by TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commitments_owner_session ON commitments (owner_session) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_commitments_counterparty_session ON commitments (counterparty_session) WHERE resolved_at IS NULL;

COMMENT ON TABLE commitments IS 'SD-LEO-INFRA-OPEN-COMMITMENTS-RECONCILED-001 FR-3: verbal/role-message commitments not backed by a session_coordination row, read by lib/coordinator/relay-drop-gauge.cjs.';

COMMIT;
