-- Migration: Self-Enhancement Engine (SD-LEO-SELF-IMPROVE-002E)
-- Phase 5 of Self-Improving LEO: Discovery, Enhancement & Safety Boundaries
--
-- Creates infrastructure for LEO-generated enhancement proposals with full lineage tracking
-- Functional Requirements: FR-1 through FR-6

-- ============================================================================
-- FR-1: Create enhancement_proposals table
-- ============================================================================

CREATE TABLE IF NOT EXISTS enhancement_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by TEXT NOT NULL DEFAULT 'leo',

    -- Proposal content
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    proposed_change JSONB NOT NULL,

    -- Source tracking (polymorphic reference)
    source_type VARCHAR(20) NOT NULL,
    source_id UUID NULL,

    -- Lifecycle status
    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    -- Metadata and timestamps
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    vetted_at TIMESTAMPTZ NULL,
    approved_at TIMESTAMPTZ NULL,
    applied_at TIMESTAMPTZ NULL,
    applied_improvement_id UUID NULL,

    -- Constraints
    CONSTRAINT enhancement_proposals_source_type_check
        CHECK (source_type IN ('finding', 'pattern', 'retrospective', 'efficiency', 'gap')),
    CONSTRAINT enhancement_proposals_status_check
        CHECK (status IN ('pending', 'vetted', 'approved', 'applied'))
);

-- Add helpful comments
COMMENT ON TABLE enhancement_proposals IS 'Stores LEO-generated enhancement proposals for protocol improvements';
COMMENT ON COLUMN enhancement_proposals.source_type IS 'Origin type: finding, pattern, retrospective, efficiency, or gap';
COMMENT ON COLUMN enhancement_proposals.proposed_change IS 'Structured JSON describing the proposed change';
COMMENT ON COLUMN enhancement_proposals.status IS 'Lifecycle: pending -> vetted -> approved -> applied';

-- Indexes for FR-1
CREATE INDEX IF NOT EXISTS idx_enhancement_proposals_source
    ON enhancement_proposals(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_enhancement_proposals_status_created
    ON enhancement_proposals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enhancement_proposals_proposed_change
    ON enhancement_proposals USING GIN (proposed_change);

-- updated_at trigger for FR-1
CREATE OR REPLACE FUNCTION fn_enhancement_proposals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enhancement_proposals_updated_at ON enhancement_proposals;
CREATE TRIGGER trg_enhancement_proposals_updated_at
    BEFORE UPDATE ON enhancement_proposals
    FOR EACH ROW
    EXECUTE FUNCTION fn_enhancement_proposals_updated_at();

-- ============================================================================
-- FR-2: Status workflow enforcement trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_enforce_proposal_status_workflow()
RETURNS TRIGGER AS $$
DECLARE
    allowed_transition BOOLEAN;
BEGIN
    -- Allow same-status updates (no transition)
    IF OLD.status = NEW.status THEN
        -- But still enforce monotonic timestamps
        IF NEW.vetted_at IS NOT NULL AND OLD.vetted_at IS NOT NULL AND NEW.vetted_at < OLD.vetted_at THEN
            RAISE EXCEPTION 'invalid_status_transition: vetted_at cannot regress';
        END IF;
        IF NEW.approved_at IS NOT NULL AND OLD.approved_at IS NOT NULL AND NEW.approved_at < OLD.approved_at THEN
            RAISE EXCEPTION 'invalid_status_transition: approved_at cannot regress';
        END IF;
        IF NEW.applied_at IS NOT NULL AND OLD.applied_at IS NOT NULL AND NEW.applied_at < OLD.applied_at THEN
            RAISE EXCEPTION 'invalid_status_transition: applied_at cannot regress';
        END IF;
        RETURN NEW;
    END IF;

    -- Check allowed transitions
    allowed_transition := (
        (OLD.status = 'pending' AND NEW.status = 'vetted') OR
        (OLD.status = 'vetted' AND NEW.status = 'approved') OR
        (OLD.status = 'approved' AND NEW.status = 'applied')
    );

    IF NOT allowed_transition THEN
        RAISE EXCEPTION 'invalid_status_transition: % -> % not allowed', OLD.status, NEW.status;
    END IF;

    -- Auto-set timestamps on transitions
    IF NEW.status = 'vetted' AND NEW.vetted_at IS NULL THEN
        NEW.vetted_at = now();
    END IF;

    IF NEW.status = 'approved' AND NEW.approved_at IS NULL THEN
        NEW.approved_at = now();
    END IF;

    IF NEW.status = 'applied' THEN
        IF NEW.applied_at IS NULL THEN
            NEW.applied_at = now();
        END IF;
        -- Require applied_improvement_id when applying
        IF NEW.applied_improvement_id IS NULL THEN
            RAISE EXCEPTION 'invalid_status_transition: applied_improvement_id required when status is applied';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_proposal_status_workflow ON enhancement_proposals;
CREATE TRIGGER trg_enforce_proposal_status_workflow
    BEFORE UPDATE ON enhancement_proposals
    FOR EACH ROW
    EXECUTE FUNCTION fn_enforce_proposal_status_workflow();

-- ============================================================================
-- FR-4: Add lineage columns to protocol_improvement_queue
-- ============================================================================

-- Add columns if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'protocol_improvement_queue' AND column_name = 'source_type'
    ) THEN
        ALTER TABLE protocol_improvement_queue ADD COLUMN source_type VARCHAR(30) NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'protocol_improvement_queue' AND column_name = 'source_id'
    ) THEN
        ALTER TABLE protocol_improvement_queue ADD COLUMN source_id UUID NULL;
    END IF;
END $$;

-- Add CHECK constraint for source_type (includes 'proposal' plus the five proposal sources plus 'feedback')
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage
        WHERE constraint_name = 'protocol_improvement_queue_source_type_check'
    ) THEN
        ALTER TABLE protocol_improvement_queue
        ADD CONSTRAINT protocol_improvement_queue_source_type_check
        CHECK (source_type IS NULL OR source_type IN (
            'proposal', 'finding', 'pattern', 'retrospective', 'efficiency', 'gap', 'feedback'
        ));
    END IF;
EXCEPTION WHEN duplicate_object THEN
    NULL; -- Constraint already exists
END $$;

-- Store migration timestamp for lineage enforcement
CREATE TABLE IF NOT EXISTS _migration_metadata (
    key TEXT PRIMARY KEY,
    value TIMESTAMPTZ NOT NULL
);

INSERT INTO _migration_metadata (key, value)
VALUES ('self_enhancement_engine_deployed_at', now())
ON CONFLICT (key) DO NOTHING;

-- Trigger to enforce lineage for new records (after migration)
CREATE OR REPLACE FUNCTION fn_enforce_improvement_lineage()
RETURNS TRIGGER AS $$
DECLARE
    migration_time TIMESTAMPTZ;
BEGIN
    -- Get migration timestamp
    SELECT value INTO migration_time
    FROM _migration_metadata
    WHERE key = 'self_enhancement_engine_deployed_at';

    -- Only enforce for records created after migration
    IF migration_time IS NOT NULL AND NEW.created_at >= migration_time THEN
        -- Both must be null or both must be non-null
        IF (NEW.source_type IS NULL) != (NEW.source_id IS NULL) THEN
            RAISE EXCEPTION 'lineage_required: source_type and source_id must both be set or both be null';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_improvement_lineage ON protocol_improvement_queue;
CREATE TRIGGER trg_enforce_improvement_lineage
    BEFORE INSERT ON protocol_improvement_queue
    FOR EACH ROW
    EXECUTE FUNCTION fn_enforce_improvement_lineage();

-- Index for lineage queries
CREATE INDEX IF NOT EXISTS idx_protocol_improvement_queue_lineage
    ON protocol_improvement_queue(source_type, source_id)
    WHERE source_type IS NOT NULL;

-- ============================================================================
-- FR-5: Create v_improvement_lineage view
-- ============================================================================

CREATE OR REPLACE VIEW v_improvement_lineage AS
SELECT
    piq.id AS improvement_id,
    piq.created_at AS improvement_created_at,
    piq.status AS improvement_status,
    piq.payload AS improvement_payload,
    piq.source_type,
    piq.source_id,
    -- Resolve source details based on type
    CASE
        WHEN piq.source_type = 'proposal' THEN ep.title
        ELSE NULL
    END AS source_title,
    CASE
        WHEN piq.source_type = 'proposal' THEN ep.description
        ELSE NULL
    END AS source_description,
    CASE
        WHEN piq.source_type = 'proposal' THEN ep.created_at
        ELSE NULL
    END AS source_created_at
FROM protocol_improvement_queue piq
LEFT JOIN enhancement_proposals ep
    ON piq.source_type = 'proposal' AND piq.source_id = ep.id;

COMMENT ON VIEW v_improvement_lineage IS 'Unified view resolving polymorphic lineage for protocol improvements';

-- Grant access to application roles
GRANT SELECT ON v_improvement_lineage TO authenticated;
GRANT SELECT ON v_improvement_lineage TO service_role;

-- ============================================================================
-- RLS Policies for enhancement_proposals
-- ============================================================================

ALTER TABLE enhancement_proposals ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all proposals
CREATE POLICY "authenticated_select_enhancement_proposals"
    ON enhancement_proposals FOR SELECT
    TO authenticated
    USING (true);

-- Allow service_role full access
CREATE POLICY "service_role_all_enhancement_proposals"
    ON enhancement_proposals FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- FR-6: Audit table for proposal transitions (if no existing audit mechanism)
-- ============================================================================

CREATE TABLE IF NOT EXISTS enhancement_proposal_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID NOT NULL REFERENCES enhancement_proposals(id),
    actor_id UUID NULL,
    from_status VARCHAR(20) NOT NULL,
    to_status VARCHAR(20) NOT NULL,
    request_id UUID NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enhancement_proposal_audit_proposal
    ON enhancement_proposal_audit(proposal_id, created_at DESC);

ALTER TABLE enhancement_proposal_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_enhancement_proposal_audit"
    ON enhancement_proposal_audit FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "service_role_all_enhancement_proposal_audit"
    ON enhancement_proposal_audit FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- Verification queries (run after migration)
-- ============================================================================

-- Test: enhancement_proposals table exists with correct columns
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'enhancement_proposals' ORDER BY ordinal_position;

-- Test: source_type constraint works
-- INSERT INTO enhancement_proposals (title, description, source_type, proposed_change)
-- VALUES ('test', 'test', 'invalid', '{}'); -- Should fail

-- Test: status workflow - invalid transition
-- INSERT INTO enhancement_proposals (title, description, source_type, proposed_change)
-- VALUES ('test', 'test', 'finding', '{}') RETURNING id;
-- UPDATE enhancement_proposals SET status = 'applied' WHERE title = 'test'; -- Should fail

-- Test: v_improvement_lineage view works
-- SELECT * FROM v_improvement_lineage LIMIT 5;
