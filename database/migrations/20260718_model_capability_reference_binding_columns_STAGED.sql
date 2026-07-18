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

-- ---------------------------------------------------------------------------
-- SOLE-WRITER INVARIANT AT THE DB TIER (RISK e25f3adf, C1 CRITICAL).
-- The circular-binding hazard is that ANY writer (the canonical child-C binder,
-- the EVAL-001 sibling script, an ad-hoc psql/service-role UPDATE, a future code
-- path) could flip trusted_for_routing=true with no adjudicated provenance. Code
-- guards catch only the writers we know about; this trigger is the durable root-
-- cause fix — it structurally REJECTS any UPDATE that transitions
-- trusted_for_routing from false/NULL to true UNLESS the same NEW row carries
-- BOTH binding_id AND bound_at. It therefore makes circular binding impossible
-- regardless of which code path attempts the write.
--
-- SCOPE: BEFORE INSERT OR UPDATE. On UPDATE it guards only the false/NULL->true
-- transition; it NEVER constrains true->false — clearing a stale bind
-- (trusted_for_routing=false, bound_at=NULL, binding_id=NULL) must always be
-- allowed so a bind cannot outlive the evidence that justified it. On INSERT it
-- rejects a row born trusted_for_routing=true without provenance (there is no OLD
-- to transition from — a trusted INSERT is itself the false/NULL->true edge). This
-- INSERT arm closes the direct-INSERT hole the UPDATE-only guard left open
-- (SECURITY re-verify LOW residual, EVAL-002-C).
--
-- ADDITIVE + IDEMPOTENT: CREATE OR REPLACE FUNCTION; DROP TRIGGER IF EXISTS then
-- CREATE TRIGGER. Reuses the base table's RLS/service-role policy — no new grants.
-- By design this file carries NO approved-by attestation; the chairman applies it
-- at the gated ceremony after review.

CREATE OR REPLACE FUNCTION model_capability_reference_enforce_binding_provenance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Guard the false/NULL -> true edge on BOTH INSERT and UPDATE.
  --  UPDATE: OLD IS DISTINCT FROM TRUE is true when OLD was false OR NULL, so
  --          true->true and true->false are left untouched.
  --  INSERT: OLD does not exist (its fields are NULL under FOR EACH ROW), so a
  --          row born trusted_for_routing=true is itself the false/NULL->true edge
  --          and is guarded. Gate on TG_OP so the OLD reference is only read on UPDATE.
  IF NEW.trusted_for_routing IS TRUE
     AND (TG_OP = 'INSERT' OR OLD.trusted_for_routing IS DISTINCT FROM TRUE)
     AND (NEW.binding_id IS NULL OR NEW.bound_at IS NULL) THEN
    RAISE EXCEPTION
      'trusted_for_routing cannot be set true without binding provenance (binding_id + bound_at) — sole-writer invariant, RISK e25f3adf C1'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_model_capability_reference_binding_provenance ON model_capability_reference;
CREATE TRIGGER trg_model_capability_reference_binding_provenance
  BEFORE INSERT OR UPDATE ON model_capability_reference
  FOR EACH ROW
  EXECUTE FUNCTION model_capability_reference_enforce_binding_provenance();
