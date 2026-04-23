-- SD-PROTOCOL-LINTER-001 slice 5 corrective migration.
--
-- Slice 1's migration declared leo_lint_violations.section_id as UUID, but
-- the referenced leo_protocol_sections.id column is actually BIGINT. This
-- migration widens section_id to TEXT so IDs from any section store can be
-- referenced without type coercion at the schema level.
--
-- Safe to run: the table is empty pre-slice-5 (no violations inserted), and
-- the ALTER is idempotent because TEXT is a superset of UUID representations.

BEGIN;

ALTER TABLE leo_lint_violations
  ALTER COLUMN section_id TYPE TEXT USING section_id::TEXT;

COMMENT ON COLUMN leo_lint_violations.section_id IS
  'Free-form reference to the section this violation concerns. Stored as TEXT so callers can pass integer, UUID, or string-keyed section identifiers from any source. Nullable — rules that are dataset-wide (not section-scoped) leave this null. SD-PROTOCOL-LINTER-001.';

COMMIT;

-- Rollback (manual, for reference only — destructive if section_id already
-- contains non-UUID values):
-- BEGIN;
-- ALTER TABLE leo_lint_violations
--   ALTER COLUMN section_id TYPE UUID USING section_id::UUID;
-- COMMIT;
