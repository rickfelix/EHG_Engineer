-- Migration: Create venture_provisioning_state table
-- SD: SD-LEO-INFRA-VENTURE-LEO-BUILD-001 (audit gap fix)
-- Created: 2026-03-26
-- Purpose: Track provisioning lifecycle for venture repos, schemas, CI/CD, and conformance checks.
-- Referenced by: provisioning-state.js, create-ehg-venture/index.js, stage-execution-worker.js, conformance-integration.js

-- ============================================================================
-- Table: venture_provisioning_state
-- ============================================================================
CREATE TABLE IF NOT EXISTS venture_provisioning_state (
    venture_id          UUID PRIMARY KEY,
    venture_name        TEXT NOT NULL UNIQUE,

    -- Provisioning lifecycle
    status              TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
    state               TEXT CHECK (state IN ('provisioned', 'pending', 'failed')),
    current_step        TEXT,
    steps_completed     TEXT[] DEFAULT '{}',
    error_details       TEXT,
    retry_count         INTEGER NOT NULL DEFAULT 0,

    -- Infrastructure references
    github_repo_url     TEXT,
    registry_entry_id   TEXT,

    -- Conformance check results
    conformance_score           INTEGER CHECK (conformance_score IS NULL OR (conformance_score >= 0 AND conformance_score <= 100)),
    conformance_threshold       INTEGER,
    conformance_passed          BOOLEAN,
    conformance_checks_total    INTEGER,
    conformance_checks_passing  INTEGER,
    conformance_failed_checks   JSONB,
    conformance_checked_at      TIMESTAMPTZ,

    -- Timestamps
    provisioned_at      TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vps_venture_name ON venture_provisioning_state(venture_name);
CREATE INDEX IF NOT EXISTS idx_vps_status ON venture_provisioning_state(status);
CREATE INDEX IF NOT EXISTS idx_vps_state ON venture_provisioning_state(state) WHERE state IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vps_provisioned_at ON venture_provisioning_state(provisioned_at DESC) WHERE provisioned_at IS NOT NULL;

-- Comments
COMMENT ON TABLE venture_provisioning_state IS 'Tracks venture provisioning lifecycle: repo creation, registry entry, schema setup, CI/CD config, and conformance checks. Referenced by the Stage 18 post-approval hook and create-ehg-venture --register.';

-- ============================================================================
-- RLS Policies
-- ============================================================================
ALTER TABLE venture_provisioning_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS manage_venture_provisioning_state ON venture_provisioning_state;
CREATE POLICY manage_venture_provisioning_state
    ON venture_provisioning_state FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS select_venture_provisioning_state ON venture_provisioning_state;
CREATE POLICY select_venture_provisioning_state
    ON venture_provisioning_state FOR SELECT
    TO authenticated
    USING (true);

-- ============================================================================
-- Trigger: auto-update updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION trg_vps_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_venture_provisioning_state_updated ON venture_provisioning_state;
CREATE TRIGGER trg_venture_provisioning_state_updated
    BEFORE UPDATE ON venture_provisioning_state
    FOR EACH ROW
    EXECUTE FUNCTION trg_vps_updated_at();
