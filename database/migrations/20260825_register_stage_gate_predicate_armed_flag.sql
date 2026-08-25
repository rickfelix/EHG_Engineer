-- 20260825_register_stage_gate_predicate_armed_flag.sql
-- SD-LEO-INFRA-STAGE-GATE-PREDICATE-001 (FR-2)
--
-- Registers the STAGE_GATE_PREDICATE_ARMED flag, following the exact pattern of
-- 20260823_register_path_integrity_flags.sql / 20260821_register_synthetic_actor_fence_enforce_flag.sql.
--
-- STAGE_GATE_PREDICATE_ARMED: gates whether lib/governance/stage-gate-predicate.js's
-- checkStageGate() actually BLOCKS a stage-mismatched external-contact SD/QF, vs.
-- only writing a shadow-mode audit_log row (metadata.armed=false) and letting the
-- caller proceed. Default OFF -- this SD explicitly builds and ships in PARALLEL
-- with the sibling SD-LEO-INFRA-STAGE-WRITER-CHOKE-001 (chairman-commissioned
-- program, coordinator resolution 2026-08-25T11:45Z), and enforcement must not go
-- live until (a) that sibling SD lands and (b) a chairman ratification sitting
-- runs -- both are explicitly named ENABLEMENT preconditions, not build
-- preconditions. lib/feature-flags/evaluator.js's isEnabled() already fails safe
-- to `false` (unarmed/shadow) on any read fault (flag missing, cache issue,
-- kill-switch active) -- the correct safe direction for this flag, since an
-- unarmed predicate makes no blocking decisions at all.
--
-- Explicitly set lifecycle_state='disabled' rather than relying on the column
-- default -- leo_feature_flags has a live CHECK constraint
-- chk_flag_lifecycle_enabled_consistency (CHECK (is_enabled = (lifecycle_state =
-- 'enabled'))) that a naive {is_enabled:false} INSERT without an explicit
-- lifecycle_state would violate.
--
-- Idempotent: ON CONFLICT (flag_key) DO NOTHING -- this migration only ever
-- establishes the initial safe-default row; a later chairman-authorized flip to
-- enabled must never be silently reverted by a re-run.

INSERT INTO leo_feature_flags (
  flag_key, display_name, description, is_enabled, lifecycle_state,
  risk_tier, is_temporary, gates_what, enablement_criteria
) VALUES
(
  'STAGE_GATE_PREDICATE_ARMED',
  'Stage-Gate Predicate: External-Contact Enforcement',
  'Gates whether the stage-gate predicate (requiredStage(sd/qf) <= ventureStage(venture_id), lib/governance/stage-gate-predicate.js) BLOCKS a venture-linked, external-contact-touching SD/QF whose target venture has not reached the required lifecycle stage, vs. only writing a shadow-mode audit_log row and letting the action proceed. Default OFF -- built and shipped in parallel with the sibling SD-LEO-INFRA-STAGE-WRITER-CHOKE-001; gating on a dormant/untruthful stage instrument would produce stage-advancement-as-paperwork, the exact failure mode this predicate exists to prevent.',
  false,
  'disabled',
  'high',
  false,
  'The 5 stage-gate predicate call sites: SD mint (leo-create-sd.js), claim gate (lib/claim-validity-gate.js), coordinator dispatch (lib/coordinator/dispatch.cjs), QF triage (classify-quick-fix.js/create-quick-fix.js), and the action-time re-checks in lib/marketing/ai/email-campaigns.js and lib/marketing/autonomy-gate.js.',
  'Enable only after (a) SD-LEO-INFRA-STAGE-WRITER-CHOKE-001 lands (the canonical venture-stage writer choke, making the stage instrument truthful) and (b) the chairman ratification sitting for that instrument has run.'
)
ON CONFLICT (flag_key) DO NOTHING;
