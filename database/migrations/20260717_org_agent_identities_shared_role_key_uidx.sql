-- SD-LEO-INFRA-ORG-TEMPLATE-ARMING-001 (FR-2): idempotency guard for holdco-scoped
-- (venture_id IS NULL) EHG_SHARED_OPERATORS identity rows. Postgres treats NULL as
-- DISTINCT in the existing UNIQUE(venture_id, role_key) constraint, so two
-- venture_id=null upserts for the same role_key would not collide there -- this
-- partial unique index closes that gap for the shared/holdco layer specifically.
-- Additive-only: single bare statement, no BEGIN/COMMIT, no RLS/policy/trigger DDL.
CREATE UNIQUE INDEX IF NOT EXISTS org_agent_identities_shared_role_key_uidx ON org_agent_identities(role_key) WHERE venture_id IS NULL;
