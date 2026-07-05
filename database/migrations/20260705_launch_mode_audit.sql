-- Migration: launch_mode_audit — SD-LEO-INFRA-LAUNCH-MODE-POLICY-002 (FR-2).
--
-- CHAIRMAN-GATED DDL (requires_chairman_apply=true stamped on the SD at sourcing):
-- this file RIDES THE NEXT CHAIRMAN SITTING BUNDLE together with
-- 20260703_ventures_launch_mode.sql and 20260705_launch_mode_flip_guard.sql.
-- It is NEVER applied mid-EXEC. Until applied, lib/eva/launch-mode.js
-- setLaunchMode fails closed on the audit insert — no venture can flip mode,
-- which is the intended degraded state.
--
-- Every launch_mode flip records who/when/from-to. The audit row is written
-- AUDIT-FIRST by the sole write path (setLaunchMode); the flip-guard trigger
-- (companion migration) rejects launch_mode UPDATEs without a fresh matching
-- audit row, so direct writes that bypass the code path are refused too.

CREATE TABLE IF NOT EXISTS launch_mode_audit (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id  UUID NOT NULL,
  from_mode   TEXT NOT NULL CHECK (from_mode IN ('simulated', 'live')),
  to_mode     TEXT NOT NULL CHECK (to_mode IN ('simulated', 'live')),
  decided_by  TEXT NOT NULL,
  decision_id UUID,
  flipped_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_launch_mode_audit_venture
  ON launch_mode_audit (venture_id, flipped_at DESC);

COMMENT ON TABLE launch_mode_audit IS
  'SD-LEO-INFRA-LAUNCH-MODE-POLICY-002: who/when/from-to for every ventures.launch_mode flip. Written AUDIT-FIRST by lib/eva/launch-mode.js setLaunchMode (the only write path); consumed by the flip-guard trigger as defense-in-depth.';
