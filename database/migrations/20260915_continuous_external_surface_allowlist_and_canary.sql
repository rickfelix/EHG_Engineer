-- SD-LEO-INFRA-CONTINUOUS-EXTERNAL-SURFACE-001 (ratification 030d72e8, "Yes to both").
-- Schema-only migration: creates the two tables the new continuous external-surface checker
-- (lib/security/continuous-external-surface-checker.mjs) needs. Deliberately provably-additive
-- (CREATE TABLE IF NOT EXISTS + ENABLE ROW LEVEL SECURITY + CREATE POLICY only -- no GRANT, no
-- INSERT, no COMMENT ON TABLE) so scripts/lib/migration-tier-classifier.mjs classifies this as
-- TIER-1 and it auto-applies through the normal handoff path rather than requiring the manual
-- chairman @approved-by gate. The canary's single seed row is inserted separately by
-- scripts/one-off/continuous-external-surface-001-seed-canary.mjs (a plain service-role write,
-- matching this SD's own evidence-seeding pattern) precisely because a top-level INSERT
-- statement would fail the classifier's provably-additive rule set and force TIER-2.
--
-- public_read_allowlist: chairman-owned. This SD's own code (and this migration) NEVER inserts
-- a row here -- schema only. A row's presence with a non-null approved_at is what the checker's
-- classifyApproval() (FR-7) reads as an allowlist grant for that table_name.
CREATE TABLE IF NOT EXISTS public.public_read_allowlist (
  table_name TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL,
  ratification_ref TEXT NULL
);

ALTER TABLE public.public_read_allowlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_read_allowlist_service_role ON public.public_read_allowlist FOR ALL TO service_role USING (true) WITH CHECK (true);

-- public_surface_canary: owned by this SD. Exactly one row, seeded post-apply (see header
-- above), intentionally and permanently anon-readable -- the positive-canary proof that a
-- checker run which reports "nothing exposed" actually executed a live read, rather than
-- silently no-op'ing on a bad key or a dead connection.
CREATE TABLE IF NOT EXISTS public.public_surface_canary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL DEFAULT 'continuous-external-surface-canary',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.public_surface_canary ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_surface_canary_anon_read ON public.public_surface_canary FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY public_surface_canary_service_role ON public.public_surface_canary FOR ALL TO service_role USING (true) WITH CHECK (true);
