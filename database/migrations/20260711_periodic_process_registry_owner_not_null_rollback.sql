-- Rollback for 20260711_periodic_process_registry_owner_not_null.sql
-- (SD-LEO-INFRA-OPERATIVE-AGENT-OWNERSHIP-001-A, FR-4 rollback plan).
-- Drops the constraint only; backfilled owner values remain (harmless).

ALTER TABLE periodic_process_registry
  ALTER COLUMN owner DROP NOT NULL;
