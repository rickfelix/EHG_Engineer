-- Engineering Sequence Proposals Table for WSJF Recommendations
-- Date: 2025-09-22
-- Purpose: Store WSJF-generated execution order proposals for review before applying
-- Risk: LOW - New table, no impact on existing data

\set ON_ERROR_STOP on
\timing on

BEGIN;

-- 1. Create eng_sequence_proposals table
CREATE TABLE IF NOT EXISTS eng_sequence_proposals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_id varchar(50) NOT NULL REFERENCES strategic_directives_v2(id),
    venture_id uuid,
    current_execution_order integer,
    proposed_execution_order integer NOT NULL,
    delta integer GENERATED ALWAYS AS (proposed_execution_order - COALESCE(current_execution_order, 0)) STORED,
    wsjf_score numeric(10,6),
    rationale text,
    status text DEFAULT 'proposed' CHECK (status IN ('proposed', 'accepted', 'applied', 'rejected', 'stale')),

    -- Metadata
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    accepted_at timestamptz,
    accepted_by text,
    applied_at timestamptz,
    applied_by text,
    rejection_reason text,

    -- Audit trail
    source_run_id uuid,
    source_workflow text,
    metadata jsonb DEFAULT '{}'::jsonb,

    -- Constraints
    CONSTRAINT unique_active_proposal UNIQUE (sd_id, status) WHERE status IN ('proposed', 'accepted')
);

-- 2. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_eng_sequence_proposals_status
    ON eng_sequence_proposals(status);
CREATE INDEX IF NOT EXISTS idx_eng_sequence_proposals_sd_id
    ON eng_sequence_proposals(sd_id);
CREATE INDEX IF NOT EXISTS idx_eng_sequence_proposals_venture_id
    ON eng_sequence_proposals(venture_id);
CREATE INDEX IF NOT EXISTS idx_eng_sequence_proposals_delta
    ON eng_sequence_proposals(ABS(delta));
CREATE INDEX IF NOT EXISTS idx_eng_sequence_proposals_created_at
    ON eng_sequence_proposals(created_at DESC);

-- 3. Update trigger
CREATE OR REPLACE FUNCTION eng_proposals_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();

    -- Track acceptance timestamp
    IF NEW.status = 'accepted' AND OLD.status != 'accepted' THEN
        NEW.accepted_at = now();
    END IF;

    -- Track application timestamp
    IF NEW.status = 'applied' AND OLD.status != 'applied' THEN
        NEW.applied_at = now();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_eng_proposals_updated_at
    BEFORE UPDATE ON eng_sequence_proposals
    FOR EACH ROW
    EXECUTE FUNCTION eng_proposals_update_timestamp();

-- 4. Execution order snapshot table (for rollback capability)
CREATE TABLE IF NOT EXISTS execution_order_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_type text NOT NULL CHECK (snapshot_type IN ('before', 'after', 'rollback')),
    sd_id varchar(50) NOT NULL,
    execution_order integer,
    snapshot_run_id uuid NOT NULL,
    created_at timestamptz DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_execution_snapshots_run_id
    ON execution_order_snapshots(snapshot_run_id);
CREATE INDEX IF NOT EXISTS idx_execution_snapshots_type
    ON execution_order_snapshots(snapshot_type);

-- 5. Comments for documentation
COMMENT ON TABLE eng_sequence_proposals IS
    'WSJF-generated execution order proposals requiring review before application to production';
COMMENT ON COLUMN eng_sequence_proposals.delta IS
    'Change magnitude: positive = moving later, negative = moving earlier';
COMMENT ON COLUMN eng_sequence_proposals.status IS
    'Proposal lifecycle: proposed → accepted → applied (or rejected/stale)';

-- 6. Verification
DO $$
DECLARE
    table_exists boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'eng_sequence_proposals'
    ) INTO table_exists;

    IF table_exists THEN
        RAISE NOTICE '✅ eng_sequence_proposals table created successfully';
        RAISE NOTICE '   Ready to ingest WSJF recommendations for review';
    ELSE
        RAISE WARNING '❌ Failed to create eng_sequence_proposals table';
    END IF;
END $$;

COMMIT;

-- Migration verification
\echo '✅ Migration 2025-09-22-eng-sequence-proposals.sql completed successfully'
\echo '📊 eng_sequence_proposals table ready for WSJF proposal ingestion'
\echo '🔄 Snapshot table created for safe rollback capability'