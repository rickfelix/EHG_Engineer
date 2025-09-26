-- Fix Retrospective Trigger System
-- Remove empty shell creation, add proper RETRO sub-agent notification
-- Date: 2025-09-24

-- ============================================================================
-- REMOVE BROKEN TRIGGER THAT CREATES EMPTY SHELLS
-- ============================================================================

-- Drop the existing broken trigger
DROP TRIGGER IF EXISTS tr_sd_completion_retrospective ON strategic_directives_v2;

-- Drop the broken trigger function
DROP FUNCTION IF EXISTS trigger_sd_completion_retrospective();

-- ============================================================================
-- NEW PROPER TRIGGER SYSTEM
-- ============================================================================

-- Create notification table for RETRO sub-agent
CREATE TABLE IF NOT EXISTS retro_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_id TEXT NOT NULL,
    notification_type TEXT NOT NULL DEFAULT 'sd_completion',
    payload JSONB DEFAULT '{}',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    error_message TEXT
);

-- Create index for efficient polling
CREATE INDEX IF NOT EXISTS idx_retro_notifications_status ON retro_notifications(status, created_at);

-- New trigger function that creates notification instead of empty shell
CREATE OR REPLACE FUNCTION trigger_retro_notification()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        -- Create notification for RETRO sub-agent instead of empty retrospective
        INSERT INTO retro_notifications (
            sd_id,
            notification_type,
            payload
        ) VALUES (
            NEW.id,
            'sd_completion',
            json_build_object(
                'sd_id', NEW.id,
                'sd_title', NEW.title,
                'completion_date', NEW.completion_date,
                'target_application', NEW.target_application,
                'action', 'generate_retrospective'
            )::jsonb
        );

        -- Log the notification
        RAISE NOTICE 'RETRO notification created for SD: %', NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the new trigger
CREATE TRIGGER tr_retro_notification
    AFTER UPDATE ON strategic_directives_v2
    FOR EACH ROW
    EXECUTE FUNCTION trigger_retro_notification();

-- ============================================================================
-- CLEANUP EXISTING EMPTY RETROSPECTIVES
-- ============================================================================

-- Mark existing empty retrospectives for cleanup
UPDATE retrospectives
SET status = 'ARCHIVED',
    description = description || ' [ARCHIVED: Empty shell from broken trigger system]'
WHERE (what_went_well = '[]'::jsonb OR what_went_well IS NULL)
  AND (what_needs_improvement = '[]'::jsonb OR what_needs_improvement IS NULL)
  AND (key_learnings = '[]'::jsonb OR key_learnings IS NULL)
  AND generated_by = 'TRIGGER';

-- ============================================================================
-- RETRO NOTIFICATION PROCESSOR FUNCTIONS
-- ============================================================================

-- Function to get pending notifications
CREATE OR REPLACE VIEW v_pending_retro_notifications AS
SELECT *
FROM retro_notifications
WHERE status = 'pending'
ORDER BY created_at ASC;

-- Function to mark notification as processing
CREATE OR REPLACE FUNCTION mark_retro_processing(notification_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE retro_notifications
    SET status = 'processing', processed_at = NOW()
    WHERE id = notification_id AND status = 'pending';

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to mark notification as completed
CREATE OR REPLACE FUNCTION mark_retro_completed(notification_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE retro_notifications
    SET status = 'completed', processed_at = NOW()
    WHERE id = notification_id AND status = 'processing';

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to mark notification as failed
CREATE OR REPLACE FUNCTION mark_retro_failed(notification_id UUID, error_msg TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE retro_notifications
    SET status = 'failed', processed_at = NOW(), error_message = error_msg
    WHERE id = notification_id AND status = 'processing';

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Show current trigger status
DO $$
BEGIN
    RAISE NOTICE 'Retrospective trigger system fixed:';
    RAISE NOTICE '- Empty shell creation trigger REMOVED';
    RAISE NOTICE '- New notification-based trigger INSTALLED';
    RAISE NOTICE '- Existing empty shells ARCHIVED';
    RAISE NOTICE '- Ready for RETRO sub-agent integration';
END;
$$;