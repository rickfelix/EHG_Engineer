-- Add CLAIM_REMINDER and STALE_WARNING to coordination_message_type enum
-- CLAIM_REMINDER: sent to idle sessions that have no SD claim
-- STALE_WARNING: sent to sessions approaching stale threshold

ALTER TYPE coordination_message_type ADD VALUE IF NOT EXISTS 'CLAIM_REMINDER';
ALTER TYPE coordination_message_type ADD VALUE IF NOT EXISTS 'STALE_WARNING';
