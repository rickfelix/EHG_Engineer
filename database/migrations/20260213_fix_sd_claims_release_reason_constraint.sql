-- Fix sd_claims.release_reason CHECK constraint
-- RCA: create_or_replace_session RPC uses 'AUTO_REPLACED' and cleanup_stale_sessions
-- uses 'STALE_CLEANUP', but the CHECK constraint only allows 5 values.
-- This causes the RPC to fail silently, creating ghost sessions that trigger FK violations.

-- Drop the existing constraint
ALTER TABLE sd_claims DROP CONSTRAINT IF EXISTS sd_claims_release_reason_check;

-- Re-create with all valid values including those used by RPC functions
ALTER TABLE sd_claims ADD CONSTRAINT sd_claims_release_reason_check
  CHECK (release_reason IN ('completed', 'timeout', 'manual', 'conflict', 'session_ended', 'AUTO_REPLACED', 'STALE_CLEANUP'));
