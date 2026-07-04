-- @chairman-gated
-- @approved-by: codestreetlabs@gmail.com
-- Migration: ventures_launch_mode — SD-LEO-INFRA-LAUNCH-MODE-POLICY-001 (FR-1).
-- Additive, backward-compatible: adds a per-venture artifact-authenticity axis distinct
-- from the existing lifecycle-stage `pipeline_mode` column. Defaults every existing row
-- to 'simulated' (today's de-facto behavior), so nothing downstream changes until the
-- chairman explicitly sets a venture to 'live' via the existing S23 decision-queue /
-- StageSettingsSheet config mechanism (ehg repo, unchanged by this SD).
-- Chairman-gated apply (requires_chairman_apply) — staged, not auto-applied at merge.

ALTER TABLE ventures
  ADD COLUMN IF NOT EXISTS launch_mode TEXT NOT NULL DEFAULT 'simulated';

ALTER TABLE ventures
  DROP CONSTRAINT IF EXISTS ventures_launch_mode_check;

ALTER TABLE ventures
  ADD CONSTRAINT ventures_launch_mode_check CHECK (launch_mode IN ('simulated', 'live'));

COMMENT ON COLUMN ventures.launch_mode IS
  'Artifact-authenticity axis (simulated|live) — simulated: sim-gates verify labeled-simulation artifacts (default, current behavior). live: live-gates verify EXTERNAL observations only (deployed endpoint 200, real billing product id, real telemetry rows), never self-authored artifacts. Set by the chairman at S23/go-live. Distinct from pipeline_mode (lifecycle-stage axis: building/operations/growth/...).';
