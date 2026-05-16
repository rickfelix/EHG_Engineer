import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const MIGRATION = join(REPO_ROOT, 'database', 'migrations', '20260516130002_add_witnesses_view.sql');

describe('Sibling A writer_consumer_asymmetry_witnesses VIEW', () => {
  const sql = readFileSync(MIGRATION, 'utf8');

  it('is a plain VIEW (NOT MATERIALIZED)', () => {
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+VIEW/i);
    expect(sql).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?MATERIALIZED\s+VIEW/i);
  });

  it('aggregates from 3 distinct sources with UNION ALL', () => {
    const unionMatches = sql.match(/UNION\s+ALL/gi);
    expect(unionMatches?.length).toBe(2); // 3 sources = 2 UNION ALL joins
  });

  it('first source: unpaired_bypass from bypass_ledger.audit_log_id IS NULL', () => {
    expect(sql).toContain("'unpaired_bypass'");
    expect(sql).toContain('bypass_ledger');
    expect(sql).toMatch(/audit_log_id\s+IS\s+NULL/i);
  });

  it('second source: abandoned_chain from scope_completion_chain', () => {
    expect(sql).toContain("'abandoned_chain'");
    expect(sql).toContain('scope_completion_chain');
    expect(sql).toContain('abandoned');
  });

  it('third source: pattern_witness from validation_audit_log', () => {
    expect(sql).toContain("'pattern_witness'");
    expect(sql).toContain('validation_audit_log');
  });

  it('90-day rolling window applied to all 3 sources', () => {
    const matches = sql.match(/INTERVAL\s+'90\s+days'/gi);
    expect(matches?.length).toBeGreaterThanOrEqual(3);
  });

  it('exposes witness_source column distinguishing the 3 sources', () => {
    expect(sql).toContain('witness_source');
  });
});
