-- Add COACHING and IDENTITY_COLLISION to coordination_message_type enum
-- COACHING: periodic guidance messages from coordinator to active workers
-- IDENTITY_COLLISION: already used by sweep but never formally added

ALTER TYPE coordination_message_type ADD VALUE IF NOT EXISTS 'COACHING';
ALTER TYPE coordination_message_type ADD VALUE IF NOT EXISTS 'IDENTITY_COLLISION';
