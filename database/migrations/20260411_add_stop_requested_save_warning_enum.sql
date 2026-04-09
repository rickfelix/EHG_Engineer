-- Migration: add STOP_REQUESTED and SAVE_WARNING to coordination_message_type enum
-- SD: SD-MULTISESSION-EXECUTION-TEAM-COMMAND-ORCH-001-C (Phase 3 of /execute)
-- Source: ARCH-EXECUTE-COMMAND-001 § API Surface > Coordination messages
--
-- These two new enum values support graceful shutdown:
--   - STOP_REQUESTED: chairman → worker, "exit cleanly between SDs"
--   - SAVE_WARNING:   chairman → worker, "commit WIP via git stash before exit"
--
-- ALTER TYPE ADD VALUE is non-transactional in older Postgres versions but
-- safe and idempotent. We use IF NOT EXISTS to be defensive.

ALTER TYPE coordination_message_type ADD VALUE IF NOT EXISTS 'STOP_REQUESTED';
ALTER TYPE coordination_message_type ADD VALUE IF NOT EXISTS 'SAVE_WARNING';
