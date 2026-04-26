-- Migration: add SPAWN_REQUEST to coordination_message_type enum
-- SD: SD-LEO-INFRA-COORDINATOR-WORKER-REVIVAL-001 (FR-2)
-- Purpose: enable /coordinator revive subcommands to broadcast spawn intent on the
--          existing session_coordination bus without inventing a new transport.
--
-- ALTER TYPE ADD VALUE IF NOT EXISTS is the canonical idempotent pattern;
-- sibling: 20260411_add_stop_requested_save_warning_enum.sql.

ALTER TYPE coordination_message_type ADD VALUE IF NOT EXISTS 'SPAWN_REQUEST';
