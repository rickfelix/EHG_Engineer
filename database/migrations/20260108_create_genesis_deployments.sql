-- Migration: Create genesis_deployments table
-- Date: 2026-01-08
-- SD: SD-GENESIS-FIX-001 (US-002)
-- Purpose: Create table to track Genesis Vercel preview deployments
--
-- Root Cause: The vercel-deploy.js module references genesis_deployments table
-- but the table was never created, causing deployment tracking to fail silently.

-- =====================================================
-- Table: genesis_deployments
-- Purpose: Track Vercel preview deployments for Genesis simulations
-- =====================================================
CREATE TABLE IF NOT EXISTS genesis_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id UUID REFERENCES simulation_sessions(id) ON DELETE CASCADE,
  preview_url TEXT NOT NULL,
  deployment_id TEXT, -- Vercel deployment ID (dpl_xxx)
  project_name TEXT,
  ttl_days INTEGER DEFAULT 7,
  expires_at TIMESTAMPTZ NOT NULL,
  health_status TEXT DEFAULT 'pending' CHECK (health_status IN ('pending', 'healthy', 'unhealthy', 'expired', 'deleted')),
  last_health_check TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_genesis_deployments_simulation_id
  ON genesis_deployments(simulation_id);

CREATE INDEX IF NOT EXISTS idx_genesis_deployments_expires_at
  ON genesis_deployments(expires_at);

CREATE INDEX IF NOT EXISTS idx_genesis_deployments_health_status
  ON genesis_deployments(health_status);

-- Enable RLS
ALTER TABLE genesis_deployments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "genesis_deployments_select"
  ON genesis_deployments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "genesis_deployments_insert"
  ON genesis_deployments FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "genesis_deployments_update"
  ON genesis_deployments FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "genesis_deployments_delete"
  ON genesis_deployments FOR DELETE
  TO authenticated
  USING (true);

-- Service role bypass (for automated scripts)
CREATE POLICY "genesis_deployments_service_role"
  ON genesis_deployments
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Comments for documentation
COMMENT ON TABLE genesis_deployments IS
  'Tracks Vercel preview deployments for Genesis simulation sessions. Part of the Virtual Bunker deployment pipeline.';

COMMENT ON COLUMN genesis_deployments.simulation_id IS
  'Reference to the simulation session this deployment belongs to';

COMMENT ON COLUMN genesis_deployments.preview_url IS
  'Full Vercel preview URL (https://xxx.vercel.app)';

COMMENT ON COLUMN genesis_deployments.deployment_id IS
  'Vercel deployment ID for management operations (dpl_xxx format)';

COMMENT ON COLUMN genesis_deployments.ttl_days IS
  'Time-to-live in days before auto-cleanup (default: 7)';

COMMENT ON COLUMN genesis_deployments.health_status IS
  'Current health status from periodic checks: pending, healthy, unhealthy, expired, deleted';
