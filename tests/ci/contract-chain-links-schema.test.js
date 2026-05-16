import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const MIGRATION = join(REPO_ROOT, 'database', 'migrations', '20260516150000_add_contract_chain_links.sql');

describe('contract_chain_links additive-only schema compliance', () => {
  it('migration file exists', () => {
    expect(existsSync(MIGRATION)).toBe(true);
  });

  it('no DROP statements', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|CONSTRAINT)\b/i);
  });

  it('no FOREIGN KEY constraints on contract_id columns (soft FK pattern)', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    // PRIMARY KEY is allowed; FOREIGN KEY clauses (declared via ADD CONSTRAINT or inline REFERENCES) are not.
    expect(sql).not.toMatch(/\bFOREIGN\s+KEY\b/i);
    expect(sql).not.toMatch(/REFERENCES\s+\w+\s*\(/i);
  });

  it('uses IF NOT EXISTS for idempotency', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS');
  });

  it('comment annotates Sibling D ownership', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    expect(sql).toContain('COMMENT ON TABLE contract_chain_links');
    expect(sql).toContain('Sibling D');
  });
});
