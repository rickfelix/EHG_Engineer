-- SD-LEO-INFRA-INDEPENDENT-GATE-WITNESS-001-C
-- G1-C: Witness Integrity Check -- RLS/Permission Proof, Not Convention
--
-- Child A's gate_witness_registry classifies which gates ALREADY have a witness
-- mechanism. This table gives the fleet a real MECHANISM to record a witness event
-- for those gates (and any future gate promoted to already_witnessed), with two
-- structural proofs rather than an unenforced convention:
--
-- 1. RLS proof: only the service-role connection can write. The anon role has a
--    SELECT-only policy -- no INSERT/UPDATE policy exists for it, so RLS
--    default-denies any anon-key write attempt. Verified live by
--    tests/integration/eva/gate-witness-events-rls.test.js.
--
-- 2. Self-judge rejection proof: a CHECK constraint rejects any row where
--    witness_session_id = judged_session_id. Under the shared-service-role-key
--    architecture (documented in Child A's migration), this is the one thing a DB
--    constraint CAN structurally enforce today -- it cannot verify that two
--    DIFFERENT session-id strings represent genuinely independent actors (that
--    would need per-actor-scoped credentials or signed attestations, tracked as a
--    known limitation, not silently assumed solved), but it DOES structurally
--    prevent the literal self-attestation case that TEST-MASKING/ghost-completion
--    incidents actually exploited. Verified live by
--    tests/integration/eva/gate-witness-events-self-judge.test.js.
--
-- ADDITIVE ONLY: new table, no existing objects touched.
CREATE TABLE IF NOT EXISTS gate_witness_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_id text NOT NULL,
  witness_session_id text NOT NULL,
  judged_session_id text NOT NULL,
  verdict text NOT NULL CHECK (verdict IN ('witnessed', 'rejected')),
  notes text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_witness_not_self_judged CHECK (witness_session_id <> judged_session_id)
);

COMMENT ON TABLE gate_witness_events IS
  'Log of recorded witness events for gates classified already_witnessed in '
  'gate_witness_registry (Child A/B), per SD-LEO-INFRA-INDEPENDENT-GATE-WITNESS-001-C. '
  'Structural proof, not convention: RLS denies non-service-role writes (see the anon '
  'SELECT-only policy below), and chk_witness_not_self_judged rejects the literal '
  'self-attestation case at the DB layer.';
COMMENT ON COLUMN gate_witness_events.witness_session_id IS
  'The session/actor recording the witness verdict. Must differ from judged_session_id '
  '(enforced by chk_witness_not_self_judged) -- this is a necessary, not sufficient, '
  'condition for independence given the shared SUPABASE_SERVICE_ROLE_KEY architecture.';
COMMENT ON COLUMN gate_witness_events.judged_session_id IS
  'The session/actor whose work is being judged by this witness event.';

ALTER TABLE gate_witness_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon can read gate_witness_events" ON gate_witness_events;
CREATE POLICY "Anon can read gate_witness_events"
  ON gate_witness_events FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service role full access to gate_witness_events" ON gate_witness_events;
CREATE POLICY "Service role full access to gate_witness_events"
  ON gate_witness_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
