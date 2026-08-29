-- Migration: Add staleness + citation columns to competitive_baselines
-- SD: SD-LEO-INFRA-COMPETITIVE-BASELINES-RECURRING-001
-- Purpose: Support the recurring competitive-baseline pass -- staleness (produced_at/expires_at,
-- mirroring the product_hunt_cache fetched_at/expires_at TTL convention) and per-claim citations.
-- Plain additive: no CHECK-constraint widening, no NOT NULL without default, no backfill of the
-- 4 pre-existing STATUS_QUO placeholder rows (they stay NULL and are treated as always-stale by
-- the refresh query -- see lib/discovery/competitive-baseline-service.js).

ALTER TABLE competitive_baselines
  ADD COLUMN IF NOT EXISTS produced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS citations JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_competitive_baselines_expires_at ON competitive_baselines(expires_at);
