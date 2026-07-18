-- PC-5 (rate/soak cap) — SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-C.
--
-- Records every switch-on AUTO-PROCEED (not chairman-routed decisions) so
-- lib/switch-automation/prechecks/rate-soak.js can enforce a per-component rate cap
-- (mirrors CONST-007's 3-per-24h shape, applied to this new action class) and a
-- minimum soak spacing between consecutive auto-proceeds.
--
-- Additive-only (CREATE TABLE IF NOT EXISTS + RLS + CREATE POLICY, no ALTER/DROP/
-- GRANT/REVOKE) -- TIER-1-eligible per the tiered migration auto-apply policy
-- (CLAUDE_CORE.md), unlike child A's REVOKE-hardened chairman_switchon_policy table.

CREATE TABLE IF NOT EXISTS public.switchon_auto_actions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component    text NOT NULL,
  action       text NOT NULL,
  occurred_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.switchon_auto_actions IS
  'PC-5 rate/soak log for op-co switch-on auto-proceeds (SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-C). One row per auto-proceed decision; read by checkRateSoak() to enforce a per-component rate cap + minimum soak spacing.';

CREATE INDEX IF NOT EXISTS idx_switchon_auto_actions_component_time
  ON public.switchon_auto_actions (component, occurred_at DESC);

ALTER TABLE public.switchon_auto_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS switchon_auto_actions_service_role ON public.switchon_auto_actions;
CREATE POLICY switchon_auto_actions_service_role ON public.switchon_auto_actions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Chairman-only read: this is a governance audit trail, not tenant/customer data --
-- a blanket `authenticated USING (true)` would let any logged-in user read every
-- component's rate/soak history. Mirrors sibling A's chairman_switchon_policy
-- pattern (fn_is_chairman()) rather than an unconditional grant
-- (RLS-ANON-TENANT-PREDICATE-LINT class: unconditional_anon_select).
DROP POLICY IF EXISTS switchon_auto_actions_authenticated_read ON public.switchon_auto_actions;
CREATE POLICY switchon_auto_actions_authenticated_read ON public.switchon_auto_actions
  FOR SELECT TO authenticated USING (fn_is_chairman());
