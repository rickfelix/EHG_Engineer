-- Add SET_IDENTITY to coordination_message_type enum
-- Used by the coordinator to assign colors and names to worker sessions
ALTER TYPE coordination_message_type ADD VALUE IF NOT EXISTS 'SET_IDENTITY';
