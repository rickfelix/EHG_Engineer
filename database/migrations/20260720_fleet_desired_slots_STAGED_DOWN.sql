-- DOWN companion for 20260720_fleet_desired_slots_STAGED.sql
-- (SD-LEO-INFRA-LEO-COMPLETION-001-D FR-1). Drops the additive desired-state slot
-- table (its policy + index drop with it). Code fail-softs back to the tables-absent
-- canary path (loadDesiredSlots returns []) — no code rollback required.

BEGIN;

DROP TABLE IF EXISTS fleet_desired_slots;

COMMIT;
