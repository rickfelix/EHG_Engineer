-- DOWN companion for 20260720_role_drain_sets_STAGED.sql
-- (SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-B). Drops the additive role_drain_sets
-- table (policy/index drop with it). Code fail-opens back to the
-- tables-absent canary path (lib/fleet/drain-set-registry.js) — no code
-- rollback required.

BEGIN;

DROP TABLE IF EXISTS role_drain_sets;

COMMIT;
