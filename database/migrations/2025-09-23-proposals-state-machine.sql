-- ============================================================================
-- SD-GOVERNANCE-001 Phase 2: Proposals Management System
-- PRD: a57d5700-c3f3-4b13-8ff9-ba572ea34a74
-- State Machine Design Document
-- Created: 2025-09-23
-- Agent: PLAN
-- ============================================================================

-- Proposal States:
-- draft -> submitted -> under_review -> approved/rejected -> implemented/archived

-- ============================================================================
-- Core Proposals Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS governance_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_key VARCHAR(100) UNIQUE NOT NULL,

    -- Proposal Details
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    proposal_type VARCHAR(50) NOT NULL CHECK (proposal_type IN (
        'strategic_directive', 'product_requirement', 'technical_change',
        'process_improvement', 'policy_update', 'resource_request'
    )),

    -- State Machine
    current_state VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (current_state IN (
        'draft', 'submitted', 'under_review', 'in_approval',
        'approved', 'rejected', 'implementing', 'implemented',
        'archived', 'withdrawn'
    )),
    previous_state VARCHAR(50),

    -- Relationships
    sd_id VARCHAR(50) REFERENCES strategic_directives_v2(id),
    prd_id VARCHAR(100) REFERENCES product_requirements_v2(id),
    parent_proposal_id UUID REFERENCES governance_proposals(id),

    -- Submitter Information
    submitted_by VARCHAR(100) NOT NULL,
    submitted_at TIMESTAMP,
    submitter_role VARCHAR(50),
    submitter_rationale TEXT,

    -- Approval Workflow
    approval_required_from JSONB DEFAULT '[]'::jsonb, -- Array of roles/users
    approvals_received JSONB DEFAULT '[]'::jsonb, -- Array of approval records
    approval_threshold INTEGER DEFAULT 1,
    rejection_reason TEXT,

    -- Priority and Timing
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    urgency_score INTEGER CHECK (urgency_score BETWEEN 1 AND 10),
    due_date DATE,

    -- Stale Detection
    last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    stale_flagged_at TIMESTAMP,
    stale_notification_sent BOOLEAN DEFAULT false,

    -- Implementation Details
    implementation_plan TEXT,
    estimated_effort_hours INTEGER,
    actual_effort_hours INTEGER,
    implementation_notes TEXT,

    -- Metadata
    tags TEXT[],
    category VARCHAR(100),
    impact_assessment JSONB,
    risk_assessment JSONB,

    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) DEFAULT 'SYSTEM',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(100),
    completed_at TIMESTAMP,
    completed_by VARCHAR(100),

    -- Constraints
    CONSTRAINT valid_proposal_key CHECK (proposal_key ~ '^PROP-[0-9]{4}-[0-9]{6}$')
);

-- Indexes for performance
CREATE INDEX idx_proposals_state ON governance_proposals(current_state);
CREATE INDEX idx_proposals_priority ON governance_proposals(priority);
CREATE INDEX idx_proposals_submitted_at ON governance_proposals(submitted_at DESC);
CREATE INDEX idx_proposals_last_activity ON governance_proposals(last_activity_at);
CREATE INDEX idx_proposals_stale ON governance_proposals(stale_flagged_at) WHERE stale_flagged_at IS NOT NULL;

-- ============================================================================
-- Approval Workflow Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS proposal_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID NOT NULL REFERENCES governance_proposals(id) ON DELETE CASCADE,

    -- Approver Details
    approver_id VARCHAR(100) NOT NULL,
    approver_role VARCHAR(50) NOT NULL,
    approval_level INTEGER DEFAULT 1,

    -- Decision
    decision VARCHAR(20) NOT NULL CHECK (decision IN ('approved', 'rejected', 'abstain', 'request_info')),
    decision_reason TEXT,
    conditions TEXT,

    -- Timestamps
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    decided_at TIMESTAMP,
    reminder_sent_at TIMESTAMP,
    escalated_at TIMESTAMP,

    -- Metadata
    comments TEXT,
    attachments JSONB,

    UNIQUE(proposal_id, approver_id)
);

CREATE INDEX idx_approvals_proposal ON proposal_approvals(proposal_id);
CREATE INDEX idx_approvals_pending ON proposal_approvals(decided_at) WHERE decided_at IS NULL;

-- ============================================================================
-- State Transition Log
-- ============================================================================

CREATE TABLE IF NOT EXISTS proposal_state_transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID NOT NULL REFERENCES governance_proposals(id) ON DELETE CASCADE,

    from_state VARCHAR(50) NOT NULL,
    to_state VARCHAR(50) NOT NULL,
    transition_reason TEXT,

    triggered_by VARCHAR(100) NOT NULL,
    triggered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_transitions_proposal ON proposal_state_transitions(proposal_id);
CREATE INDEX idx_transitions_timestamp ON proposal_state_transitions(triggered_at DESC);

-- ============================================================================
-- Notification Queue
-- ============================================================================

CREATE TABLE IF NOT EXISTS proposal_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID NOT NULL REFERENCES governance_proposals(id) ON DELETE CASCADE,

    -- Notification Details
    notification_type VARCHAR(50) NOT NULL CHECK (notification_type IN (
        'submission', 'approval_request', 'approval_received', 'rejection',
        'state_change', 'stale_warning', 'reminder', 'escalation'
    )),

    -- Recipients
    recipient_id VARCHAR(100) NOT NULL,
    recipient_email VARCHAR(255),
    recipient_role VARCHAR(50),

    -- Content
    subject VARCHAR(500) NOT NULL,
    body TEXT NOT NULL,
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('urgent', 'high', 'normal', 'low')),

    -- Delivery Status
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    failed_at TIMESTAMP,
    retry_count INTEGER DEFAULT 0,
    error_message TEXT,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    scheduled_for TIMESTAMP,
    expires_at TIMESTAMP
);

CREATE INDEX idx_notifications_pending ON proposal_notifications(status) WHERE status = 'pending';
CREATE INDEX idx_notifications_scheduled ON proposal_notifications(scheduled_for) WHERE scheduled_for IS NOT NULL;

-- ============================================================================
-- State Machine Functions
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_proposal_state_transition(
    p_proposal_id UUID,
    p_new_state VARCHAR(50),
    p_user_role VARCHAR(50)
) RETURNS BOOLEAN AS $$
DECLARE
    v_current_state VARCHAR(50);
    v_is_valid BOOLEAN := false;
BEGIN
    SELECT current_state INTO v_current_state
    FROM governance_proposals
    WHERE id = p_proposal_id;

    -- Define valid transitions
    v_is_valid := CASE
        WHEN v_current_state = 'draft' AND p_new_state = 'submitted' THEN true
        WHEN v_current_state = 'submitted' AND p_new_state IN ('under_review', 'withdrawn') THEN true
        WHEN v_current_state = 'under_review' AND p_new_state IN ('in_approval', 'rejected', 'withdrawn') THEN true
        WHEN v_current_state = 'in_approval' AND p_new_state IN ('approved', 'rejected') THEN true
        WHEN v_current_state = 'approved' AND p_new_state IN ('implementing', 'archived') THEN true
        WHEN v_current_state = 'implementing' AND p_new_state IN ('implemented', 'archived') THEN true
        WHEN v_current_state = 'rejected' AND p_new_state IN ('draft', 'archived') THEN true
        ELSE false
    END;

    -- Role-based validation could be added here

    RETURN v_is_valid;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Trigger for State Changes
-- ============================================================================

CREATE OR REPLACE FUNCTION proposal_state_change_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.current_state IS DISTINCT FROM NEW.current_state THEN
        -- Log the transition
        INSERT INTO proposal_state_transitions (
            proposal_id, from_state, to_state, triggered_by
        ) VALUES (
            NEW.id, OLD.current_state, NEW.current_state, NEW.updated_by
        );

        -- Update last activity
        NEW.last_activity_at = CURRENT_TIMESTAMP;

        -- Create notifications based on state change
        IF NEW.current_state = 'submitted' THEN
            INSERT INTO proposal_notifications (
                proposal_id, notification_type, recipient_role,
                subject, body
            ) VALUES (
                NEW.id, 'submission', 'LEAD',
                'New Proposal: ' || NEW.title,
                'A new proposal has been submitted for review.'
            );
        ELSIF NEW.current_state = 'approved' THEN
            INSERT INTO proposal_notifications (
                proposal_id, notification_type, recipient_id,
                subject, body
            ) VALUES (
                NEW.id, 'approval_received', NEW.submitted_by,
                'Proposal Approved: ' || NEW.title,
                'Your proposal has been approved and will proceed to implementation.'
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_proposal_state_change
    BEFORE UPDATE ON governance_proposals
    FOR EACH ROW
    EXECUTE FUNCTION proposal_state_change_trigger();

-- ============================================================================
-- Stale Detection Function
-- ============================================================================

CREATE OR REPLACE FUNCTION detect_stale_proposals()
RETURNS void AS $$
BEGIN
    -- Flag proposals with no activity for 30 days
    UPDATE governance_proposals
    SET
        stale_flagged_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE
        current_state IN ('submitted', 'under_review', 'in_approval')
        AND last_activity_at < CURRENT_TIMESTAMP - INTERVAL '30 days'
        AND stale_flagged_at IS NULL;

    -- Create notifications for newly flagged proposals
    INSERT INTO proposal_notifications (
        proposal_id, notification_type, recipient_id,
        subject, body, priority
    )
    SELECT
        id, 'stale_warning', submitted_by,
        'Stale Proposal Alert: ' || title,
        'This proposal has been inactive for 30 days and requires attention.',
        'high'
    FROM governance_proposals
    WHERE
        stale_flagged_at >= CURRENT_TIMESTAMP - INTERVAL '1 minute'
        AND stale_notification_sent = false;

    -- Mark notifications as sent
    UPDATE governance_proposals
    SET stale_notification_sent = true
    WHERE
        stale_flagged_at >= CURRENT_TIMESTAMP - INTERVAL '1 minute'
        AND stale_notification_sent = false;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Bulk Operations Support
-- ============================================================================

CREATE OR REPLACE FUNCTION bulk_approve_proposals(
    p_proposal_ids UUID[],
    p_approver_id VARCHAR(100),
    p_approver_role VARCHAR(50),
    p_reason TEXT DEFAULT NULL
) RETURNS TABLE(proposal_id UUID, success BOOLEAN, message TEXT) AS $$
DECLARE
    v_proposal_id UUID;
    v_current_state VARCHAR(50);
BEGIN
    FOREACH v_proposal_id IN ARRAY p_proposal_ids LOOP
        BEGIN
            -- Get current state
            SELECT current_state INTO v_current_state
            FROM governance_proposals
            WHERE id = v_proposal_id;

            -- Validate state allows approval
            IF v_current_state = 'in_approval' THEN
                -- Record approval
                INSERT INTO proposal_approvals (
                    proposal_id, approver_id, approver_role,
                    decision, decision_reason, decided_at
                ) VALUES (
                    v_proposal_id, p_approver_id, p_approver_role,
                    'approved', p_reason, CURRENT_TIMESTAMP
                )
                ON CONFLICT (proposal_id, approver_id)
                DO UPDATE SET
                    decision = 'approved',
                    decision_reason = p_reason,
                    decided_at = CURRENT_TIMESTAMP;

                -- Update proposal state
                UPDATE governance_proposals
                SET
                    current_state = 'approved',
                    previous_state = v_current_state,
                    updated_by = p_approver_id,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = v_proposal_id;

                RETURN QUERY SELECT v_proposal_id, true, 'Approved successfully';
            ELSE
                RETURN QUERY SELECT v_proposal_id, false, 'Invalid state for approval: ' || v_current_state;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RETURN QUERY SELECT v_proposal_id, false, SQLERRM;
        END;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Notification Processing Function
-- ============================================================================

CREATE OR REPLACE FUNCTION process_pending_notifications()
RETURNS INTEGER AS $$
DECLARE
    v_processed_count INTEGER := 0;
BEGIN
    -- This would integrate with actual notification service
    -- For now, just mark as sent
    UPDATE proposal_notifications
    SET
        status = 'sent',
        sent_at = CURRENT_TIMESTAMP
    WHERE
        status = 'pending'
        AND (scheduled_for IS NULL OR scheduled_for <= CURRENT_TIMESTAMP);

    GET DIAGNOSTICS v_processed_count = ROW_COUNT;

    RETURN v_processed_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Create pg_cron job for stale detection (if pg_cron is available)
-- ============================================================================

-- Note: Uncomment if pg_cron extension is available
-- SELECT cron.schedule('detect-stale-proposals', '0 */6 * * *', 'SELECT detect_stale_proposals();');
-- SELECT cron.schedule('process-notifications', '*/5 * * * *', 'SELECT process_pending_notifications();');

-- ============================================================================
-- Sample Data for Testing
-- ============================================================================

-- Insert sample proposal for testing
INSERT INTO governance_proposals (
    proposal_key,
    title,
    description,
    proposal_type,
    submitted_by,
    priority
) VALUES (
    'PROP-2025-000001',
    'Test Proposal for System Validation',
    'This is a test proposal to validate the workflow system',
    'process_improvement',
    'SYSTEM',
    'low'
) ON CONFLICT (proposal_key) DO NOTHING;

-- ============================================================================
-- Grants and Permissions
-- ============================================================================

-- GRANT SELECT, INSERT, UPDATE ON governance_proposals TO authenticated;
-- GRANT SELECT, INSERT ON proposal_approvals TO authenticated;
-- GRANT SELECT ON proposal_state_transitions TO authenticated;
-- GRANT SELECT, INSERT ON proposal_notifications TO authenticated;

-- ============================================================================
-- Migration Complete
-- ============================================================================