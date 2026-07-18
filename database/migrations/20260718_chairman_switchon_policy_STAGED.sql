-- Chairman switch-on policy — the DB-backed reversible/consequential class list for the
-- intelligent op-co switch-on automation.
-- SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-A (FR-2, child A of the switch-on
-- orchestrator; scope is the policy table + ratchet ONLY -- wiring into the real
-- dispatch-authorization.cjs enforcement path is child B).
-- Chairman-ratified 2026-07-18 (SMS Yes) policy boundary; delegated auto-proceed authority.
--
-- WHY: the switch-on classifier (lib/switch-automation/reversibility-classifier.js) needs a
-- chairman-ratified, DB-backed source of truth for its NEVER-AUTO class list -- not code
-- comments, which drift silently and cannot be audited or widened through a governed
-- ceremony. This table generalizes sms_decision_class_whitelist's shape for that purpose.
--
-- GOVERNANCE -- WHO IS STOPPED BY WHAT (mirrors 20260717_sms_decision_class_whitelist_STAGED.sql,
-- the ratified precedent for chairman-gated STAGED policy tables):
--   * anon / ordinary authenticated users are stopped at the RLS LAYER: no INSERT/UPDATE/
--     DELETE policy exists for them, and SELECT is chairman-only (fn_is_chairman()).
--   * service_role BYPASSES RLS (rolbypassrls=true), so RLS alone would NOT stop the fleet's
--     service_role client from widening the policy. The DB-HARD RATCHET below closes that:
--     a REVOKE of INSERT/UPDATE/DELETE binds the TABLE PRIVILEGE layer, which service_role
--     does NOT bypass. The only principal that can widen the policy is the table OWNER
--     (postgres) acting through the chairman apply ceremony -- the ratchet is thus DB-enforced,
--     not just application discipline (same guard class as the SMS whitelist and the
--     self-reference rule: "the policy/ratchet itself" is itself a NEVER-AUTO class, row-seeded
--     below, so this table can never be used to widen itself).
--   * the read path (the classifier's policy lookup, child B) MUST use a service_role client:
--     service_role bypasses the chairman-only SELECT policy to read the list; an
--     anon/authenticated read sees ZERO rows (fail-closed to consequential/chairman, never
--     fail-open to auto-proceed).
--
-- STAGED -- NOT YET APPLIED. requires-chairman-apply. Do NOT auto-apply on merge; no
-- approved-by attestation. APPLY RUNBOOK (chairman ceremony):
--   (1) chairman verbal/written approval of the row contents below (the NEVER-AUTO seed list);
--   (2) apply via the standard migration path with an approved-by attestation commit,
--       AS THE TABLE OWNER (postgres) -- the owner is exempt from the REVOKE and is the ONLY
--       principal that seeds/widens the policy;
--   (3) run `npm run schema:snapshot:lint` and commit the regenerated snapshot in the same PR;
--   (4) verify with a real service_role select probe against chairman_switchon_policy --
--       child B's enforcement gate flips from fail-closed-to-chairman to policy-gated
--       automatically once rows exist; no code change needed in child B.

CREATE TABLE IF NOT EXISTS chairman_switchon_policy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The action class this policy row governs. Stored NORMALIZED (lowercased/trimmed) by the
  -- chairman ceremony, matching lib/switch-automation/reversibility-classifier.js's
  -- NEVER_AUTO_CLASSES string keys via an EXACT compare (never substring/ilike).
  action_class TEXT NOT NULL UNIQUE
    CHECK (action_class = lower(btrim(action_class)) AND action_class <> ''),

  -- 'never_auto' = always routes to chairman regardless of precheck; 'reversible_eligible' =
  -- MAY auto-proceed if the precheck (child C) is green. There is no third value -- unknown/
  -- unclassified actions are handled by the classifier's own fail-closed default, not a row here.
  classification TEXT NOT NULL CHECK (classification IN ('never_auto', 'reversible_eligible')),

  -- A class can be de-listed without deleting its audit row.
  active BOOLEAN NOT NULL DEFAULT true,

  -- Provenance for the audit trail (CONST-003: actor, policy version, evidence snapshot).
  added_by TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rationale TEXT
);

-- RLS + policies in the SAME migration as CREATE TABLE (SPINE-001-B recurrence guard).
ALTER TABLE chairman_switchon_policy ENABLE ROW LEVEL SECURITY;

-- Chairman-only read: the policy is a chairman-audience security control.
DROP POLICY IF EXISTS chairman_switchon_policy_chairman_select ON chairman_switchon_policy;
CREATE POLICY chairman_switchon_policy_chairman_select ON chairman_switchon_policy
  FOR SELECT USING (fn_is_chairman());

-- Deliberately NO INSERT/UPDATE/DELETE policy: widening the policy is a chairman-ceremony
-- act performed by the table owner, never by anon/authenticated/service_role at runtime.

-- DB-HARD RATCHET: bind the TABLE-PRIVILEGE layer so even service_role (which bypasses RLS,
-- but NOT GRANT/REVOKE) cannot INSERT/UPDATE/DELETE. Self-reference guard: this table cannot
-- be used to widen itself, since widening IS an INSERT/UPDATE and those are revoked here.
REVOKE INSERT, UPDATE, DELETE ON chairman_switchon_policy FROM anon, authenticated, service_role;

COMMENT ON TABLE chairman_switchon_policy IS
  'Chairman-ratified reversible/consequential class list for op-co switch-on automation (SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-A FR-2). Fail-closed: absent/unlisted/inactive class routes to consequential (chairman), never auto-proceed. Chairman-only SELECT; INSERT/UPDATE/DELETE REVOKEd from anon/authenticated/service_role so only the table owner (chairman ceremony) can widen it -- including widening the policy/ratchet itself.';

-- ============================================================
-- Chairman-ratified NEVER-AUTO seed rows (applied by the ceremony, NOT by this migration --
-- listed here for the chairman's approval review; the INSERT itself runs as the table owner
-- during apply, per the runbook above, not as part of this STAGED file).
-- ============================================================
-- venture-gate-binding-flip, live-venture-deploy, live-money-enablement,
-- live-payment-account-creation, dns-mutation, public-launch, first-external-send,
-- venture-selection, venture-kill, venture-promote, gate-config-change, gate-threshold-change,
-- gate-skiplist-change, agent-authority-expansion, credential-grant-expansion,
-- freeze-machinery, kill-switch-machinery, policy-ratchet-self-reference
-- (verbatim match to lib/switch-automation/reversibility-classifier.js NEVER_AUTO_CLASSES.
--  live-venture-deploy / live-payment-account-creation / dns-mutation satisfy GUARDRAIL-1's
--  explicit enumeration requirement.)
