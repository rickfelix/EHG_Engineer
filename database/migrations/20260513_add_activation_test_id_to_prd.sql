-- SD-LEO-INFRA-REQUIRE-END-END-001 / FR-1
-- Adds activation_test_id column to product_requirements_v2.
-- Backward-compatible: NULL-safe, no default, no rewrite of existing rows.
-- Read semantics: NULL means "this PRD does not ship a schema+UI+worker chain;
-- the activation-invariant gate skips this SD". Non-NULL is the relative path
-- (from repo root) to the test spec that asserts the chain works end-to-end.

ALTER TABLE product_requirements_v2
  ADD COLUMN IF NOT EXISTS activation_test_id TEXT;

COMMENT ON COLUMN product_requirements_v2.activation_test_id IS
  '@activation reference to the required end-to-end test that verifies the schema -> worker -> UI chain works against real (or migration-applied test) data. NULL when no chain ships. See SD-LEO-INFRA-REQUIRE-END-END-001 for the activation-invariant pattern.';
