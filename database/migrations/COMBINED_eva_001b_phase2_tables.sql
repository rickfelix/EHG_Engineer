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
-- database/migrations/20260511020100_eva_support_research_cache.sql
--
-- SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-B / TR-3
-- TTL-bounded research result cache keyed by SHA-256 hex of normalized query.
-- service_role-only RLS posture.

CREATE TABLE IF NOT EXISTS eva_support_research_cache (
  query_hash    CHAR(64)    PRIMARY KEY,
  query_text    TEXT        NOT NULL,
  response_text TEXT        NOT NULL,
  "references"  JSONB       NOT NULL DEFAULT '[]'::jsonb,
  ttl_until     TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  accessed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Plain b-tree index supports eviction-scan: WHERE ttl_until < now()
CREATE INDEX IF NOT EXISTS idx_eva_support_research_cache_ttl
  ON eva_support_research_cache (ttl_until);

ALTER TABLE eva_support_research_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all
  ON eva_support_research_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE  eva_support_research_cache IS
  'EVA Support research result cache. Keyed by SHA-256 hex of normalize(query)=lowercase+trim+collapse-whitespace. TTL-bounded via ttl_until; eviction by separate cron/script (see scripts/cron/evict-research-cache.mjs if/when added). service_role-only RLS.';
COMMENT ON COLUMN eva_support_research_cache.query_text IS
  'May contain PII (e.g. user names in research queries). Protected by service_role-only RLS + TTL eviction via ttl_until. NOT encrypted at column level — relies on Supabase storage-layer encryption-at-rest.';
COMMENT ON COLUMN eva_support_research_cache."references" IS
  'JSONB array of citation refs. Quote as "references" in raw SQL to avoid FK-reference keyword ambiguity.';

-- ROLLBACK: DROP TABLE IF EXISTS eva_support_research_cache;
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
