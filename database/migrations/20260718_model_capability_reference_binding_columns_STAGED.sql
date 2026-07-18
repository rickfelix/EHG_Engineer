-- STAGED migration — SD-LEO-INFRA-MODEL-CAPABILITY-EVAL-002-C (FR-4)
-- requires_chairman_apply: yes — do-not-auto-apply. Runs at the chairman-gated apply
-- ceremony, NOT by any automated path.
--
-- APPLIES AFTER database/migrations/20260716_model_capability_reference_STAGED.sql:
-- the filename date 20260718 > 20260716 orders it strictly after the base CREATE TABLE,
-- so the columns below always attach to an existing table.
--
-- WHAT: adds the DURABLE binding-provenance columns for the FR-3 ground-truth binding
-- gate (lib/eval/ground-truth-gate.mjs). The base table already carries
-- trusted_for_routing (boolean NOT NULL DEFAULT false); this gives that trust signal a
-- cross-process provenance home so "trusted_for_routing=true only if bound=true" is
-- enforceable by the sole-writer gate rather than living only in an in-memory {bound}.
--
--   bound_at   — timestamptz, when the sole-writer gate flipped trusted_for_routing=true.
--   binding_id — uuid, provenance id of the binding run that flipped it.
--
-- ADDITIVE, NO RLS: only ADD COLUMN IF NOT EXISTS (idempotent). It reuses the base
-- table's RLS + service-role policy — no new grants — so it stays within the
-- additive-no-rls delegated-apply scope. By design this file carries NO approved-by
-- attestation directive; the chairman applies it at the ceremony after review.

ALTER TABLE model_capability_reference ADD COLUMN IF NOT EXISTS bound_at timestamptz;
ALTER TABLE model_capability_reference ADD COLUMN IF NOT EXISTS binding_id uuid;

COMMENT ON COLUMN model_capability_reference.bound_at IS
  'When the ground-truth binding gate (lib/eval/ground-truth-gate.mjs, EVAL-002-C) flipped trusted_for_routing=true. NULL until a grader verdict reproduces an independently-adjudicated verdict.';
COMMENT ON COLUMN model_capability_reference.binding_id IS
  'Provenance id of the binding run that flipped trusted_for_routing. Set ONLY by the sole-writer gate/regression path; NULL otherwise (incl. after a stale-bind clear).';
