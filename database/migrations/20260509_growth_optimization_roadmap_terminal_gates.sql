-- SD-LEO-FEAT-STAGE-GROWTH-PLAYBOOK-001 — Stage 26 Growth Playbook
--
-- Two safe forward-only UPDATEs on lifecycle_stage_config Stage 26.
-- A third operation (venture_artifacts CHECK constraint expansion) is
-- intentionally NOT in this file: regenerating the CHECK requires a
-- live pg_get_constraintdef() snapshot (148+ keys) per the sibling
-- 20260507_extend_venture_artifacts_postlaunch_v2_regenerated.sql
-- precedent. database-agent must regenerate the CHECK at apply time.
--
-- Apply via database-agent (canonical):
--   Task(subagent_type='database-agent',
--        prompt='Apply database/migrations/20260509_growth_optimization_roadmap_terminal_gates.sql via npx supabase db query --linked --file. ALSO generate a fresh CHECK regeneration (mirror the 20260507_extend_venture_artifacts_postlaunch_v2_regenerated.sql shape) that adds growth_optimization_roadmap to venture_artifacts_artifact_type_check, using the LIVE pg_get_constraintdef() snapshot. Apply both.')
--
-- Pre-flight (verified 2026-05-09 via database-agent prospective):
--   - venture_artifacts WHERE artifact_type='launch_optimization_roadmap' has 0 rows.
--   - venture_artifacts WHERE artifact_type='growth_optimization_roadmap' has 0 rows.
--   - venture_artifacts WHERE artifact_type='growth_playbook' has 0 rows.
--   - workflow_status_enum already contains 'completed' (no DDL on enum).
--   - venture_artifacts_artifact_type_check accepts launch_optimization_roadmap
--     and growth_playbook but NOT growth_optimization_roadmap.

BEGIN;

-- ── Section 1: Update lifecycle_stage_config required_artifacts ─────
-- Stage 26's required_artifacts currently reads
-- ['growth_playbook', 'launch_optimization_roadmap']. Replace the legacy
-- launch_* with the canonical growth_*. Idempotent via array equality
-- check in the WHERE clause.
--
-- Note: required_artifacts is text[] (NOT jsonb) — verified live by
-- database-agent 2026-05-09. Mirrors the cast pattern at
-- 20260507_extend_venture_artifacts_postlaunch_v2_regenerated.sql:182.
UPDATE lifecycle_stage_config
SET required_artifacts = ARRAY['growth_playbook', 'growth_optimization_roadmap']::text[]
WHERE stage_number = 26
  AND required_artifacts IS DISTINCT FROM ARRAY['growth_playbook', 'growth_optimization_roadmap']::text[];

-- ── Section 2: Populate metadata.gates.exit ─────────────────────────
-- Without this, lib/eva/lifecycle/exit-gate-enforcer.js:96-105
-- short-circuits to allowed=true and the FR-6 terminal verifier never
-- runs.
--
-- IMPORTANT (caught by database-agent EXEC retrospective 2026-05-09):
-- The naive single-step jsonb_set('{gates,exit}', ..., create_missing=true)
-- only creates the DEEPEST missing key. If the intermediate 'gates' key
-- doesn't exist (Stage 26's pre-apply state had only feeds_into + outputs
-- under metadata), the SET silently no-ops. Use the `||` merge operator
-- to coalesce-and-merge the gates subobject — this works whether 'gates'
-- exists or not, and preserves any other keys under gates if present.
--
-- Idempotent: WHERE filter prevents redundant writes after the first pass.
UPDATE lifecycle_stage_config
SET metadata =
  COALESCE(metadata, '{}'::jsonb)
  || jsonb_build_object(
       'gates',
       COALESCE(metadata -> 'gates', '{}'::jsonb)
       || jsonb_build_object('exit', jsonb_build_array('growth_playbook', 'growth_optimization_roadmap'))
     )
WHERE stage_number = 26
  AND (
    metadata -> 'gates' -> 'exit' IS NULL
    OR metadata -> 'gates' -> 'exit' IS DISTINCT FROM jsonb_build_array('growth_playbook', 'growth_optimization_roadmap')
  );

-- ── Verification (operator-run after apply) ─────────────────────────
-- SELECT stage_number, required_artifacts, metadata->'gates'->'exit' AS exit_gates
--   FROM lifecycle_stage_config WHERE stage_number = 26;
-- Expected:
--   required_artifacts = ['growth_playbook','growth_optimization_roadmap']
--   exit_gates         = ['growth_playbook','growth_optimization_roadmap']
--
-- After CHECK regeneration (separate database-agent step):
-- SELECT pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conname = 'venture_artifacts_artifact_type_check';
-- Expected: includes both 'growth_optimization_roadmap' and
--   'launch_optimization_roadmap' (alias retained for one release).

COMMIT;
