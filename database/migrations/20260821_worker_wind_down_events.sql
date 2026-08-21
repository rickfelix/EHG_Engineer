-- SD-LEO-INFRA-WIND-DOWN-SURVEY-001 (FR-1) — dedicated, unread machine-telemetry table for
-- worker Stop-hook wind-down events, replacing the feedback(category='wind_down_survey') mirror.
-- @chairman-gated
--
-- ⚠ THERE IS DELIBERATELY NO `-- @approved-by:` LINE IN THIS FILE.
--   The REVOKE/GRANT statements below (required posture for a new service-role-only table —
--   pg_default_acl in public grants arwdDxtm to anon/authenticated on every new relation by
--   default) put this migration in scripts/lib/migration-tier-classifier.mjs's FORBIDDEN_TOPLEVEL
--   set, making it TIER-2 regardless of the RLS+POLICY statements alone staying TIER-1 (verified
--   empirically: RLS+POLICY-only classifies TIER-1; adding REVOKE/GRANT flips to TIER-2).
--   The builder that authored this file holds none of the 3-factor chairman-gate credentials and
--   MUST NOT forge the attestation. The chairman adds the `@approved-by` line and runs:
--       node scripts/apply-migration.js database/migrations/20260821_worker_wind_down_events.sql --prod-deploy
--   APPLY IS NOT MINE. Until it is applied, wind_down_survey stop-reason telemetry is written
--   NOWHERE (not feedback — that write path was removed in the same PR — and not this table,
--   since it does not exist yet) — a fail-open, stderr-logged no-op, not a crash. Currently
--   write-only with zero readers (Explore reader census, this SD's LEAD phase), so the practical
--   impact of the gap is low, but it is a KNOWN, DECLARED gap, not a clean cutover.
--
-- ⚠ NO EXPLICIT BEGIN/COMMIT. apply-migration.js already wraps the file in BEGIN/COMMIT.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- WHY THIS TABLE EXISTS.
--
-- scripts/hooks/stop-loop-wakeup-reminder.cjs's recordWindDown() previously mirrored every
-- worker Stop-hook firing (fleet-wide) into feedback(category='wind_down_survey') for a stated
-- "fleet-wide stop-reason distribution analysis" purpose. lib/governance/gauge-registry.js's own
-- 'wind-down-survey' entry documents zero dedicated reader ever existed. Meanwhile the category
-- dominated feedback inflow: 68.4% of ALL feedback rows over a 24h window (206 of 301, measured
-- 2026-08-21), 14,122 total rows, diluting the shared human-facing table even after two prior
-- QFs (QF-20260803-503, QF-20260802-966, both merged 2026-08-21) already fixed the STATUS-based
-- human-triage-queue flood specifically.
--
-- lib/governance/feedback-audience.js's own MACHINE_TELEMETRY_CATEGORIES comment names the
-- correct fix directly: "a non-aggregating machine lane... belongs to this module's owner, not
-- to a hook SD" — i.e. a genuinely separate table (this one), not a FOURTH per-consumer
-- exclusion list (three already exist: feedback-audience.js, lib/quality/assist-engine.js's
-- FLEET_OPS_TELEMETRY_CATEGORIES, scripts/sd-from-feedback.js's RELAYED_CLAIM_CATEGORIES).
--
-- DEDUP_KEY preserves the OLD emitFeedback dedup_key's exact idempotency contract ("one row per
-- session per minute-bucket per reason — idempotent if the hook fires twice") via an app-computed
-- column + UNIQUE constraint, so switching destinations does not silently drop that safety
-- property. NOT a GENERATED column: to_char(timestamptz, ...) (and date_trunc on a timestamptz)
-- are STABLE, not IMMUTABLE, in Postgres — their output depends on the session's timezone GUC —
-- so Postgres rejects them in a GENERATED ALWAYS AS expression ("generation expression is not
-- immutable"). Caught live by scripts/probe-wind-down-events-migration.mjs before this shipped.
-- The caller (recordWindDown) computes dedup_key the same way the OLD emitFeedback call did
-- (`${sessionId}::${reason}::${at.slice(0,16)}`) and supplies it explicitly on INSERT.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.worker_wind_down_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  text NOT NULL,
  reason      text NOT NULL,
  had_claim   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedup_key   text NOT NULL
);

COMMENT ON TABLE public.worker_wind_down_events IS
  'SD-LEO-INFRA-WIND-DOWN-SURVEY-001 (FR-1) — write-only fleet-wide worker Stop-hook telemetry, one row per (session_id, reason, minute) via the dedup_key UNIQUE constraint. Written by scripts/hooks/stop-loop-wakeup-reminder.cjs recordWindDown(); replaces the feedback(category=wind_down_survey) mirror this table exists to stop. No dedicated reader as of creation (matches the table it replaces) — a future stop-reason distribution reader queries this table directly. Service-role only.';

CREATE INDEX IF NOT EXISTS worker_wind_down_events_created_at_idx
  ON public.worker_wind_down_events (created_at);

-- Declared standalone (not inline in CREATE TABLE) so a partial apply or manual drop of just the
-- constraint can be repaired by re-running this file — matching drive_rank_snapshots.sql's
-- established idempotent-constraint convention.
DO $wwde_uniq$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.worker_wind_down_events'::regclass
      AND conname = 'worker_wind_down_events_dedup_key_uniq'
  ) THEN
    ALTER TABLE public.worker_wind_down_events
      ADD CONSTRAINT worker_wind_down_events_dedup_key_uniq UNIQUE (dedup_key);
  END IF;
END
$wwde_uniq$;

-- ---------------------------------------------------------------------------
-- Posture: service-role only. Asserted, not inherited.
-- ---------------------------------------------------------------------------
ALTER TABLE public.worker_wind_down_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS worker_wind_down_events_service_role ON public.worker_wind_down_events;
CREATE POLICY worker_wind_down_events_service_role
  ON public.worker_wind_down_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.worker_wind_down_events FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.worker_wind_down_events TO service_role;

-- ---------------------------------------------------------------------------
-- Self-verification: fail the deploy if the table OR ITS POSTURE did not land.
-- ---------------------------------------------------------------------------
DO $wwde_verify$
DECLARE
  v_anon_any   boolean;
  v_authn_any  boolean;
BEGIN
  ASSERT to_regclass('public.worker_wind_down_events') IS NOT NULL,
    'worker_wind_down_events table did not land';

  ASSERT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.worker_wind_down_events'::regclass AND relrowsecurity
  ), 'worker_wind_down_events: RLS is NOT enabled — the service-role-only classification does not hold';

  ASSERT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'worker_wind_down_events'
      AND policyname = 'worker_wind_down_events_service_role'
  ), 'worker_wind_down_events: service-role policy is missing';

  -- SECURITY evidence (d0547fd5): has_table_privilege() with a single privilege only proves
  -- THAT ONE is revoked — a comma-separated list checks whether ANY of them is still held, which
  -- is the actual "is this table anon/authenticated-writable in any way" question. Checking the
  -- full class (not just INSERT) so a leaked SELECT/UPDATE/DELETE/TRUNCATE/REFERENCES grant can't
  -- pass this assert silently.
  SELECT has_table_privilege('anon', 'public.worker_wind_down_events', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') INTO v_anon_any;
  SELECT has_table_privilege('authenticated', 'public.worker_wind_down_events', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') INTO v_authn_any;
  IF v_anon_any OR v_authn_any THEN
    RAISE EXCEPTION 'worker_wind_down_events: anon/authenticated still hold SOME table-level privilege after REVOKE (anon=%, authenticated=%)', v_anon_any, v_authn_any;
  END IF;

  ASSERT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.worker_wind_down_events'::regclass
      AND conname = 'worker_wind_down_events_dedup_key_uniq'
  ), 'worker_wind_down_events: dedup_key UNIQUE constraint is missing';

  RAISE NOTICE 'worker_wind_down_events verified: table + RLS + policy + revoked-grants + dedup_key constraint all present';
END
$wwde_verify$;

-- VERIFY (run after apply; a migration file is a lead, never proof a live object changed):
--   SELECT to_regclass('public.worker_wind_down_events');
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.worker_wind_down_events'::regclass;
--   SELECT has_table_privilege('anon', 'public.worker_wind_down_events', 'INSERT');  -- must be false
--   SELECT has_table_privilege('authenticated', 'public.worker_wind_down_events', 'INSERT');  -- must be false
