-- 20260616_sd_capabilities_scope_dimension.sql
-- SD-LEO-INFRA-UNBLOCK-PORTFOLIO-WIDE-001 (FR-1): the SD-3 keystone structural unblock.
--
-- Adds the additive `scope` dimension to sd_capabilities so capabilities can be reasoned
-- about at PORTFOLIO scope (distinct from the existing category / taxonomy_domain dimensions).
-- ADDITIVE ONLY: nullable, no default, NO backfill -> reversible, near-nil blast radius
-- (brief lock on a 217-row table; SELECT * consumers unaffected). Idempotent (IF NOT EXISTS).
--
-- TIER: additive (ADD COLUMN). Apply via the canonical migration path. Dormant by design:
-- nothing reads `scope` until portfolio-scope capability reasoning is wired; the column simply
-- unblocks that future work.

BEGIN;

ALTER TABLE sd_capabilities
  ADD COLUMN IF NOT EXISTS scope text;

COMMENT ON COLUMN sd_capabilities.scope IS
  'SD-LEO-INFRA-UNBLOCK-PORTFOLIO-WIDE-001: portfolio-scope dimension for a capability (e.g., venture | portfolio | platform). Nullable; distinct from category/taxonomy_domain. Dormant until portfolio-scope reasoning is wired.';

COMMIT;

-- ROLLBACK: ALTER TABLE sd_capabilities DROP COLUMN IF EXISTS scope;
