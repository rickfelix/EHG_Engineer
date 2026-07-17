-- Governed write path for chairman_constraints (the "constraints evolve" loop).
-- SD-LEO-INFRA-STAGE-GROUNDING-INJECTOR-001 FR-3. Adam-sourced, chairman-approved (Solomon hand-off #6 Item C).
--
-- WHY: lib/eva/stage-zero/synthesis/chairman-constraints.js claims constraints "evolve over time as
-- new learnings come from kill gates and retrospectives" — but the code only READ chairman_constraints;
-- there was NO write path, so the evolve-loop was aspirational. This adds a GOVERNED write path: a
-- kill-gate or retrospective outcome PROPOSES a constraint (staged here as status='pending'), and a
-- constraint becomes ACTIVE in chairman_constraints ONLY when a CHAIRMAN RATIFIES it. Nothing self-writes
-- an active constraint (CONST-002: constraints are a chairman-authority surface; the system may only PROPOSE).
--
-- GOVERNANCE — WHO IS STOPPED BY WHAT (reviewed by security-agent 2026-07-16, empirically verified):
--   * anon / ordinary authenticated users are stopped at the RLS LAYER: chairman_constraints has no
--     permissive INSERT/UPDATE policy for them, and chairman_constraints_proposals only lets them SELECT.
--     They cannot stage, ratify, or write an active constraint.
--   * service_role BYPASSES RLS (rolbypassrls=true) and runs the EVA evolve-loop, so for THAT principal
--     RLS is NOT the barrier — the barrier is APPLICATION-CODE DISCIPLINE: the propose path only ever
--     writes the inert chairman_constraints_proposals table, and ratifyProposedConstraint's GATE 1
--     (supabase.rpc('fn_is_chairman') — which returns false for service_role's null auth.uid()) rejects a
--     service_role ratify before any active-constraint write. RATIFICATION is therefore performed under a
--     CHAIRMAN's authenticated JWT, where the RLS policies below are the durable barrier.
--   * a CHAIRMAN (authenticated, fn_is_chairman()) may ratify: the UPDATE policy on proposals and the new
--     fn_is_chairman()-gated INSERT policy on chairman_constraints both permit exactly and only them.
--
-- NON-BREAKING: new table + one additive, fn_is_chairman()-gated INSERT policy on chairman_constraints
-- (its prior policy set had a SELECT-only policy and NO INSERT policy, so promotion was impossible — this
-- makes chairman-gated promotion possible WITHOUT opening any non-chairman write path). loadConstraints()
-- is unchanged (a ratified proposal is inserted as a normal is_active row it already reads next run).
--
-- STAGED — NOT YET APPROVED FOR APPLY. requires-chairman-apply. Do NOT auto-apply on merge; no @approved-by.

CREATE TABLE IF NOT EXISTS chairman_constraints_proposals (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- proposed constraint payload (mirrors the writable columns of chairman_constraints)
  constraint_key         text NOT NULL,
  name                   text NOT NULL,
  description            text,
  filter_type            text CHECK (filter_type IS NULL OR filter_type IN ('hard_reject','score_modifier','score_bonus','advisory')),
  filter_logic           jsonb,
  weight                 numeric(3,2),   -- matches chairman_constraints.weight (max 9.99)
  priority_order         integer,
  -- provenance: the evolve-loop signal that produced this proposal
  proposed_source        text NOT NULL CHECK (proposed_source IN ('kill_gate','retrospective','manual')),
  source_ref             text,        -- kill-gate id / retrospective id / etc.
  rationale              text,        -- why this constraint is proposed
  -- governance lifecycle
  status                 text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ratified','rejected')),
  proposed_by            text,        -- system/agent that staged the proposal
  proposed_at            timestamptz NOT NULL DEFAULT now(),
  ratified_by            uuid,        -- chairman auth.uid() who ratified
  ratified_at            timestamptz,
  ratified_constraint_id uuid,        -- the chairman_constraints row created on ratification
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ccp_status ON chairman_constraints_proposals (status);
CREATE INDEX IF NOT EXISTS idx_ccp_constraint_key ON chairman_constraints_proposals (constraint_key);

-- RLS on the proposals staging table (feedback_supabase_tables_need_rls_at_create_time).
ALTER TABLE chairman_constraints_proposals ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user may see proposals (transparency of the evolve-loop).
DROP POLICY IF EXISTS ccp_select ON chairman_constraints_proposals;
CREATE POLICY ccp_select ON chairman_constraints_proposals
  FOR SELECT TO authenticated
  USING (true);

-- Ratify: ONLY a chairman may mutate a proposal (status -> ratified/rejected). This is the gate.
DROP POLICY IF EXISTS ccp_update_chairman ON chairman_constraints_proposals;
CREATE POLICY ccp_update_chairman ON chairman_constraints_proposals
  FOR UPDATE TO authenticated
  USING (fn_is_chairman())
  WITH CHECK (fn_is_chairman());

-- No INSERT / DELETE policy for anon or authenticated -> only service_role (which BYPASSes RLS, used by
-- the app's proposeConstraintFromOutcome path) may stage proposals. Authenticated users cannot self-insert.

-- Promotion gate: allow a CHAIRMAN (only) to INSERT an active constraint. Without this, chairman_constraints
-- had no INSERT policy and the ratify promotion was RLS-denied even for a chairman (evolve-loop could never
-- complete). This is deliberately fn_is_chairman()-gated — NOT a blanket permissive INSERT policy, which
-- would open a direct-write hole for every authenticated user (security-agent HIGH #2).
DROP POLICY IF EXISTS chairman_constraints_insert_chairman ON chairman_constraints;
CREATE POLICY chairman_constraints_insert_chairman ON chairman_constraints
  FOR INSERT TO authenticated
  WITH CHECK (fn_is_chairman());
