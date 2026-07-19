-- SD-LEO-INFRA-COORDINATOR-SUCCESSION-PROTOCOL-001 — coordinator succession tables.
-- STAGED / chairman-gated apply (additive-only). Pattern precedent:
-- 20260614_role_handoff_atomic_coordinator_flag.sql (DO-block self-verify + _DOWN companion).
-- Code paths (lib/coordinator/succession.cjs) FAIL-OPEN with a loud startup canary while
-- this migration is merged-but-unapplied — applying it activates history + follow-ons.
--
-- FR-3: coordinator_role_history — durable tenure trace (who held the role, when, how it
--       ended) so successions are auditable and the 43h-coverage-gap class is measurable.
-- FR-4: coordinator_follow_ons — durable promise registry inherited across successions
--       (the cycle-6 VERIFIED class: promises stop dying with session memory).
-- RLS ships IN THIS SAME MIGRATION (hard repo rule: RLS-at-create). Posture is
-- SERVICE-ROLE ONLY: these tables hold fleet-internal coordination metadata read and
-- written exclusively by service-role clients; no authenticated/anon policy exists at
-- all (rls-anon-tenant-predicate-lint: an unconditional authenticated USING(true) read
-- is the SD-LEO-GEN-SCOPE-ANON-KEY-001 / SD-FDBK-FIX-FEEDBACK-SELECT class).

BEGIN;

-- ── FR-3: role history ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coordinator_role_history (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       text NOT NULL,
  started_at       timestamptz NOT NULL DEFAULT now(),
  ended_at         timestamptz NULL,
  -- NULL while the tenure is open; set exactly when ended_at is set (consistency guard).
  end_cause        text NULL CHECK (end_cause IS NULL OR end_cause IN ('graceful', 'stale_cleanup', 'takeover')),
  ended_by_session text NULL,
  notes            text NULL,
  CONSTRAINT coordinator_role_history_closed_consistency CHECK ((ended_at IS NULL) = (end_cause IS NULL))
);

-- Fast "who is coordinator now" (open tenures) + gap queries per session.
CREATE INDEX IF NOT EXISTS idx_coord_role_history_open
  ON coordinator_role_history (started_at) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_coord_role_history_session_ended
  ON coordinator_role_history (session_id, ended_at);

ALTER TABLE coordinator_role_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY coordinator_role_history_service_write ON coordinator_role_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── FR-4: follow-on registry ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coordinator_follow_ons (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by_session text NOT NULL,
  -- FREE TEXT promise class ('review-clear', 'promised-verification', ...).
  -- NOT a session_coordination payload.kind / comms kind — the drain-set REGISTRY SD
  -- owns comms-kind vocabulary; this column must never be routed through it.
  kind               text NULL,
  subject            text NOT NULL,
  body               text NULL,
  due_hint           text NULL,
  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  closed_at          timestamptz NULL,
  closed_by_session  text NULL
);

-- Open-scan is the hot path (successor startup surfaces open follow-ons).
CREATE INDEX IF NOT EXISTS idx_coord_follow_ons_open
  ON coordinator_follow_ons (created_at) WHERE status = 'open';

ALTER TABLE coordinator_follow_ons ENABLE ROW LEVEL SECURITY;

CREATE POLICY coordinator_follow_ons_service_write ON coordinator_follow_ons
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Self-verify (tables + RLS presence, per TESTING GAP-4) ───────────────────
DO $verify$
DECLARE
  rls_history boolean;
  rls_follow  boolean;
BEGIN
  ASSERT to_regclass('public.coordinator_role_history') IS NOT NULL,
    'coordinator_role_history missing after create';
  ASSERT to_regclass('public.coordinator_follow_ons') IS NOT NULL,
    'coordinator_follow_ons missing after create';
  SELECT relrowsecurity INTO rls_history FROM pg_class WHERE oid = 'public.coordinator_role_history'::regclass;
  SELECT relrowsecurity INTO rls_follow  FROM pg_class WHERE oid = 'public.coordinator_follow_ons'::regclass;
  ASSERT rls_history, 'RLS not enabled on coordinator_role_history';
  ASSERT rls_follow,  'RLS not enabled on coordinator_follow_ons';
  ASSERT (SELECT count(*) FROM pg_policies WHERE tablename = 'coordinator_role_history') >= 1,
    'coordinator_role_history policies missing';
  ASSERT (SELECT count(*) FROM pg_policies WHERE tablename = 'coordinator_follow_ons') >= 1,
    'coordinator_follow_ons policies missing';
END
$verify$;

COMMIT;
