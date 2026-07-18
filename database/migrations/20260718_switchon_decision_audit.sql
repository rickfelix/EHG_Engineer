-- PC-7 (CONST-003 audit stamp) — SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-C.
--
-- Durable actor/policy_version/evidence_snapshot audit trail for every switch-on
-- decision (auto-proceed OR held-for-chairman). Closes the gap child A's own
-- migration comment named (CONST-003: actor, policy version, evidence snapshot) but
-- did not implement -- chairman_switchon_policy ships only added_by/added_at/
-- rationale, and is REVOKE-locked against per-decision writes anyway (only the
-- chairman-ceremony table owner may INSERT), so it is the wrong write target for a
-- per-decision log.
--
-- Additive-only (CREATE TABLE IF NOT EXISTS + RLS + CREATE POLICY, no ALTER/DROP/
-- GRANT/REVOKE) -- TIER-1-eligible per the tiered migration auto-apply policy.

CREATE TABLE IF NOT EXISTS public.switchon_decision_audit (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component          text NOT NULL,
  action             text NOT NULL,
  actor              text NOT NULL,
  policy_version     text NOT NULL,
  evidence_snapshot  jsonb NOT NULL,
  decision           text NOT NULL CHECK (decision IN ('auto-proceed', 'held-for-chairman')),
  created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.switchon_decision_audit IS
  'CONST-003 audit stamp for every op-co switch-on decision (SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-C, PC-7): actor, policy_version (chairman_switchon_policy state at decision time), and a full evidence_snapshot (classifier + authorizeSwitchOn + all 6 precheck results). Written by recordSwitchOnAuditStamp() for BOTH auto-proceed and held-for-chairman outcomes.';

CREATE INDEX IF NOT EXISTS idx_switchon_decision_audit_component_time
  ON public.switchon_decision_audit (component, created_at DESC);

ALTER TABLE public.switchon_decision_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS switchon_decision_audit_service_role ON public.switchon_decision_audit;
CREATE POLICY switchon_decision_audit_service_role ON public.switchon_decision_audit
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Chairman-only read: this is a governance audit trail, not tenant/customer data --
-- a blanket `authenticated USING (true)` would let any logged-in user read every
-- switch-on decision. Mirrors sibling A's chairman_switchon_policy pattern
-- (fn_is_chairman()) rather than an unconditional grant
-- (RLS-ANON-TENANT-PREDICATE-LINT class: unconditional_anon_select).
DROP POLICY IF EXISTS switchon_decision_audit_authenticated_read ON public.switchon_decision_audit;
CREATE POLICY switchon_decision_audit_authenticated_read ON public.switchon_decision_audit
  FOR SELECT TO authenticated USING (fn_is_chairman());
