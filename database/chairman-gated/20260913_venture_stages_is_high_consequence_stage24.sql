-- database/chairman-gated/20260913_venture_stages_is_high_consequence_stage24.sql
-- @chairman-gated
-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-F (C4.2)
--
-- BUG: venture_stages.stage_number=24 ("Launch Readiness", gate_type='kill', gate_label
-- 'KILL GATE: Launch readiness - all prerequisites must pass') carries is_high_consequence=false
-- today. Live-verified 2026-09-13: sibling kill/high-consequence stages 3, 19, and 25 are all
-- is_high_consequence=true. A kill gate flagged NOT high-consequence is an internal
-- inconsistency introduced by a prior stage-renumber and is itself a kill-gate input — every
-- downstream reader that branches on is_high_consequence (e.g. the high-consequence stage-gate
-- predicate, lib/governance/stage-gate-predicate.js) currently treats stage 24 as ordinary when
-- its own gate_type says otherwise.
--
-- FIX: set is_high_consequence=true for stage_number=24, matching stages 3/19/25. The WHERE
-- clause is scoped to the exact pre-condition this migration was authored against (false today)
-- so a re-run after the value has already changed is a documented no-op, never a surprise
-- overwrite of intervening drift.
--
-- This file is STAGED, NOT APPLIED. Per the chairman-gated ceremony (database/chairman-gated/
-- README.md), applying requires a separate --issue-token invocation followed by a
-- MIGRATION_APPLY_TOKEN-gated `apply-migration.js --prod-deploy --allow-any-path` run, with the
-- @approved-by header above matching the applying session's git config user.email. No worker
-- session may run that apply step as part of this SD.

UPDATE public.venture_stages
SET is_high_consequence = true
WHERE stage_number = 24
  AND is_high_consequence = false;
