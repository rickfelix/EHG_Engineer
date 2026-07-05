-- SD-LEO-INFRA-GATE-WITNESS-STRENGTH-001
-- Fast-follow to the G1 orchestrator (SD-LEO-INFRA-INDEPENDENT-GATE-WITNESS-001): tags
-- every gate_witness_events row with the enforcement_strength/witness_mechanism it
-- actually ran at, matching Child A's gate_witness_registry vocabulary exactly, and
-- surfaces convention-tier ("downgrade") events as first-class, queryable evidence
-- rather than something inferred by cross-referencing the registry separately.
--
-- ADDITIVE ONLY: 3 new nullable/defaulted columns on an existing table. No existing
-- column, constraint, policy, or row is touched.
ALTER TABLE gate_witness_events
  ADD COLUMN IF NOT EXISTS enforcement_strength text CHECK (enforcement_strength IN ('structural', 'convention')),
  ADD COLUMN IF NOT EXISTS witness_mechanism text CHECK (witness_mechanism IN ('cross_actor', 'external_system', 'replay')),
  ADD COLUMN IF NOT EXISTS is_downgrade boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN gate_witness_events.enforcement_strength IS
  'The enforcement_strength this specific event actually ran at, looked up from '
  'gate_witness_registry.gate_id at recording time (lib/eva/record-witness-event.js). '
  'Null when the gate_id has no registry row yet -- never blocks recording.';
COMMENT ON COLUMN gate_witness_events.witness_mechanism IS
  'The witness_mechanism this specific event actually ran at, mirroring '
  'gate_witness_registry.witness_mechanism. Null when the gate_id has no registry row yet.';
COMMENT ON COLUMN gate_witness_events.is_downgrade IS
  'true when enforcement_strength=convention -- i.e. this gate ran at convention-strength '
  'because no structural witness mechanism exists for it today. First-class, queryable '
  'evidence of how often convention-level enforcement is load-bearing, per the coordinator '
  'relay (a6fa69a9-ea69-43e4-9bce-fb129196a7c7) that named this as a missed G1 fold-in: '
  '"never silent". Defaults false so pre-existing rows (recorded before this migration) '
  'read as non-downgrade rather than NULL-ambiguous.';
