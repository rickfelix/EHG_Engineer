-- SMS decision-class whitelist SEED — register 'blocking stage-gate approval' as an SMS-eligible
-- decision class (owner-run at the chairman ceremony).
-- SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-B (FR-3; child B of the high-consequence-stage
-- orchestrator). This is the ACTUAL registration referenced by the SD title — a single seed row
-- in sms_decision_class_whitelist (the table created by
-- 20260717_sms_decision_class_whitelist_STAGED.sql). Solomon-ratified guardrail (c) "RATCHET":
-- widening the whitelist IS a governance change -> console-only, chairman-ratified (the routing
-- policy can never be edited over the channel it governs). This seed is therefore authored as a
-- STAGED owner-run migration, NOT a JS change and NOT applied by the worker.
--
-- WHY owner-only: INSERT/UPDATE/DELETE on sms_decision_class_whitelist are REVOKE'd from
-- anon/authenticated/service_role at the TABLE-PRIVILEGE layer (see the parent whitelist migration).
-- service_role BYPASSES RLS but NOT GRANT/REVOKE, so ONLY the table owner (postgres), acting
-- through the chairman ceremony, can run this INSERT. The fleet worker can never seed the whitelist.
--
-- NORMALIZATION: the table CHECK requires decision_class = lower(btrim(decision_class)) AND <> ''.
-- 'blocking stage-gate approval' is already lowercase/trimmed/non-empty, so it passes the CHECK.
-- ON CONFLICT (decision_class) DO NOTHING makes re-running the ceremony idempotent (decision_class
-- is UNIQUE) — a second apply seeds nothing and errors nothing.
--
-- RECONCILIATION NOTE (not a blocker — see PRD TR-2 / risk): registration ALONE does not guarantee
-- SMS-eligibility. The whitelist gate in sms-bridge.js sits BEHIND the fail-closed HIGH-consequence
-- backstop (consequence-classifier.js, default HIGH). A 'blocking stage-gate approval' whose
-- title/context text trips HIGH_PATTERNS (governance/irreversible/kill-gate/etc.) still routes to
-- CONSOLE and never reaches this whitelist — that fail-toward-HIGH behavior is intentional and is
-- NOT loosened by this seed.
--
-- STAGED — NOT YET APPROVED FOR APPLY. requires-chairman-apply. Do NOT auto-apply on merge; no
-- approved-by attestation on this file. APPLY RUNBOOK (chairman ceremony):
--   (1) chairman verbal/written approval of registering this decision class;
--   (2) apply via the standard migration path AS THE TABLE OWNER (postgres) with an approved-by
--       attestation commit — the owner is exempt from the REVOKE and is the ONLY principal that
--       may seed/widen the whitelist;
--   (3) verify with a real service_role SELECT probe that the row exists + active=true — the SMS
--       send path then treats the class as whitelist-eligible automatically (no code change), still
--       behind the HIGH backstop above.

INSERT INTO sms_decision_class_whitelist (decision_class, active, added_by, rationale)
VALUES (
  'blocking stage-gate approval',
  true,
  'chairman-ceremony',
  'SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-B FR-3: registers blocking stage-gate approvals as SMS-eligible, behind the fail-closed HIGH backstop + $250/decision & $500/day spend envelope + 15m undo window. Solomon-ratified (.prd-payloads/CAPTURE-SOLOMON-SMS-DECISION-ROUTING.md).'
)
ON CONFLICT (decision_class) DO NOTHING;
