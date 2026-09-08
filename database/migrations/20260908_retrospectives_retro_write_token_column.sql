-- SD-LEO-FIX-WIRE-SEVEN-RETROSPECTIVE-001 FR-1(a) — additive column only.
-- Target DB: EHG_Engineer
-- @chairman-gated: applied by the chairman after sign-off
--
-- CORRECTED SPLIT (measured, not assumed): this SD's own scope originally proposed bundling the
-- retro_canonical_writer_policy() registry function into this "tier-1 additive" migration alongside
-- the column. Classified live against scripts/lib/migration-tier-classifier.mjs (the same classifier
-- isDelegatableForApply() calls): ADD COLUMN IF NOT EXISTS alone is tier:1
-- (all_statements_provably_additive). CREATE OR REPLACE FUNCTION is tier:2
-- (unrecognized_or_unsafe_statement) regardless of the function body being read-only/IMMUTABLE with
-- no security-definer, grant, or policy content -- the classifier does not special-case CREATE
-- FUNCTION as additive. So only the bare column addition is genuinely Adam-delegated-apply eligible
-- IN PRINCIPLE; the registry function stays in
-- database/chairman-gated/20260906_retrospectives_published_guard.sql alongside the trigger,
-- both still requiring the same fresh chairman verbal as before.
--
-- SECOND CORRECTION, measured live at apply time: this file was ALSO required (by the Layer 4.3
-- CI grep contract, retrospective-quality-gates.yml, over every database/migrations/*retrospective*.sql
-- file) to carry line-leading BEGIN;/COMMIT;. Once added, scripts/lib/migration-tier-classifier.mjs
-- reclassifies the file as NOT tier:1 -- "begin;" is not a recognized additive statement, so
-- isDelegatableForApply() now REFUSES it (measured: guard rejection
-- not_delegatable:additive:not_tier1:unrecognized_or_unsafe_statement:begin). The CI grep
-- contract and the delegation classifier were never reconciled for this case -- flagged as a
-- harness gap (a migration needing BOTH is structurally unable to use the delegated-apply path,
-- even when its actual DDL is genuinely additive), NOT worked around here. This file therefore
-- ships @chairman-gated after all, applied under the SAME fresh verbal as the registry/trigger
-- half in the paired file -- this does not weaken anything; it only means BOTH halves need the
-- chairman rather than just one.
--
-- The column is nullable, unused by any live trigger until the chairman-gated file applies, and
-- read by no code path today. FR-2/FR-3 (per-site wiring of retro_write_token into each retained
-- writer's UPDATE payload) proceed independently of the registry/trigger applying -- they only need
-- this column to exist so the wired UPDATE statements are structurally valid ahead of FR-4.
--
-- ROLLBACK: DROP COLUMN IF EXISTS retro_write_token (safe -- no data ever persists in it; the
-- eventual trigger nulls it before RETURN, and no writer treats it as durable state).

-- BEGIN;/COMMIT; required by the Layer 4.3 CI grep contract (retrospective-quality-gates.yml),
-- which is what forced the @chairman-gated reclassification above.
BEGIN;

ALTER TABLE public.retrospectives
  ADD COLUMN IF NOT EXISTS retro_write_token text;

COMMIT;
