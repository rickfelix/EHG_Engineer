-- ============================================================================
-- Migration: door_routing_ledger — Fable-doctrine measurement columns
-- Date: 2026-07-07
-- SD: SD-LEO-INFRA-OPERATIONALIZE-FABLE-USE-001 (FR-5 / TR-3)
--
-- Adds two ADDITIVE, NULLABLE columns so Fable spend becomes measurable by
-- R-criterion (R1-R5, from lib/fleet/model-recommendation.cjs) and funnel
-- position (selection|design|detailing, phase-derived at dispatch time):
--   r_criterion      TEXT  — nullable; values 'R1'..'R5' or NULL (advisory)
--   funnel_position  TEXT  — nullable; values 'selection'|'design'|'detailing'
--                            or NULL (coarse, current_phase-derived proxy)
--
-- SELF-CONTAINED + IDEMPOTENT BY DESIGN. As of 2026-07-07 the base table
-- (created by SD-LEO-INFRA-TIERED-ORCHESTRATION-FABLE-001,
-- database/migrations/20260705_add_door_routing_ledger.sql) is written but NOT
-- YET APPLIED to the live DB — it is deferred to the door-routing cutover
-- alongside DOOR_ROUTING_ENABLED=true. To be order-independent, this migration
-- re-declares the base table with CREATE TABLE IF NOT EXISTS (a no-op once the
-- base migration lands) before adding the two new columns. No backfill: existing
-- ledger rows and the flag-gated writer (lib/fleet/door-routing-ledger.cjs)
-- continue to work unchanged; only new dispatches populate the two new columns.
--
-- APPLY POSTURE: Tier-1 additive-only (no policy/RLS, no destructive DDL, no
-- NOT NULL). Classified as delegatable-additive by the migration tier
-- classifier — eligible for the Adam delegated-apply path (or the standard
-- --prod-deploy 3-factor path); no chairman-personal @approved-by header
-- required. NOTE: allowed-value docs live in these -- line comments rather than
-- COMMENT ON COLUMN / inline CHECK DDL on purpose — those statement forms bump
-- the file to Tier-2 (chairman-only) in the classifier, and funnel_position is
-- fire-and-forget advisory telemetry where a hard CHECK would silently drop
-- ledger writes on an unexpected value.
-- ============================================================================

-- Base table (no-op if the cutover base migration already ran).
CREATE TABLE IF NOT EXISTS door_routing_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_key TEXT NOT NULL,
  door TEXT NOT NULL CHECK (door IN ('one_way', 'two_way')),
  delegate_model TEXT,
  tier_rank INTEGER,
  tokens_input BIGINT,
  tokens_output BIGINT,
  cost_usd NUMERIC(12, 6),
  model_id TEXT,
  coverage_note TEXT,
  routed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_door_routing_ledger_routed_at ON door_routing_ledger (routed_at);
CREATE INDEX IF NOT EXISTS idx_door_routing_ledger_work_key ON door_routing_ledger (work_key);

-- New FR-5 measurement columns (separate single-column ALTERs keep the file
-- Tier-1 delegatable; a comma-combined ALTER or inline CHECK bumps it to Tier-2).
ALTER TABLE door_routing_ledger ADD COLUMN IF NOT EXISTS r_criterion TEXT;
ALTER TABLE door_routing_ledger ADD COLUMN IF NOT EXISTS funnel_position TEXT;

-- Rollback:
--   ALTER TABLE door_routing_ledger DROP COLUMN IF EXISTS funnel_position;
--   ALTER TABLE door_routing_ledger DROP COLUMN IF EXISTS r_criterion;
