-- 20260821_register_synthetic_actor_fence_enforce_flag.sql
-- SD-LEO-INFRA-ALTIFYAI-TEST-IDENTITY-001 (FR-6 AC#4, closing SEC-42)
--
-- EXEC-TO-PLAN SECURITY finding: the fenced synthetic-actor choke-point
-- (_advanceStage(), stage-execution-worker.js) shipped unconditionally
-- BINDING with no feature flag -- a live risk, since AltifyAI is already at
-- current_lifecycle_stage=19 with metadata.uat_probe_required=true and
-- LEO_ALTIFYAI_UAT_READ_TOKEN unprovisioned. Merging as-shipped would have
-- hard-blocked AltifyAI's next Stage 19->20 attempt with no off switch short
-- of a code revert.
--
-- This row makes the DEFAULT explicit and documented rather than relying on
-- absence: is_enabled=false means the guard runs in OBSERVE-ONLY mode (logs
-- what it would have blocked, but does not block) -- see the flag-read
-- branch in _advanceStage(). Flip is_enabled=true only once
-- LEO_ALTIFYAI_UAT_READ_TOKEN is provisioned AND the chairman's identity
-- setup (FR-1/FR-5 keystrokes) is confirmed complete.
--
-- Idempotent: ON CONFLICT (flag_key) DO NOTHING -- this migration only ever
-- establishes the initial safe-default row; a later operator flip to
-- is_enabled=true must never be silently reverted by a re-run.

INSERT INTO leo_feature_flags (
  flag_key, display_name, description, is_enabled, lifecycle_state,
  risk_tier, is_temporary, gates_what, enablement_criteria
) VALUES (
  'LEO_SYNTHETIC_ACTOR_FENCE_ENFORCE',
  'Synthetic-Actor Fence Enforcement (Stage 19->20)',
  'Gates whether the fenced synthetic-actor choke-point in _advanceStage() (SD-LEO-INFRA-ALTIFYAI-TEST-IDENTITY-001, FR-6) BLOCKS a Stage 19->20 advance on an unmet/unverified live signed-in UAT check, vs. only logging (observe-only). Default OFF -- a venture opted into this check (metadata.uat_probe_required=true) advances normally with a warning log until this flag is explicitly enabled.',
  false,
  'disabled',
  'high',
  false,
  'Stage 19->20 advancement for any venture with metadata.uat_probe_required=true (currently: AltifyAI only)',
  'Enable only after LEO_ALTIFYAI_UAT_READ_TOKEN is provisioned in EHG_Engineer AND the chairman has completed the FR-1/FR-5 identity-creation keystrokes AND CHAIRMAN_UAT_SESSION_TOKEN is confirmed set in the altifyai repo secrets.'
)
ON CONFLICT (flag_key) DO NOTHING;
