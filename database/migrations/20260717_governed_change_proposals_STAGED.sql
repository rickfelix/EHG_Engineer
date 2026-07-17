-- Governed-change proposal staging surface for the shadow-trial ratification sandbox.
-- SD-LEO-INFRA-SHADOW-TRIAL-RATIFICATION-001-A (child A of the shadow-trial orchestrator).
-- Sourced by Adam (CONST-002) from Solomon spec id=345048ed; chairman re-timed 2026-07-16.
--
-- WHY: every GOVERNED-tier mutation (protocol sections, loop contracts, closure predicates,
-- the SMS whitelist, the switch-on policy, portfolio-strategy revisions) reaches the chairman
-- with PROSE justification only. This table gives governed changes a durable, structured
-- staging surface so child C can shadow-run them against sealed eval-sets and child A's
-- packet composer can append machine evidence to the ratification request. The sandbox is
-- EVIDENCE ONLY (CONST-002): nothing here merges, ratifies, or auto-applies anything —
-- a proposal row is inert data until a CHAIRMAN acts through their own surfaces.
--
-- GOVERNANCE — WHO IS STOPPED BY WHAT (mirrors 20260716_chairman_constraints_proposals_
-- governed_write_path.sql, the ratified precedent for chairman-gated proposal tables):
--   * anon / ordinary authenticated users are stopped at the RLS LAYER: no INSERT/UPDATE/
--     DELETE policy exists for them, and SELECT is chairman-only (fn_is_chairman()) — a
--     proposal's diff and rationale are chairman-audience material.
--   * service_role BYPASSES RLS (rolbypassrls=true) and runs the fleet's proposal writer,
--     so for THAT principal the barrier is APPLICATION-CODE DISCIPLINE: the writer
--     (lib/governance/shadow-trial/proposal-writer.mjs) only ever writes THIS staging
--     table — never a live governed artifact. The shadow-run core (child C) enforces the
--     same invariant with a fail-closed isolation witness.
--   * ratification authority remains exclusively with the CHAIRMAN via their existing
--     decision surfaces; no path in this schema grants or implies apply authority.
--
-- STAGED — NOT YET APPROVED FOR APPLY. requires-chairman-apply. Do NOT auto-apply on merge;
-- no @approved-by. APPLY RUNBOOK (chairman ceremony): (1) chairman verbal/written approval;
-- (2) apply via the standard migration path with @approved-by attestation commit;
-- (3) run `npm run schema:snapshot:lint` and commit the regenerated snapshot in the same PR
--     (prevents the reactive red-CI trap flagged in retro 30ece4ed);
-- (4) verify with a real select probe — the writer's CEREMONY_PENDING (exit 2) path flips
--     to live staging automatically; no code change needed.

CREATE TABLE IF NOT EXISTS governed_change_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What is being changed
  artifact_class TEXT NOT NULL,      -- e.g. 'closure_predicates', 'leo_protocol_sections'
  target_ref TEXT NOT NULL,          -- class-specific reference to the live artifact
  current_hash TEXT NOT NULL,        -- content hash of the live artifact at proposal time
  proposed_diff TEXT NOT NULL,       -- the proposed change, class-specific diff format
  diff_hash TEXT NOT NULL,           -- sha256 of proposed_diff (idempotency key component)

  -- Who / why
  proposer TEXT NOT NULL,            -- session/callsign/agent that staged it
  provenance TEXT NOT NULL,          -- where the change came from (SD, retro, signal, ...)
  rationale TEXT NOT NULL,           -- prose justification (still required — packet AUGMENTS it)

  -- Lifecycle (evidence pipeline states only — no 'ratified'/'applied': apply authority
  -- lives with the chairman outside this table, per CONST-002)
  status TEXT NOT NULL DEFAULT 'staged'
    CHECK (status IN ('staged', 'shadow_run', 'packet_attached', 'withdrawn')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Idempotency: the same diff against the same artifact state stages once.
  CONSTRAINT governed_change_proposals_idempotent
    UNIQUE (artifact_class, target_ref, current_hash, diff_hash)
);

CREATE INDEX IF NOT EXISTS idx_gcp_class_status
  ON governed_change_proposals (artifact_class, status);
CREATE INDEX IF NOT EXISTS idx_gcp_created
  ON governed_change_proposals (created_at DESC);

-- RLS + policies in the SAME migration as CREATE TABLE (SPINE-001-B recurrence guard).
ALTER TABLE governed_change_proposals ENABLE ROW LEVEL SECURITY;

-- Chairman-only read: proposal diffs/rationales are ratification-audience material.
DROP POLICY IF EXISTS gcp_chairman_select ON governed_change_proposals;
CREATE POLICY gcp_chairman_select ON governed_change_proposals
  FOR SELECT USING (fn_is_chairman());

-- Deliberately NO INSERT/UPDATE/DELETE policies: only service_role (rolbypassrls) writes,
-- and its write discipline is enforced in application code + child C's isolation witness.

COMMENT ON TABLE governed_change_proposals IS
  'Shadow-trial staging surface for GOVERNED-tier change proposals (SD-LEO-INFRA-SHADOW-TRIAL-RATIFICATION-001-A). Evidence-only: rows feed machine precheck; ratification/apply authority remains exclusively with the chairman (CONST-002).';
