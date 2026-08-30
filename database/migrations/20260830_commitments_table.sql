-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-INFRA-OPEN-COMMITMENTS-RECONCILED-001 / FR-3
-- Minimal durable table for verbal/role-message commitments (e.g. a chairman/coordinator
-- verbal promise, not backed by a queryable session_coordination row). Written by the send
-- path (lib/coordinator/dispatch.cjs's insertCoordinationRow, via commitment-writer.cjs) when
-- a message body declares a commitment; read by the extended relay-drop-gauge (FR-2) so a
-- verbal commitment is queryable within the same minute it is sent. Additive only -- no
-- existing table touched.
--
-- SECURITY (SEC-1, EXEC-phase SECURITY sub-agent review): pg_default_acl in this database
-- grants anon/authenticated full DML on every new relation by default (measured live against
-- coordination_receipts and documented in 20260824_chairman_held_sends.sql's header) -- a
-- bare CREATE TABLE with no RLS/REVOKE would let the public anon key forge or erase
-- commitments. This table follows the chairman_held_sends precedent: RLS enabled +
-- service-role-only policy + explicit REVOKE, since every writer/reader here already uses
-- the service-role client (lib/coordinator/commitment-writer.cjs, relay-drop-gauge.cjs,
-- scripts/hooks/session-register.cjs) and RLS is bypassed by service_role regardless.
--
-- Rollback (uncomment + execute via database-agent if needed):
--   DROP TABLE IF EXISTS public.commitments;

BEGIN;

CREATE TABLE IF NOT EXISTS public.commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_session TEXT NOT NULL,
  counterparty_session TEXT,
  subject TEXT NOT NULL,
  due_by TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commitments_owner_session ON public.commitments (owner_session) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_commitments_counterparty_session ON public.commitments (counterparty_session) WHERE resolved_at IS NULL;

COMMENT ON TABLE public.commitments IS 'SD-LEO-INFRA-OPEN-COMMITMENTS-RECONCILED-001 FR-3: verbal/role-message commitments not backed by a session_coordination row, read by lib/coordinator/relay-drop-gauge.cjs.';

-- Posture: service-role only. ASSERTED, never inherited — see the header above.
ALTER TABLE public.commitments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commitments_service_role ON public.commitments;
CREATE POLICY commitments_service_role
  ON public.commitments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.commitments FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.commitments TO service_role;

COMMIT;
