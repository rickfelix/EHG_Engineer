import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const MIGRATION = join(REPO_ROOT, 'database', 'migrations', '20260516150000_add_contract_chain_links.sql');

describe('contract_chain_links migration shape', () => {
  const sql = readFileSync(MIGRATION, 'utf8');

  it('CREATE TABLE with all required columns', () => {
    expect(sql).toMatch(/parent_contract_type\s+TEXT\s+NOT\s+NULL/);
    expect(sql).toMatch(/parent_contract_id\s+UUID\s+NOT\s+NULL/);
    expect(sql).toMatch(/child_contract_type\s+TEXT\s+NOT\s+NULL/);
    expect(sql).toMatch(/child_contract_id\s+UUID\s+NOT\s+NULL/);
    expect(sql).toMatch(/link_type\s+TEXT\s+NOT\s+NULL/);
    expect(sql).toMatch(/link_status\s+TEXT\s+NOT\s+NULL/);
    expect(sql).toMatch(/correlation_id\s+UUID/);
    expect(sql).toMatch(/schema_version\s+TEXT\s+NOT\s+NULL/);
    expect(sql).toMatch(/vocabulary_version\s+TEXT\s+NOT\s+NULL/);
    expect(sql).toMatch(/smoke_test_passed_at\s+TIMESTAMPTZ/);
    expect(sql).toMatch(/runtime_observed_at\s+TIMESTAMPTZ/);
  });

  it('CHECK constraints on parent_contract_type / child_contract_type / link_type / link_status', () => {
    expect(sql).toMatch(/parent_contract_type\s+IN\s*\(/i);
    expect(sql).toMatch(/child_contract_type\s+IN\s*\(/i);
    expect(sql).toMatch(/link_type\s+IN\s*\(/i);
    expect(sql).toMatch(/link_status\s+IN\s*\(/i);
  });

  it('RLS enabled; INSERT-only', () => {
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toMatch(/FOR\s+INSERT/i);
    expect(sql).not.toMatch(/FOR\s+(UPDATE|DELETE)\s+TO/i);
  });

  it('Soft FK (no FOREIGN KEY constraint)', () => {
    expect(sql).not.toMatch(/REFERENCES\s+\w+\s*\(/i);
  });

  it('4 indexes present', () => {
    expect(sql).toMatch(/INDEX.*contract_chain_links.*parent/i);
    expect(sql).toMatch(/INDEX.*contract_chain_links.*child/i);
    expect(sql).toMatch(/INDEX.*contract_chain_links.*status/i);
    expect(sql).toMatch(/INDEX.*contract_chain_links.*correlation/i);
  });
});
