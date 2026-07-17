-- SMS decision-class whitelist — the explicit allow-list of decision classes that MAY be
-- surfaced to the chairman over the unauthenticated SMS channel.
-- SD-LEO-FEAT-SMS-CHAIRMAN-DECISION-001-A (FR-1, child A of the SMS-chairman-decision
-- orchestrator; scope is the whitelist ONLY — spend caps + undo window are child B).
-- Solomon-ratified financial-envelope work; chairman-gated real-money security control.
--
-- WHY: today the SMS send path (lib/chairman/sms-bridge.js) fails-closed on HIGH consequence
-- via the consequence classifier, but any LOW/MEDIUM class can reach the chairman's phone.
-- This table flips that to an ALLOW-LIST: only classes an operator has explicitly whitelisted
-- are SMS-eligible; everything else is console-only. It is defense-in-depth BEHIND the
-- existing HIGH->console classifier gate (which still runs first and independently), so a
-- decision that mislabels its own class as low still cannot cross the HIGH backstop.
--
-- GOVERNANCE — WHO IS STOPPED BY WHAT (mirrors 20260717_governed_change_proposals_STAGED.sql,
-- the ratified precedent for chairman-gated STAGED tables):
--   * anon / ordinary authenticated users are stopped at the RLS LAYER: no INSERT/UPDATE/
--     DELETE policy exists for them, and SELECT is chairman-only (fn_is_chairman()) — the
--     whitelist is a chairman-audience security control.
--   * service_role BYPASSES RLS (rolbypassrls=true), so RLS alone would NOT stop the fleet's
--     service_role client from widening the whitelist. The DB-HARD RATCHET below closes that:
--     a REVOKE of INSERT/UPDATE/DELETE binds the TABLE PRIVILEGE layer, which service_role
--     does NOT bypass (rolbypassrls skips RLS, never GRANT/REVOKE). The only principal that
--     can widen the list is the table OWNER (postgres) acting through the chairman apply
--     ceremony below — the console-only widening ratchet is thus DB-enforced, not just
--     application discipline.
--   * the read path (lib/chairman/sms-decision-whitelist.js) MUST use a service_role client:
--     service_role bypasses the chairman-only SELECT policy, so it can READ the list to make
--     the send/hold decision; an anon/authenticated read sees ZERO rows (permanent all-console
--     fail-closed). Reads never need INSERT/UPDATE/DELETE, so the REVOKE does not affect them.
--
-- STAGED — NOT YET APPROVED FOR APPLY. requires-chairman-apply. Do NOT auto-apply on merge;
-- no approved-by attestation. APPLY RUNBOOK (chairman ceremony):
--   (1) chairman verbal/written approval;
--   (2) apply via the standard migration path with an approved-by attestation commit,
--       AS THE TABLE OWNER (postgres) — the owner is exempt from the REVOKE and is the ONLY
--       principal that seeds/widens the whitelist (INSERT rows here as part of the ceremony);
--   (3) run `npm run schema:snapshot:lint` and commit the regenerated snapshot in the same PR
--       (prevents the reactive red-CI trap flagged in retro 30ece4ed) — schema:snapshot:lint
--       runs AT THE CHAIRMAN-APPLY CEREMONY, not now;
--   (4) verify with a real service_role select probe against sms_decision_class_whitelist —
--       the send path flips from all-console to whitelist-gated automatically once rows exist;
--       no code change needed.

CREATE TABLE IF NOT EXISTS sms_decision_class_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The decision class that is SMS-eligible. Stored NORMALIZED (lowercased/trimmed) by the
  -- chairman ceremony — the read helper normalizes the inbound decisionType the same way and
  -- does an EXACT .eq compare (never a substring/ilike widen).
  decision_class TEXT NOT NULL UNIQUE,

  -- A class can be de-listed without deleting its audit row: active=false = console-only again.
  active BOOLEAN NOT NULL DEFAULT true,

  -- Provenance for the audit trail (who whitelisted it and why).
  added_by TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rationale TEXT
);

-- RLS + policies in the SAME migration as CREATE TABLE (SPINE-001-B recurrence guard).
ALTER TABLE sms_decision_class_whitelist ENABLE ROW LEVEL SECURITY;

-- Chairman-only read: the whitelist is a chairman-audience security control.
DROP POLICY IF EXISTS sms_decision_class_whitelist_chairman_select ON sms_decision_class_whitelist;
CREATE POLICY sms_decision_class_whitelist_chairman_select ON sms_decision_class_whitelist
  FOR SELECT USING (fn_is_chairman());

-- Deliberately NO INSERT/UPDATE/DELETE policy: widening the whitelist is a chairman-ceremony
-- act performed by the table owner, never by anon/authenticated/service_role at runtime.

-- DB-HARD RATCHET: bind the TABLE-PRIVILEGE layer so even service_role (which bypasses RLS,
-- but NOT GRANT/REVOKE) cannot INSERT/UPDATE/DELETE. This makes the console-only widening
-- ratchet DB-enforced. The chairman ceremony inserts rows as the table owner (postgres),
-- which is exempt from REVOKE.
REVOKE INSERT, UPDATE, DELETE ON sms_decision_class_whitelist FROM anon, authenticated, service_role;

COMMENT ON TABLE sms_decision_class_whitelist IS
  'Allow-list of decision classes SMS-eligible to the chairman (SD-LEO-FEAT-SMS-CHAIRMAN-DECISION-001-A FR-1). Fail-closed: absent/unlisted/inactive class -> console-only. Chairman-only SELECT; INSERT/UPDATE/DELETE REVOKEd from anon/authenticated/service_role so only the table owner (chairman ceremony) can widen it.';
