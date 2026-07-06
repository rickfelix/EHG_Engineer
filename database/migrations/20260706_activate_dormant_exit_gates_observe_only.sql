-- @approved-by: codestreetlabs@gmail.com
--
-- 20260706_activate_dormant_exit_gates_observe_only.sql
-- SD-LEO-INFRA-ACTIVATE-DORMANT-EXIT-001 (FR-1)
--
-- Solomon's portfolio-scale finding, verified first-hand: 5 of the 6 fail-closed-capable
-- exit-gate verifiers in lib/eva/lifecycle/exit-gate-verifiers.js are coded + registered
-- but NEVER declared on any venture_stages.metadata.gates.exit array, so the enforcer
-- (lib/eva/lifecycle/exit-gate-enforcer.js) never dispatches them: fail-closed-capable
-- DEAD CODE. Confirmed by grepping every migration (zero matches for the 5 gate strings
-- before this file) and querying live venture_stages rows for stages 18/19/20/23/24 (none
-- contained these strings). Only 'spend guardrails ready' was wired, by the
-- 20260627_s19_spend_guardrails_exit_gate.sql precedent this migration mirrors.
--
-- WHY exit_observe (NOT exit): MarketLens is mid-launch-walk at S24 -- directly adding
-- these 5 strings to the existing BINDING metadata.gates.exit array could block the
-- flagship on a mis-mapped stage/gate-string pairing with zero warning. This migration
-- declares them into a NEW, separate metadata.gates.exit_observe array instead. FR-2
-- (lib/eva/lifecycle/exit-gate-enforcer.js) dispatches exit_observe gates to the SAME
-- verifier functions but only LOGS would-reject results (system_events) -- it never
-- affects the `allowed` advancement decision. The eventual flip to binding (moving a
-- string from exit_observe to exit) is a separate, later, hand-verified migration per
-- FR-3's named criterion -- explicitly NOT performed here.
--
-- STAGE MAPPING (FR-4, hand-verified against each verifier's actual implementation):
--   S19 (Application deployed / pre-deploy provisioning-readiness):
--     'stack descriptor valid'          -> verifyStackDescriptorValid
--     'deployment target provisioned'   -> verifyDeploymentTargetProvisioned
--     Both read ventures.stack_descriptor pre-deploy state, alongside the existing S19
--     binding gates (spend guardrails ready, Application deployed, GitHub repo URL).
--   S24 (Go Live -- matches this SD's own smoke-test target venture, MarketLens):
--     'pages url live'                  -> verifyPagesUrlLive
--     'compute deployed'                -> verifyComputeDeployed
--     'publish evidence recorded'       -> verifyPublishEvidenceRecorded
--     All three read ventures.stack_descriptor.publish.*, written exclusively by
--     lib/venture-deploy/publish.js -- a go-live-time artifact, hence S24 (alongside the
--     existing S24 binding gates: Launch triggered, All channels activated).
--     NOTE: publish.js currently has NO live caller anywhere in the codebase (only its
--     own unit test imports it) -- these 3 strings will very likely observe-reject 100%
--     of ventures until a separate SD wires publish() into the real Go-Live flow. This is
--     an EXPECTED, informative outcome of observe-only mode, not a bug in this migration.
--
-- Additive + idempotent: only adds the NEW exit_observe key (does not touch the existing
-- gates.exit array or its order); the WHERE guard makes a re-run a no-op.
--
-- Rollback: UPDATE venture_stages SET metadata = metadata #- '{gates,exit_observe}'
--   WHERE stage_number IN (19, 24);

BEGIN;

UPDATE venture_stages
SET metadata = jsonb_set(
      metadata,
      '{gates,exit_observe}',
      '["stack descriptor valid", "deployment target provisioned"]'::jsonb
    ),
    updated_at = now()
WHERE stage_number = 19
  AND (metadata->'gates'->'exit_observe') IS NULL;

UPDATE venture_stages
SET metadata = jsonb_set(
      metadata,
      '{gates,exit_observe}',
      '["pages url live", "compute deployed", "publish evidence recorded"]'::jsonb
    ),
    updated_at = now()
WHERE stage_number = 24
  AND (metadata->'gates'->'exit_observe') IS NULL;

COMMIT;
