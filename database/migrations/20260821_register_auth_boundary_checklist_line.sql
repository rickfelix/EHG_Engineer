-- 20260821_register_auth_boundary_checklist_line.sql
-- SD-LEO-INFRA-ALTIFYAI-TEST-IDENTITY-001 (FR-7, TS-14)
--
-- EXEC-TO-PLAN TESTING finding: PLAN's TS-14 required EXEC to locate the
-- real, existing Stage-19/20 checklist artifact before adding the line
-- "auth boundary shipped -> identity packet to chairman" to it -- EXEC
-- never did this; the string survived only in scripts/temp/ scratch files.
--
-- Direct search (this migration's own commit) found no live, current
-- "Stage-19/20 checklist" document/table this codebase maintains --
-- the only matches are archived, superseded dossier files under
-- docs/archive/. venture_stages.metadata.gates IS the real, live artifact
-- this codebase treats as the checklist of record for what's tracked at a
-- stage transition (the SAME mechanism FR-6's own
-- synthetic-actor-fencing-configured entry already uses) -- registering
-- there, rather than inventing a new file, matches TS-14's own explicit
-- instruction ("not by creating an arbitrary new file containing the
-- string").
--
-- Registered as gates.exit_observe with NO verifier (mirrors the existing
-- NON-BINDING DISPOSITION pattern for gate strings representing a human,
-- out-of-band action rather than a machine-checkable condition --
-- exit-gate-verifiers.js's resolveVerifier() correctly returns null;
-- exit-gate-enforcer.js's observe-mode branch treats an unresolved
-- exit_observe string as fail-LOUD (an EXIT_GATE_OBSERVE_UNRESOLVED
-- system_events row) on every Stage 19 walk-through -- this IS the "fires
-- at build time" behavior TS-14 asks for: an honest, non-blocking,
-- repeated reminder that the chairman's identity packet delivery is a
-- standing checklist item, not a silently-forgotten one-off).
--
-- Idempotent via the same @> containment guard as the earlier
-- synthetic-actor-fencing-configured registration.

BEGIN;

UPDATE venture_stages
SET metadata = jsonb_set(
      metadata,
      '{gates,exit_observe}',
      COALESCE(metadata->'gates'->'exit_observe', '[]'::jsonb) || '["auth boundary shipped -> identity packet to chairman"]'::jsonb
    ),
    updated_at = now()
WHERE stage_number = 19
  AND NOT COALESCE(metadata->'gates'->'exit_observe' @> '["auth boundary shipped -> identity packet to chairman"]'::jsonb, false);

COMMIT;
