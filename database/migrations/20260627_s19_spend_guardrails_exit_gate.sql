-- @approved-by: codestreetlabs@gmail.com
--
-- 20260627_s19_spend_guardrails_exit_gate.sql
-- SD-LEO-INFRA-VENTURE-CLOUDFLARE-DEFAULT-001-D (FR-1)
--
-- Carry the 8-point spend-guardrail policy forward as a HARD, fail-closed
-- precondition before a Cloudflare-default venture goes live.
--
-- WHY: child B made Cloudflare the conformant default venture-hosting target.
-- The Cloudflare research was a CONDITIONAL go: no provider exposes a hard
-- dollar spend cap and D1 carries a real runaway-invoice risk (~4.83B-row case).
-- The mitigation — the 8 spend-guardrails (lib/venture-deploy/spend-guardrails.js)
-- and the fail-closed verifier verifySpendGuardrailsReady
-- (lib/eva/lifecycle/exit-gate-verifiers.js, registered for the match string
-- 'spend guardrails ready') — already exist, but the verifier is NEVER
-- dispatched: no venture stage declared 'spend guardrails ready' in
-- venture_stages.metadata.gates.exit, so the precondition was only enforced
-- IMPLICITLY inside publish.js. This migration makes it EXPLICIT at S19 (the
-- deploy boundary where 'Application deployed' is gated).
--
-- HOW: lib/eva/lifecycle/exit-gate-enforcer.js reads
-- venture_stages.metadata.gates.exit for the from_stage and dispatches each
-- prose string to a verifier. Prepending 'spend guardrails ready' to S19's
-- exit array (BEFORE 'Application deployed') makes the registered fail-closed
-- verifier run, so a venture cannot advance past S19 unless a row exists for
-- each of the 8 canonical guardrails AND every decision='allow' AND no
-- kill-switch is open.
--
-- Additive + idempotent: prepends only the new gate string, preserving the
-- existing exit gates and their order, and the WHERE guard makes a re-run a
-- no-op.
--
-- Rollback: UPDATE venture_stages
--   SET metadata = jsonb_set(metadata, '{gates,exit}',
--         (metadata->'gates'->'exit') - 'spend guardrails ready')
--   WHERE stage_number = 19;

BEGIN;

UPDATE venture_stages
SET metadata = jsonb_set(
      metadata,
      '{gates,exit}',
      ('["spend guardrails ready"]'::jsonb) || (metadata->'gates'->'exit')
    ),
    updated_at = now()
WHERE stage_number = 19
  AND NOT ((metadata->'gates'->'exit') ? 'spend guardrails ready');

COMMIT;
