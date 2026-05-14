-- SD-LEO-INFRA-REQUIRE-END-END-001 / FR-3
-- Side table that declares "this SD ships a catalog/registry table that MUST
-- be seeded post-migration". The CI guard (scripts/check-activation-catalog.mjs)
-- reads rows here and asserts `SELECT COUNT(*) > 0` against each declared table.
-- One row per (sd_id, table_name) pair; FK CASCADE so cleanup is automatic when
-- an SD is hard-deleted.
--
-- NOTE: strategic_directives_v2.id is varchar(50) (not uuid) — sd_id mirrors that
-- type. Project convention: `id` column stores UUID-formatted strings as varchar.

CREATE TABLE IF NOT EXISTS activation_catalog_expectations (
  sd_id varchar(50) NOT NULL REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
  table_name text NOT NULL,
  seed_migration_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  PRIMARY KEY (sd_id, table_name)
);

CREATE INDEX IF NOT EXISTS idx_activation_catalog_expectations_table
  ON activation_catalog_expectations(table_name);

ALTER TABLE activation_catalog_expectations ENABLE ROW LEVEL SECURITY;

-- Service role can read/write (mirrors strategic_directives_v2 pattern).
DROP POLICY IF EXISTS "service_role_write_activation_catalog" ON activation_catalog_expectations;
CREATE POLICY "service_role_write_activation_catalog"
  ON activation_catalog_expectations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read (CI guard / audit utility need this).
DROP POLICY IF EXISTS "authenticated_read_activation_catalog" ON activation_catalog_expectations;
CREATE POLICY "authenticated_read_activation_catalog"
  ON activation_catalog_expectations
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE activation_catalog_expectations IS
  'Declares catalog/registry tables an SD expects to be seeded. CI guard asserts COUNT(*) > 0 post-migration. See SD-LEO-INFRA-REQUIRE-END-END-001 / FR-3.';
COMMENT ON COLUMN activation_catalog_expectations.sd_id IS 'FK to strategic_directives_v2.id (CASCADE on delete). Type=varchar(50) to match PK.';
COMMENT ON COLUMN activation_catalog_expectations.table_name IS 'Catalog/registry table that must be non-empty after migration';
COMMENT ON COLUMN activation_catalog_expectations.seed_migration_path IS 'Relative path to the seed migration script (reported in CI failure for actionable remediation)';
