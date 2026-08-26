-- SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-C (FR-1) -- asset<->variant scoring join.
--
-- Links a produced creative_assets row to the marketing_content_variants row it is being
-- tested as, so lib/creative/variant-scoring-bridge.js can resolve a thompson-sampler.js
-- selection back to the originating asset. A join table, NOT a creative_assets.variant_id
-- column: marketing_content_variants.content_id is NOT NULL, so a bare FK would force
-- minting a synthetic marketing_content parent for every generated asset.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- THE authenticated-ROLE POLICY IS NOT IN THIS FILE. THIS IS DELIBERATE.
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- An earlier revision of this file shipped a `cavs_venture_access` policy scoped ONLY through
-- creative_assets.venture_id. That policy was a proven cross-tenant hole: it constrained
-- creative_asset_id but left variant_id COMPLETELY unconstrained, and because it declared no
-- WITH CHECK, Postgres reused that same incomplete USING expression for INSERT/UPDATE. A
-- tenant of venture A could therefore INSERT (own_asset_id, venture_B_variant_id) -- FK
-- integrity checks run as table owner and bypass RLS, so the write succeeded. Since both FKs
-- here are NO ACTION (below), the planted row then permanently blocked venture B from
-- deleting its own variant (SQLSTATE 23503), and venture B could neither see nor remove the
-- blocking row because RLS correctly hid it from them. Measured live, in a rolled-back
-- transaction, against this database.
--
-- Closing that hole requires the policy to also prove that variant_id's
-- marketing_content_variants -> marketing_content -> venture_id matches the SAME venture as
-- creative_asset_id's creative_assets.venture_id. That check CANNOT be written inline here,
-- and the reason is load-bearing rather than stylistic (measured, not assumed):
--
--   Postgres evaluates an RLS policy expression as the querying role, so any table the
--   expression reads has ITS OWN RLS applied too. marketing_content_variants and
--   marketing_content are both RLS-enabled and scope `authenticated` reads through
--   ventures.created_by -- a DIFFERENT ownership model from the user_company_access model
--   this table and creative_assets use. A plain `EXISTS (... JOIN marketing_content_variants
--   ... JOIN marketing_content ...)` predicate therefore sees ZERO rows for a company-access
--   user who did not personally create the venture, so the EXISTS is false for EVERY row and
--   the policy denies legitimate same-venture access as well as the cross-tenant write.
--   Measured: with the fixture user holding user_company_access to venture A's company, the
--   inline-EXISTS variant blocked the cross-tenant INSERT *and* the legitimate same-venture
--   INSERT (both 42501), with marketing_content_variants visible-row count 0 of 2.
--
--   Resolving the variant's venture therefore requires a SECURITY DEFINER resolver, which is
--   TIER-2 and must never sit in an auto-applied path (database/chairman-gated/README.md:
--   "A worker cannot place chairman-gated DDL in an auto-applied path and still call it
--   gated"). It lives in the chairman-gated companion instead:
--
--       database/chairman-gated/20260826_creative_asset_variant_scores_rls_fix.sql
--
-- UNTIL THAT COMPANION IS APPLIED, THIS TABLE IS FAIL-CLOSED, NOT OPEN: RLS is enabled below
-- with no `authenticated` policy at all, and Postgres denies every row to a role that matches
-- no permissive policy. service_role (the role lib/creative/variant-scoring-bridge.js and the
-- FR-8 retention sweep run under) is unaffected. Do NOT "restore" a creative_asset_id-only
-- policy here to make the table readable -- that is precisely the vulnerability.
--
-- TIER-1 CONSTRAINTS THIS FILE MUST HOLD (measured, DATABASE evidence
-- e4a15210-082f-49b1-a45e-2dbd3e121641 -- verify with classifyMigration() before merging):
--   * NO referential action clause anywhere. The classifier's whole-file FORBIDDEN_TOPLEVEL
--     sweep bans the bare token DELETE, which any ON DELETE clause necessarily contains.
--     KNOWN CONSEQUENCE (FR-9): these FKs are NO ACTION, so they block the ventures cascade
--     that delete_venture() relies on once this table holds rows. Teardown is an explicit,
--     separate, deliberately chairman-gated follow-up, not cascade. Do not "fix" this by
--     adding ON DELETE CASCADE -- it silently demotes the file to TIER-2 and it stops
--     auto-applying.
--   * NO "COMMENT ON TABLE" (only COMMENT ON COLUMN is allow-listed).
--   * NO partial index (a WHERE predicate on CREATE INDEX is TIER-2).
--   * NO SECURITY DEFINER function (that is why the resolver is in the gated companion).
--
-- Rollback: paired 20260826_creative_asset_variant_scores_DOWN.sql drops the table.

CREATE TABLE IF NOT EXISTS creative_asset_variant_scores (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_asset_id UUID NOT NULL REFERENCES creative_assets(id),
  variant_id        UUID NOT NULL REFERENCES marketing_content_variants(id),
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (creative_asset_id, variant_id)
);

-- (creative_asset_id, variant_id) UNIQUE already provides a btree with creative_asset_id
-- leading, which serves both the RLS subquery and the FR-3 per-venture filter. Only the
-- variant_id side needs its own index (FR-2 joins daily_rollups on variant_id).
CREATE INDEX IF NOT EXISTS creative_asset_variant_scores_variant_idx
  ON creative_asset_variant_scores (variant_id);

-- FR-8 retention sweep scans by created_at.
CREATE INDEX IF NOT EXISTS creative_asset_variant_scores_created_at_idx
  ON creative_asset_variant_scores (created_at);

ALTER TABLE creative_asset_variant_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY cavs_service_role ON creative_asset_variant_scores
  FOR ALL TO service_role
  USING (true);
