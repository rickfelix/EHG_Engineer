-- Chairman-decisions AUDIT CHANNEL column — records WHICH channel a chairman decision was made
-- over, so an SMS-decided stage-gate approval is distinguishable from an authenticated-console one
-- on the SAME chairman_decisions row (audit parity).
-- SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-B (FR-2; child B of the high-consequence-stage
-- orchestrator — registers 'blocking stage-gate approval' as an SMS decision class + guardrails
-- on the already-shipped chairman SMS decision envelope, SD-LEO-FEAT-SMS-CHAIRMAN-DECISION-001/-A/-B).
-- Solomon-ratified guardrail (3) "AUDIT PARITY": an SMS decision lands on the same
-- chairman_decisions row as a console decision, distinguished ONLY by channel='sms'.
--
-- WHY a nullable column with NO new RLS policy: this is an ADDITIVE audit attribute on an
-- EXISTING table. ADD COLUMN reuses chairman_decisions' existing RLS policies (do NOT author a
-- new policy — mirrors the nullable amount_usd add in 20260717_sms_spend_envelope_STAGED.sql).
-- NULL is the pre-existing/unknown state and is interpreted as console (the historical default);
-- only an SMS decision is ever stamped 'sms'. The CHECK bounds the vocabulary to ('sms','console').
--
-- FAIL-SOFT PRE-APPLY: the referencing seam lib/chairman/sms-bridge.js (stampSmsChannel, called
-- on the outbound-send + inbound-answer paths) writes channel='sms' as a SEPARATE best-effort
-- UPDATE, wrapped so a missing column PRE-APPLY resolves to {error} and is swallowed — the live
-- SMS decision path is never crashed or blocked, the row is simply left unstamped until this
-- migration is applied. Console-path decisions never call the seam, so channel stays NULL (=console).
--
-- STAGED — NOT YET APPROVED FOR APPLY. requires-chairman-apply. Do NOT auto-apply on merge; no
-- approved-by attestation on this file. APPLY RUNBOOK (chairman ceremony):
--   (1) chairman verbal/written approval;
--   (2) apply via the standard migration path with an approved-by attestation commit;
--   (3) run `npm run schema:snapshot:lint` and commit the regenerated snapshot in the same PR
--       (the schema-lint-disable-line pragma on the stampSmsChannel channel write then becomes
--       unnecessary) — schema:snapshot:lint runs AT the ceremony, not now;
--   (4) verify with a real service_role probe: stamp channel='sms' on a test SMS decision and
--       confirm the CHECK accepts 'sms'/'console' and rejects any other value.

ALTER TABLE chairman_decisions
  ADD COLUMN IF NOT EXISTS channel TEXT CHECK (channel IN ('sms', 'console'));

COMMENT ON COLUMN chairman_decisions.channel IS
  'Audit channel a chairman decision was made over (SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-B FR-2). sms = decided over the chairman SMS decision channel; console = authenticated console. NULL = unknown/legacy, interpreted as console. Stamped fail-soft by lib/chairman/sms-bridge.js stampSmsChannel; ADD COLUMN reuses the table RLS policies (no new policy).';
