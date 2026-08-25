-- 20260825_register_uat_robustness_gate_enforce_flag.sql
-- SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C (FR-1, TR-3)
--
-- Registers the feature flag gating the new UAT robustness choke-point in
-- _advanceStage() (lib/eva/uat-robustness-gate.js, wired in
-- stage-execution-worker.js). Mirrors LEO_SYNTHETIC_ACTOR_FENCE_ENFORCE's
-- established convention: default OFF/observe-only, no schema DDL, purely a
-- data row on the existing leo_feature_flags table.
--
-- Safe by construction even with is_enabled left at its default: the gate
-- itself only ever `applies` once a stage row carries
-- metadata.gates.uat_robustness_required = true, which no stage carries
-- until child B (the stage-key SSOT migration) lands. Until then this flag
-- and the choke-point it gates are both true no-ops.
--
-- Idempotent: ON CONFLICT (flag_key) DO NOTHING -- a later operator flip to
-- is_enabled=true must never be silently reverted by a re-run.

INSERT INTO leo_feature_flags (
  flag_key, display_name, description, is_enabled, lifecycle_state,
  risk_tier, is_temporary, gates_what, enablement_criteria
) VALUES (
  'LEO_UAT_ROBUSTNESS_GATE_ENFORCE',
  'UAT Robustness Gate Enforcement (dedicated venture UAT stage)',
  'Gates whether the UAT robustness choke-point in _advanceStage() (SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C, FR-1) BLOCKS advancement past a stage marked with metadata.gates.uat_robustness_required=true when the latest recorded UAT run for that venture/stage is not quality_gate=GREEN, vs. only logging (observe-only). Default OFF. Also a true no-op today: no stage row yet carries the required marker (set by child B, the stage-key SSOT migration).',
  false,
  'disabled',
  'high',
  false,
  'Advancement past any stage with venture_stages.metadata.gates.uat_robustness_required=true (none today)',
  'Enable only after child B has landed the dedicated UAT stage with the gate marker set, and at least one venture has a recorded GREEN UAT run demonstrating the full control pack (manifest, live-deployment binding, run-unique evidence, canary mutation control, fence two-sidedness) firing correctly end-to-end.'
)
ON CONFLICT (flag_key) DO NOTHING;
