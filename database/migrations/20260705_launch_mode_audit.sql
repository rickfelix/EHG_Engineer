-- Migration: launch_mode_audit — SD-LEO-INFRA-LAUNCH-MODE-POLICY-002 (FR-2).
--
-- CHAIRMAN-GATED DDL (requires_chairman_apply=true stamped on the SD at sourcing):
-- this file RIDES THE NEXT CHAIRMAN SITTING BUNDLE together with
-- 20260703_ventures_launch_mode.sql and 20260705_launch_mode_flip_guard.sql.
-- It is NEVER applied mid-EXEC. Until applied, lib/eva/launch-mode.js
-- setLaunchMode fails closed on the audit insert — no venture can flip mode,
-- which is the intended degraded state.
--
-- Every launch_mode flip records who/when/from-to. Rows are written AUDIT-FIRST
-- by the sole write path (setLaunchMode) using the AUTHORITATIVE
-- chairman_decisions.decided_by; the flip-guard trigger consumes them
-- ONE-TIME-USE (consumed_at) and setLaunchMode stamps confirmed_at after a
-- verified flip — an unconfirmed row is an honest record of an aborted attempt.
--
-- Adversarial-review hardening (deep-tier PR 5633): RLS service-role-only
-- (forged '%chairman%' rows were insertable by any PostgREST client without
-- it), FKs on venture_id/decision_id, CHECK (from_mode <> to_mode).

CREATE TABLE IF NOT EXISTS launch_mode_audit (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id   UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  from_mode    TEXT NOT NULL CHECK (from_mode IN ('simulated', 'live')),
  to_mode      TEXT NOT NULL CHECK (to_mode IN ('simulated', 'live')),
  decided_by   TEXT NOT NULL,
  decision_id  UUID REFERENCES chairman_decisions(id),
  flipped_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One-time-use ticket semantics: the flip-guard trigger stamps consumed_at
  -- when a launch_mode UPDATE spends this row (closes the 60s replay window).
  consumed_at  TIMESTAMPTZ,
  -- Stamped by setLaunchMode after the rowcount-verified flip; NULL = the
  -- attempt aborted after audit-first (never mistakable for a real flip).
  confirmed_at TIMESTAMPTZ,
  CONSTRAINT launch_mode_audit_real_transition CHECK (from_mode <> to_mode)
);

CREATE INDEX IF NOT EXISTS idx_launch_mode_audit_venture
  ON launch_mode_audit (venture_id, flipped_at DESC);

-- Service-role only: audit rows are trust inputs to the flip-guard trigger —
-- they must never be writable (or readable) by anon/authenticated clients.
ALTER TABLE launch_mode_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS launch_mode_audit_service_role ON launch_mode_audit;
CREATE POLICY launch_mode_audit_service_role ON launch_mode_audit
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE launch_mode_audit IS
  'SD-LEO-INFRA-LAUNCH-MODE-POLICY-002: who/when/from-to for every ventures.launch_mode flip. AUDIT-FIRST by lib/eva/launch-mode.js setLaunchMode (the only write path, decided_by resolved from chairman_decisions); consumed one-time-use by the flip-guard trigger; confirmed_at NULL = aborted attempt.';
