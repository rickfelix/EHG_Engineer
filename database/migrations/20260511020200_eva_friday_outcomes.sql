-- database/migrations/20260511020200_eva_friday_outcomes.sql
--
-- SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-B / TR-5
-- Friday meeting agenda outcome tracking for downstream EVA Support surfacing.
-- service_role-only RLS posture.

CREATE TABLE IF NOT EXISTS eva_friday_outcomes (
  outcome_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_item_ref   TEXT        NOT NULL,
  outcome           TEXT        NOT NULL CHECK (outcome IN ('accepted', 'deferred', 'rejected', 'noted')),
  chairman_feedback TEXT,
  meeting_date      DATE        NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at       TIMESTAMPTZ
);

-- Partial index on meeting_date DESC WHERE consumed_at IS NULL.
-- Predicate is IMMUTABLE (NULL test only — no functions), so this is valid.
-- Supports TR-5 dispatcher query: SELECT ... WHERE consumed_at IS NULL ORDER BY meeting_date DESC LIMIT 10.
CREATE INDEX IF NOT EXISTS idx_eva_friday_outcomes_unconsumed
  ON eva_friday_outcomes (meeting_date DESC)
  WHERE consumed_at IS NULL;

ALTER TABLE eva_friday_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all
  ON eva_friday_outcomes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE  eva_friday_outcomes IS
  'EVA Friday meeting agenda outcomes. Surfaced by EVA Support dispatcher (TR-5) when consumed_at IS NULL, then marked consumed. service_role-only RLS.';
COMMENT ON COLUMN eva_friday_outcomes.agenda_item_ref IS
  'Free-form reference to the originating agenda item (no FK by design — agenda items are markdown-rendered, not persisted as their own table).';
COMMENT ON COLUMN eva_friday_outcomes.outcome IS
  'Outcome lifecycle: accepted (acted on) | deferred (revisit later) | rejected (will not pursue) | noted (informational). TEXT+CHECK is used instead of native ENUM to keep value-set evolution transactional (matches project-wide pattern).';

-- ROLLBACK: DROP TABLE IF EXISTS eva_friday_outcomes;
