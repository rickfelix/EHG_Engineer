-- 20260821_register_synthetic_actor_fencing_exit_observe.sql
-- SD-LEO-INFRA-ALTIFYAI-TEST-IDENTITY-001 (FR-6/FR-7)
--
-- Registers "synthetic-actor-fencing-configured" on stage 19's gates.exit_observe array,
-- resolved by verifySyntheticActorFencingConfigured (lib/eva/lifecycle/exit-gate-verifiers.js),
-- which delegates to the SAME bespoke check lib/eva/synthetic-actor-guard.js's
-- checkSyntheticActorFencing() runs as _advanceStage()'s PRIMARY, binding choke-point.
--
-- WHY exit_observe, NEVER gates.exit (binding): this site is defense-in-depth only. The
-- primary validation locus is _advanceStage() itself (stage-execution-worker.js), which every
-- real advancement path runs through regardless of whether this registration exists. Promoting
-- this string to gates.exit (binding) would make it a SECOND enforcement point subject to
-- exit-gate-enforcer.js's fail-closed-on-unresolvable contract — unnecessary, since the check
-- is already binding at its primary site, and risks a fleet-wide stage-19 outage if this
-- registration were ever misconfigured or the verifier import broke.
--
-- WHY THIS IS SAFE TO REGISTER FLEET-WIDE ON A SHARED, PER-STAGE-NUMBER ROW: unlike
-- checkStageArtifactPrecondition's required_artifacts (rejected in round 4 of PLAN review as the
-- FR-6 mechanism precisely because it has no per-venture opt-in), this gate string resolves to a
-- SELF-SELECTING verifier: checkSyntheticActorFencing() returns {applies:false, satisfied:true}
-- immediately, with zero GitHub API calls, for any venture whose metadata.uat_probe_required is
-- not exactly true. All 151+ non-opted-in ventures at stage 19 pass this check silently; only a
-- venture that has explicitly opted in (AltifyAI, initially) is ever actually evaluated.
--
-- Idempotent: the @> containment guard makes a re-run a no-op once the string is present.
--
-- Rollback:
--   UPDATE venture_stages
--   SET metadata = jsonb_set(
--         metadata, '{gates,exit_observe}',
--         (SELECT jsonb_agg(v) FROM jsonb_array_elements(metadata->'gates'->'exit_observe') v
--          WHERE v <> '"synthetic-actor-fencing-configured"'::jsonb)
--       ),
--       updated_at = now()
--   WHERE stage_number = 19;

BEGIN;

UPDATE venture_stages
SET metadata = jsonb_set(
      metadata,
      '{gates,exit_observe}',
      COALESCE(metadata->'gates'->'exit_observe', '[]'::jsonb) || '["synthetic-actor-fencing-configured"]'::jsonb
    ),
    updated_at = now()
WHERE stage_number = 19
  AND NOT COALESCE(metadata->'gates'->'exit_observe' @> '["synthetic-actor-fencing-configured"]'::jsonb, false);

COMMIT;
