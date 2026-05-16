import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const MIGRATION = join(REPO_ROOT, 'database', 'migrations', '20260516130001_add_bypass_ledger.sql');

describe('Sibling A bypass_ledger migration shape', () => {
  const sql = readFileSync(MIGRATION, 'utf8');

  it('creates table with TEXT bypass_type (NOT PostgreSQL ENUM)', () => {
    expect(sql).toMatch(/bypass_type\s+TEXT/);
    expect(sql).not.toMatch(/CREATE\s+TYPE.*AS\s+ENUM/i);
    expect(sql).not.toMatch(/bypass_type\s+\w+_enum/i);
  });

  it('has CHECK constraint length(bypass_reason) >= 20', () => {
    expect(sql).toMatch(/length\(bypass_reason\)\s*>=\s*20/);
  });

  it('has advisory trigger raising NOTICE on unknown bypass_type', () => {
    expect(sql).toContain('bypass_ledger_advisory_vocab_trigger');
    expect(sql).toContain('RAISE NOTICE');
    expect(sql).toContain('known_vocab TEXT[]');
  });

  it('RLS enabled; INSERT-only policy; no UPDATE/DELETE policies', () => {
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toMatch(/FOR\s+INSERT/i);
    expect(sql).not.toMatch(/FOR\s+(UPDATE|DELETE)/i);
  });

  it('correlation_id column with gen_random_uuid() default', () => {
    expect(sql).toMatch(/correlation_id\s+UUID\s+NOT\s+NULL\s+DEFAULT\s+gen_random_uuid/);
  });

  it('audit_log_id + audit_log_written_at columns present (for parity check)', () => {
    expect(sql).toMatch(/audit_log_id\s+UUID/);
    expect(sql).toMatch(/audit_log_written_at\s+TIMESTAMPTZ/);
  });

  it('smoke_test_passed_at + runtime_observed_at columns present (Guardrail #3)', () => {
    expect(sql).toMatch(/smoke_test_passed_at\s+TIMESTAMPTZ/);
    expect(sql).toMatch(/runtime_observed_at\s+TIMESTAMPTZ/);
  });

  it('SOFT FK on handoff_id (no FOREIGN KEY constraint)', () => {
    expect(sql).toMatch(/handoff_id\s+UUID(?!\s*REFERENCES)/);
    expect(sql).not.toMatch(/handoff_id\s+UUID\s+REFERENCES/i);
  });
});
