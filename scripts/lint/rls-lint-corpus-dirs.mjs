/**
 * Single source of truth for the migration-apply directories the RLS anon/authenticated
 * tenant-predicate lint (rls-anon-tenant-predicate-lint.mjs) must scan.
 *
 * SD-LEO-FIX-RLS-LINT-CORPUS-WIDTH-001: the lint previously scanned only
 * `database/migrations/`, while the actual DDL-auto-apply writer of record
 * (scripts/modules/handoff/pre-checks/pending-migrations-check.js's own
 * `migrationDirs` / `resolveMigrationPath` dirs) applies migrations from all
 * three directories below. A non-compliant policy written to either of the
 * other two was auto-applied without ever being linted, in either advisory
 * or blocking form. This list is imported by both the lint script and by
 * tests/unit/lint/rls-lint-corpus-dirs-workflow-consistency.test.js, which
 * fails loudly if .github/workflows/rls-anon-tenant-predicate-lint.yml's
 * `paths` trigger ever drifts from it -- a GitHub Actions YAML `paths:` list
 * cannot import a JS module directly, so that test is the sync mechanism.
 */
export const RLS_LINT_CORPUS_DIRS = Object.freeze([
  'database/migrations',
  'database/manual-updates',
  'supabase/migrations',
]);
