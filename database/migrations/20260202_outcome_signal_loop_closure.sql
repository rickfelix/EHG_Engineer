-- Migration: Phase 6 - Outcome Signal & Loop Closure
-- SD: SD-LEO-SELF-IMPROVE-002F
-- Purpose: Enable tracking of improvement outcomes and close the feedback loop
-- Date: 2026-02-02

-- ============================================================
-- US-001: Add outcome_signal and loop_closed_at to enhancement_proposals
-- ============================================================

-- Add outcome_signal column (success/failure/partial)
ALTER TABLE enhancement_proposals
ADD COLUMN IF NOT EXISTS outcome_signal VARCHAR(20) NULL;

-- Add constraint for valid outcome values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'enhancement_proposals_outcome_signal_check'
    ) THEN
        ALTER TABLE enhancement_proposals
        ADD CONSTRAINT enhancement_proposals_outcome_signal_check
        CHECK (outcome_signal IS NULL OR outcome_signal IN ('success', 'failure', 'partial'));
    END IF;
END $$;

-- Add loop_closed_at timestamp
ALTER TABLE enhancement_proposals
ADD COLUMN IF NOT EXISTS loop_closed_at TIMESTAMP WITH TIME ZONE NULL;

-- Add outcome_details for additional context
ALTER TABLE enhancement_proposals
ADD COLUMN IF NOT EXISTS outcome_details JSONB NULL;

-- Create trigger to auto-set loop_closed_at when outcome_signal is set
CREATE OR REPLACE FUNCTION fn_auto_set_loop_closed_at()
RETURNS TRIGGER AS $$
BEGIN
    -- If outcome_signal is being set for the first time (was NULL, now has value)
    IF OLD.outcome_signal IS NULL AND NEW.outcome_signal IS NOT NULL THEN
        NEW.loop_closed_at := COALESCE(NEW.loop_closed_at, NOW());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_auto_set_loop_closed_at ON enhancement_proposals;
CREATE TRIGGER tr_auto_set_loop_closed_at
    BEFORE UPDATE ON enhancement_proposals
    FOR EACH ROW
    EXECUTE FUNCTION fn_auto_set_loop_closed_at();

-- ============================================================
-- US-002: Synchronize outcome_signal between tables
-- ============================================================

-- Add outcome columns to protocol_improvement_queue if not exists
ALTER TABLE protocol_improvement_queue
ADD COLUMN IF NOT EXISTS outcome_signal VARCHAR(20) NULL;

ALTER TABLE protocol_improvement_queue
ADD COLUMN IF NOT EXISTS loop_closed_at TIMESTAMP WITH TIME ZONE NULL;

ALTER TABLE protocol_improvement_queue
ADD COLUMN IF NOT EXISTS outcome_details JSONB NULL;

-- Add constraint for valid outcome values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'piq_outcome_signal_check'
    ) THEN
        ALTER TABLE protocol_improvement_queue
        ADD CONSTRAINT piq_outcome_signal_check
        CHECK (outcome_signal IS NULL OR outcome_signal IN ('success', 'failure', 'partial'));
    END IF;
END $$;

-- Sync trigger from enhancement_proposals to protocol_improvement_queue
CREATE OR REPLACE FUNCTION fn_sync_outcome_to_piq()
RETURNS TRIGGER AS $$
BEGIN
    -- Only sync if source columns exist in protocol_improvement_queue
    IF NEW.source_type IS NOT NULL AND NEW.source_id IS NOT NULL THEN
        -- Sync outcome to PIQ entries that came from this proposal
        UPDATE protocol_improvement_queue
        SET
            outcome_signal = NEW.outcome_signal,
            loop_closed_at = NEW.loop_closed_at,
            outcome_details = NEW.outcome_details
        WHERE source_type = 'proposal'
          AND source_id = NEW.id
          AND (outcome_signal IS DISTINCT FROM NEW.outcome_signal
               OR loop_closed_at IS DISTINCT FROM NEW.loop_closed_at);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_sync_outcome_to_piq ON enhancement_proposals;
CREATE TRIGGER tr_sync_outcome_to_piq
    AFTER UPDATE OF outcome_signal, loop_closed_at, outcome_details ON enhancement_proposals
    FOR EACH ROW
    WHEN (NEW.status = 'applied')
    EXECUTE FUNCTION fn_sync_outcome_to_piq();

-- ============================================================
-- US-003: Create v_improvement_lineage view for traceability
-- ============================================================

-- Drop existing view if exists (allows recreation)
DROP VIEW IF EXISTS v_improvement_lineage;

-- Create comprehensive lineage view
CREATE VIEW v_improvement_lineage AS
SELECT
    -- Proposal info
    ep.id AS proposal_id,
    ep.source_type AS proposal_source_type,
    ep.source_id AS proposal_source_id,
    ep.proposed_change,
    ep.rationale,
    ep.status AS proposal_status,
    ep.created_at AS proposal_created_at,
    ep.applied_at AS proposal_applied_at,

    -- Outcome info
    ep.outcome_signal,
    ep.loop_closed_at,
    ep.outcome_details,

    -- Derived metrics
    CASE
        WHEN ep.loop_closed_at IS NOT NULL AND ep.applied_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (ep.loop_closed_at - ep.applied_at)) / 86400.0
        ELSE NULL
    END AS days_to_closure,

    -- Loop status
    CASE
        WHEN ep.outcome_signal IS NOT NULL THEN 'closed'
        WHEN ep.status = 'applied' THEN 'awaiting_outcome'
        WHEN ep.status IN ('pending', 'vetted', 'approved') THEN 'in_progress'
        ELSE 'unknown'
    END AS loop_status,

    -- Related PIQ entry (if exists)
    piq.id AS piq_id,
    piq.category AS piq_category,
    piq.payload AS piq_payload,
    piq.status AS piq_status,

    -- Source details (polymorphic lookup)
    CASE ep.source_type
        WHEN 'finding' THEN (SELECT title FROM audit_findings WHERE id = ep.source_id)
        WHEN 'pattern' THEN (SELECT pattern_type FROM issue_patterns WHERE id = ep.source_id)
        WHEN 'retrospective' THEN (SELECT title FROM retrospectives WHERE id = ep.source_id)
        ELSE NULL
    END AS source_title

FROM enhancement_proposals ep
LEFT JOIN protocol_improvement_queue piq
    ON piq.source_type = 'proposal'
   AND piq.source_id = ep.id;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_ep_outcome_signal ON enhancement_proposals(outcome_signal);
CREATE INDEX IF NOT EXISTS idx_ep_loop_closed_at ON enhancement_proposals(loop_closed_at);
CREATE INDEX IF NOT EXISTS idx_piq_source ON protocol_improvement_queue(source_type, source_id);

-- ============================================================
-- US-004: Auto-create discovery record for failed outcomes
-- ============================================================

CREATE OR REPLACE FUNCTION fn_create_discovery_for_failure()
RETURNS TRIGGER AS $$
DECLARE
    v_discovery_id UUID;
BEGIN
    -- Only trigger on failure outcomes
    IF NEW.outcome_signal = 'failure' AND OLD.outcome_signal IS DISTINCT FROM 'failure' THEN
        -- Check if discovery already exists for this proposal
        SELECT id INTO v_discovery_id
        FROM audit_findings
        WHERE source_type = 'failed_proposal'
          AND source_id = NEW.id::TEXT
        LIMIT 1;

        -- Only create if not exists (idempotent)
        IF v_discovery_id IS NULL THEN
            INSERT INTO audit_findings (
                id,
                title,
                description,
                severity,
                source_type,
                source_id,
                status,
                created_at,
                metadata
            ) VALUES (
                gen_random_uuid(),
                'Failed Improvement: ' || COALESCE((NEW.proposed_change->>'title')::TEXT, 'Unknown'),
                'Improvement proposal failed to deliver expected value. ' ||
                COALESCE((NEW.outcome_details->>'failure_reason')::TEXT, 'No failure reason provided.'),
                'medium',
                'failed_proposal',
                NEW.id::TEXT,
                'open',
                NOW(),
                jsonb_build_object(
                    'original_proposal_id', NEW.id,
                    'original_source_type', NEW.source_type,
                    'original_source_id', NEW.source_id,
                    'applied_at', NEW.applied_at,
                    'loop_closed_at', NEW.loop_closed_at,
                    'auto_generated', true
                )
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_create_discovery_for_failure ON enhancement_proposals;
CREATE TRIGGER tr_create_discovery_for_failure
    AFTER UPDATE OF outcome_signal ON enhancement_proposals
    FOR EACH ROW
    EXECUTE FUNCTION fn_create_discovery_for_failure();

-- ============================================================
-- US-005: KPI Queries (as functions for easy access)
-- ============================================================

-- Function to get outcome capture rate (within 7 days)
CREATE OR REPLACE FUNCTION fn_get_outcome_capture_rate(p_days_lookback INTEGER DEFAULT 30)
RETURNS TABLE(
    total_applied INTEGER,
    outcomes_recorded INTEGER,
    capture_rate NUMERIC,
    avg_days_to_capture NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::INTEGER AS total_applied,
        COUNT(outcome_signal)::INTEGER AS outcomes_recorded,
        ROUND(COUNT(outcome_signal)::NUMERIC / NULLIF(COUNT(*), 0) * 100, 2) AS capture_rate,
        ROUND(AVG(
            CASE
                WHEN loop_closed_at IS NOT NULL AND applied_at IS NOT NULL
                THEN EXTRACT(EPOCH FROM (loop_closed_at - applied_at)) / 86400.0
                ELSE NULL
            END
        )::NUMERIC, 2) AS avg_days_to_capture
    FROM enhancement_proposals
    WHERE status = 'applied'
      AND applied_at >= NOW() - (p_days_lookback || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- Function to get loop closure compliance
CREATE OR REPLACE FUNCTION fn_get_loop_closure_compliance()
RETURNS TABLE(
    outcome_type VARCHAR(20),
    count INTEGER,
    percentage NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(ep.outcome_signal, 'pending')::VARCHAR(20) AS outcome_type,
        COUNT(*)::INTEGER AS count,
        ROUND(COUNT(*)::NUMERIC / NULLIF(SUM(COUNT(*)) OVER(), 0) * 100, 2) AS percentage
    FROM enhancement_proposals ep
    WHERE status = 'applied'
    GROUP BY COALESCE(ep.outcome_signal, 'pending')
    ORDER BY count DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Grant permissions
-- ============================================================

-- RLS policies for enhancement_proposals (if not already set)
-- Note: Assumes RLS is already enabled on enhancement_proposals from Phase 5

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION fn_get_outcome_capture_rate(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_get_loop_closure_compliance() TO authenticated;

-- Grant select on view
GRANT SELECT ON v_improvement_lineage TO authenticated;

-- ============================================================
-- Verification queries (for smoke testing)
-- ============================================================
COMMENT ON VIEW v_improvement_lineage IS
'Provides end-to-end traceability from improvement proposal to outcome.
Smoke test:
1. SELECT * FROM v_improvement_lineage LIMIT 5;
2. SELECT * FROM fn_get_outcome_capture_rate(30);
3. SELECT * FROM fn_get_loop_closure_compliance();';

-- Success marker
DO $$
BEGIN
    RAISE NOTICE 'Migration 20260202_outcome_signal_loop_closure.sql completed successfully';
END $$;
