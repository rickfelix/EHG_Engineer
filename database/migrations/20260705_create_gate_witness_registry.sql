-- SD-LEO-INFRA-INDEPENDENT-GATE-WITNESS-001-A
-- G1-A: Witness Taxonomy + gate_witness_registry Schema
--
-- Solomon's anchor finding (G1, chairman-adopted 2026-07-02): every consequential gate
-- can currently pass on evidence authored entirely by the judged actor. This table is
-- the durable inventory of which gates are already witnessed, by which mechanism, and
-- which are not yet.
--
-- ARCHITECTURE NOTE (found during LEAD-phase investigation, before this schema was
-- locked -- see feedback signal c54d463f, high severity): every worker session AND
-- every CI workflow authenticate to Supabase with the IDENTICAL SUPABASE_SERVICE_ROLE_KEY
-- secret (verified against .github/workflows/*.yml). Service-role bypasses RLS entirely
-- by Postgres/PostgREST design. This means "not writable by worker sessions" is only
-- STRUCTURALLY true for the EXTERNAL_SYSTEM mechanism, where the signal is read live
-- from an external authority (GitHub's own API: CI statusCheckRollup, branch protection,
-- PR review decision) that categorically cannot be forged by any Supabase credential.
-- CROSS_ACTOR and REPLAY witnesses stored in a Supabase table do NOT meet that bar under
-- the current shared-key architecture -- a worker holding the service-role key can write
-- to any such table exactly as easily as the intended independent writer. This is
-- captured explicitly via enforcement_strength below, rather than silently assumed away.
--
-- ADDITIVE ONLY: new table, no existing objects touched.
CREATE TABLE IF NOT EXISTS gate_witness_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_id text NOT NULL,
  handoff_type text,
  classification text NOT NULL CHECK (classification IN ('already_witnessed', 'self_evidence_only', 'not_consequential_exempt')),
  witness_mechanism text CHECK (witness_mechanism IN ('cross_actor', 'external_system', 'replay')),
  enforcement_strength text CHECK (enforcement_strength IN ('structural', 'convention')),
  exemption_reason text,
  existing_mechanism_ref text,
  notes text,
  classified_at timestamptz NOT NULL DEFAULT now(),
  classified_by text NOT NULL DEFAULT 'unknown',
  CONSTRAINT uq_gate_witness_registry_gate_id UNIQUE (gate_id),
  CONSTRAINT chk_gate_witness_registry_witnessed_has_mechanism CHECK (
    (classification = 'already_witnessed' AND witness_mechanism IS NOT NULL) OR classification <> 'already_witnessed'
  ),
  CONSTRAINT chk_gate_witness_registry_witnessed_has_strength CHECK (
    (classification = 'already_witnessed' AND enforcement_strength IS NOT NULL) OR classification <> 'already_witnessed'
  ),
  CONSTRAINT chk_gate_witness_registry_exempt_has_reason CHECK (
    (classification = 'not_consequential_exempt' AND exemption_reason IS NOT NULL AND length(trim(exemption_reason)) > 0) OR classification <> 'not_consequential_exempt'
  ),
  CONSTRAINT chk_gate_witness_registry_external_is_structural CHECK (
    witness_mechanism <> 'external_system' OR enforcement_strength = 'structural'
  )
);

COMMENT ON TABLE gate_witness_registry IS
  'Inventory of every consequential LEO gate, classified as already_witnessed / '
  'self_evidence_only / not_consequential_exempt, per SD-LEO-INFRA-INDEPENDENT-GATE-WITNESS-001 '
  '(Solomon G1, chairman-adopted 2026-07-02). Populated by Child B (inventory), consumed by '
  'Child C (integrity check) and Child D (enforcement rung).';
COMMENT ON COLUMN gate_witness_registry.gate_id IS
  'Stable identifier for the gate, e.g. "LEAD-TO-PLAN.GATE_SD_TRANSITION_READINESS" or '
  '"ship.P4_PROTECTION_INTEGRITY" for non-handoff gates. Must be unique and stable across runs.';
COMMENT ON COLUMN gate_witness_registry.handoff_type IS
  'One of LEAD-TO-PLAN / PLAN-TO-EXEC / EXEC-TO-PLAN / PLAN-TO-LEAD / LEAD-FINAL-APPROVAL for '
  'handoff-pipeline gates, or NULL for out-of-handoff gates (e.g. the ship/merge lane).';
COMMENT ON COLUMN gate_witness_registry.witness_mechanism IS
  'cross_actor: a different session/actor attests (e.g. reviewer ack, coordinator row). '
  'external_system: a signal from outside the actor''s write reach (CI status, branch '
  'protection, deploy 200s). replay: deterministic re-execution by harness-owned machinery. '
  'Required (NOT NULL) when classification=already_witnessed.';
COMMENT ON COLUMN gate_witness_registry.enforcement_strength IS
  'structural: the mechanism is categorically unforgeable by any Supabase-credentialed '
  'process (true today only for witness_mechanism=external_system, re-verified live against '
  'the external API at check-time -- see chk_gate_witness_registry_external_is_structural). '
  'convention: the mechanism is a distinguishing data column (e.g. differing session_id) but '
  'NOT cryptographically enforced, since every worker session and CI workflow share the same '
  'SUPABASE_SERVICE_ROLE_KEY and RLS provides no real separation for a Supabase-stored signal. '
  'convention-strength witnesses are an honest interim state pending per-actor-scoped '
  'credentials or signed attestations (tracked as a follow-on, not silently assumed solved).';
COMMENT ON COLUMN gate_witness_registry.existing_mechanism_ref IS
  'File:function reference to the ALREADY-EXISTING implementation this row classifies (e.g. '
  '"lib/ship/merge-witness-ladder.mjs:evaluateP3CI") -- this registry classifies and composes '
  'with existing machinery, it does not reimplement it.';
COMMENT ON COLUMN gate_witness_registry.exemption_reason IS
  'Required (NOT NULL, non-empty) when classification=not_consequential_exempt. Must state '
  'why this gate carries no meaningful blast radius from self-authored evidence.';

ALTER TABLE gate_witness_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon can read gate_witness_registry" ON gate_witness_registry;
CREATE POLICY "Anon can read gate_witness_registry"
  ON gate_witness_registry FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service role full access to gate_witness_registry" ON gate_witness_registry;
CREATE POLICY "Service role full access to gate_witness_registry"
  ON gate_witness_registry FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
