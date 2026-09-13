-- Migration: add the 'design fidelity reviewed' observe-only exit-gate string to
-- Stage 15's (Design Studio) venture_stages.metadata.gates.exit_observe.
-- SD: SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-D (C3.2)
--
-- Live-verified that stage 15's metadata is currently EXACTLY {metrics,
-- stage_timeout_ms} -- no gates key at all. A blind `UPDATE ... SET metadata = '{...}'`
-- would silently destroy those two existing keys, so this migration uses jsonb_set
-- with create_missing=true to merge the new key in, leaving every other key untouched.
--
-- Observe-only: this writes to metadata.gates.exit_observe, never metadata.gates.exit
-- (the binding array). No stage-15 exit gate becomes binding as a result of this
-- migration -- exit-gate-enforcer.js's observe-mode branch only ever logs an
-- EXIT_GATE_OBSERVE_ONLY/EXIT_GATE_OBSERVE_UNRESOLVED system_events row for strings
-- listed here; it never blocks a stage transition on them.
--
-- Additive-only, idempotent: re-running this migration is a no-op if the string is
-- already present (the array-append is guarded by a NOT (... ? 'design fidelity
-- reviewed') check).

BEGIN;

UPDATE venture_stages
SET metadata = jsonb_set(
  metadata,
  '{gates,exit_observe}',
  COALESCE(metadata->'gates'->'exit_observe', '[]'::jsonb) || '["design fidelity reviewed"]'::jsonb,
  true
)
WHERE stage_number = 15
  AND NOT (
    COALESCE(metadata->'gates'->'exit_observe', '[]'::jsonb) @> '["design fidelity reviewed"]'::jsonb
  );

COMMIT;
