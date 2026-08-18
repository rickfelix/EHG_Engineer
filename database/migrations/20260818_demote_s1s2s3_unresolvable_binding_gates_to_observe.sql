-- 20260818_demote_s1s2s3_unresolvable_binding_gates_to_observe.sql
-- QF-20260818-010
-- @approved-by: codestreetlabs@gmail.com
--   Chairman VERBAL approval by SMS 2026-08-18 14:27:15Z: "A" (= yes, apply now) in reply to the
--   oracle-cleared decision packet sent 13:50:22Z (A/B/no-reply-HELD frame; staging row 7a2afebb).
--   Adam-scribed under the ratified chairman-verbal ceremony; stamped by the applier identity per
--   checkApproverFactor. The @delegated-by marker below is retained as the audit trail of the
--   FIRST attempt: the delegated path correctly REFUSED this file on scope (chairman-only
--   UPDATE class), which is what produced this chairman decision.
-- @delegated-by: adam
--   Delegated apply per SD-LEO-INFRA-ADAM-DBCHANGE-APPLY-DELEGATION-001 (completed, verified) at
--   coordinator request ad7e734b 2026-08-18 ~13:5xZ (Golf-7 correctly refused to self-stamp;
--   coordinator correctly declined to bypass the approver gate). Governed data-row change,
--   idempotent, read in full by the applier before apply; Golf-7 verifies post-apply.
--
-- computeGateConformance() (lib/eva/lifecycle/gate-conformance.js) reads binding 16/21 live:
-- 5 gates.exit strings on stages 1/2/3 resolve to no verifier in exit-gate-verifiers.js
-- (S1 'Category assigned'; S2 'Multi-model pass complete', 'Contrarian review done',
-- 'Top-5 risks identified'; S3 'Validation score >= 6'). Investigated (re-confirmed 2026-08-18
-- against current main — see exit-gate-verifiers.js's NON-BINDING DISPOSITION comment): each has
-- NO real backing implementation anywhere in the codebase (ventures.category and
-- ventures.validation_score have zero writers; Stage 2 has no multi-model/contrarian/top-5
-- concept). Writing a verifier now would either fabricate a PASS or make the gate universally
-- unsatisfiable — both dishonest.
--
-- WHY THIS IS NOT COSMETIC: exit-gate-enforcer.js fail-CLOSES on an unresolvable BINDING gate
-- (HP-1) — any venture that ever hit the enforcer's two instrumented checkExitGates() call sites
-- (artifact-persistence-service.js advanceStage(), stage-execution-engine.js
-- processLifecycleTerminal()) at stage 1, 2, or 3 would be PERMANENTLY, unfixably blocked, since
-- none of these 5 concepts can ever become satisfied. This migration removes that landmine.
--
-- WHY exit_observe (NOT deleting the strings, NOT a rubber-stamp verifier): mirrors the
-- established gates.exit_observe pattern (20260706_activate_dormant_exit_gates_observe_only.sql)
-- — exit-gate-enforcer.js dispatches exit_observe gates to the SAME resolveVerifier() lookup but
-- only LOGS a fail-loud EXIT_GATE_OBSERVE_UNRESOLVED system_events row; it never blocks
-- advancement. This is the honest, disclosed resting state for a gate concept that has no real
-- implementation and isn't slated for one (unlike the exit_observe precedent's 5 strings, which
-- await a "flip to binding" once their underlying feature ships).
--
-- Unblocks the FR-4 (would-block-rate precheck, lib/eva/lifecycle/would-block-rate-precheck.js)
-- binding-flip precondition: precheckWouldBlockRate() refuses while ANY binding gate string is
-- unresolvable (conformance.unresolvableCount > 0) — after this migration, unresolvableCount=0.
--
-- Additive/subtractive but idempotent (WHERE guards make a re-run a no-op): S1's exit array
-- drops 'Category assigned' (2 strings remain) and gains an exit_observe key; S2's exit array
-- becomes empty (all 3 were unresolvable) and gains an exit_observe key; S3's exit array drops
-- 'Validation score >= 6' (1 string, 'Chairman decision...', remains — already resolvable via
-- verifyChairmanDecisionMade) and gains an exit_observe key.
--
-- Rollback:
--   UPDATE venture_stages SET metadata = jsonb_set(metadata, '{gates,exit}',
--     '["Title validated (3-120 chars)", "Description validated (20-2000 chars)", "Category assigned"]'::jsonb)
--     - 'exit_observe' WHERE stage_number = 1;  -- careful: only if no OTHER exit_observe entries exist for S1
--   Actually safest rollback is: metadata = metadata #- '{gates,exit_observe}' (S1/S2/S3 had none
--   before this migration) combined with restoring the original 'exit' arrays shown above for S1,
--   S2 (['Multi-model pass complete','Contrarian review done','Top-5 risks identified']), and S3
--   (['Validation score >= 6','Chairman decision: advance/revise/reject']).

BEGIN;

UPDATE venture_stages
SET metadata = jsonb_set(
      jsonb_set(
        metadata,
        '{gates,exit}',
        '["Title validated (3-120 chars)", "Description validated (20-2000 chars)"]'::jsonb
      ),
      '{gates,exit_observe}',
      '["Category assigned"]'::jsonb
    ),
    updated_at = now()
WHERE stage_number = 1
  AND (metadata->'gates'->'exit_observe') IS NULL;

UPDATE venture_stages
SET metadata = jsonb_set(
      jsonb_set(
        metadata,
        '{gates,exit}',
        '[]'::jsonb
      ),
      '{gates,exit_observe}',
      '["Multi-model pass complete", "Contrarian review done", "Top-5 risks identified"]'::jsonb
    ),
    updated_at = now()
WHERE stage_number = 2
  AND (metadata->'gates'->'exit_observe') IS NULL;

UPDATE venture_stages
SET metadata = jsonb_set(
      jsonb_set(
        metadata,
        '{gates,exit}',
        '["Chairman decision: advance/revise/reject"]'::jsonb
      ),
      '{gates,exit_observe}',
      '["Validation score >= 6"]'::jsonb
    ),
    updated_at = now()
WHERE stage_number = 3
  AND (metadata->'gates'->'exit_observe') IS NULL;

COMMIT;
