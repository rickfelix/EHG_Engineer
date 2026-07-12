-- SD-LEO-FEAT-PROVISION-VENTURE-EMAIL-001 — per-venture email identity mapping + resume state.
-- TIER-1 additive-only (CREATE TABLE/INDEX IF NOT EXISTS, ENABLE RLS, CREATE POLICY — all
-- allow-listed). Deliberately NO trigger (CREATE TRIGGER is tier-2): updated_at is bumped
-- explicitly by the step machine's lock_version CAS updates.
--
-- Design provenance: DATABASE sub-agent CONDITIONAL_PASS ace27b7f (conditions C1-C7):
--   * provision_state is a CHECK-constrained enum with LAST-COMPLETED-step semantics —
--     resume runs the next incomplete step; 'registered' is explicit (resume-from-registered
--     beta-registrar fallback); 'plan_mode' and 'failed' are terminal branches.
--   * scoped_key_id stores the Resend key ID ONLY. The minted key VALUE goes to the existing
--     venture_channel_secrets convention (channel_type='email', provider='resend') — never here.
--   * venture_id is a SOFT reference (nullable, indexed, NO FK): mirrors portfolio_evidence
--     precedent; `ventures` exists in two schemas and plan-mode provisioning may precede the row.
--   * UNIQUE(domain) is the resume/idempotency key; lock_version enables optimistic CAS on
--     state transitions against concurrent double-invocation.
--
-- RLS MANDATE (same-file, non-negotiable — SPINE-001-B RLS-omission recurrence 2026-07-12):
-- service_role-only ALL policy; anon/authenticated default-denied.

CREATE TABLE IF NOT EXISTS venture_email_identities (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id       UUID,
  domain           TEXT NOT NULL UNIQUE,
  cf_zone_id       TEXT,
  resend_domain_id TEXT,
  scoped_key_id    TEXT,
  routes           JSONB NOT NULL DEFAULT '{}'::jsonb,
  provision_state  TEXT NOT NULL DEFAULT 'pending' CHECK (provision_state IN (
    'pending', 'registered', 'domain_enrolled', 'dns_written', 'verified',
    'key_scoped', 'routes_wired', 'provisioned', 'plan_mode', 'failed'
  )),
  last_error       TEXT,
  lock_version     INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vei_venture ON venture_email_identities(venture_id) WHERE venture_id IS NOT NULL;
-- Stuck-run monitoring (P6 owner loop): non-terminal states ordered by staleness.
CREATE INDEX IF NOT EXISTS idx_vei_active_state ON venture_email_identities(provision_state, updated_at)
  WHERE provision_state NOT IN ('provisioned', 'plan_mode', 'failed');

ALTER TABLE venture_email_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all_venture_email_identities ON venture_email_identities
  FOR ALL TO service_role USING (true) WITH CHECK (true);
