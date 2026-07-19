-- DOWN companion for 20260719_coordinator_succession_STAGED.sql
-- (SD-LEO-INFRA-COORDINATOR-SUCCESSION-PROTOCOL-001). Drops the two additive
-- succession tables (policies/indexes drop with them). Code fail-opens back to
-- the tables-absent canary path — no code rollback required.

BEGIN;

DROP TABLE IF EXISTS coordinator_follow_ons;
DROP TABLE IF EXISTS coordinator_role_history;

COMMIT;
