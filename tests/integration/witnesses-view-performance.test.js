import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const SCOPE_MIG = join(REPO_ROOT, 'database', 'migrations', '20260516130000_add_scope_completion_chain.sql');
const LEDGER_MIG = join(REPO_ROOT, 'database', 'migrations', '20260516130001_add_bypass_ledger.sql');

describe('Sibling A witnesses VIEW performance — required indexes on underlying tables', () => {
  it('scope_completion_chain has created_at DESC index', () => {
    const sql = readFileSync(SCOPE_MIG, 'utf8');
    expect(sql).toMatch(/CREATE\s+INDEX.*scope_completion_chain.*created_at/i);
  });

  it('scope_completion_chain has (entity_type, entity_id) composite index', () => {
    const sql = readFileSync(SCOPE_MIG, 'utf8');
    expect(sql).toMatch(/CREATE\s+INDEX.*scope_completion_chain.*\(entity_type,\s*entity_id\)/i);
  });

  it('scope_completion_chain has chain_status index', () => {
    const sql = readFileSync(SCOPE_MIG, 'utf8');
    expect(sql).toMatch(/CREATE\s+INDEX.*scope_completion_chain.*chain_status/i);
  });

  it('bypass_ledger has audit_log_id index (parity-check JOIN)', () => {
    const sql = readFileSync(LEDGER_MIG, 'utf8');
    expect(sql).toMatch(/CREATE\s+INDEX.*bypass_ledger.*audit_log_id/i);
  });

  it('bypass_ledger has created_at DESC index', () => {
    const sql = readFileSync(LEDGER_MIG, 'utf8');
    expect(sql).toMatch(/CREATE\s+INDEX.*bypass_ledger.*created_at/i);
  });

  it('bypass_ledger has correlation_id index', () => {
    const sql = readFileSync(LEDGER_MIG, 'utf8');
    expect(sql).toMatch(/CREATE\s+INDEX.*bypass_ledger.*correlation_id/i);
  });
});
