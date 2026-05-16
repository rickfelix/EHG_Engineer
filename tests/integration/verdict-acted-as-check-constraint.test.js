import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const MIGRATION = join(REPO_ROOT, 'database', 'migrations', '20260516140001_add_verdict_acted_as_column.sql');

describe('validation_audit_log.verdict_acted_as ADD COLUMN migration', () => {
  const sql = readFileSync(MIGRATION, 'utf8');

  it('ALTER TABLE ADD COLUMN with NULL allowed (ADDITIVE-ONLY)', () => {
    expect(sql).toMatch(/ALTER\s+TABLE\s+validation_audit_log\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+verdict_acted_as\s+TEXT/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+validation_audit_log\s+ADD\s+COLUMN[^,;]*NOT\s+NULL/i);
  });

  it('CHECK constraint accepts {binding, overridden, ignored} OR NULL', () => {
    expect(sql).toMatch(/verdict_acted_as\s+IS\s+NULL\s+OR\s+verdict_acted_as\s+IN\s*\(\s*'binding',\s*'overridden',\s*'ignored'\s*\)/);
  });

  it('uses ADD CONSTRAINT IF NOT EXISTS pattern for idempotency', () => {
    expect(sql).toMatch(/IF\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+pg_constraint/i);
  });
});
