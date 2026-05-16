import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const MIGRATION = join(REPO_ROOT, 'database', 'migrations', '20260516140000_add_goal_evaluator_verdicts.sql');

describe('goal_evaluator_verdicts table migration shape', () => {
  const sql = readFileSync(MIGRATION, 'utf8');

  it('CREATE TABLE with all required columns', () => {
    expect(sql).toMatch(/prompt\s+TEXT\s+NOT\s+NULL/);
    expect(sql).toMatch(/prompt_hash\s+TEXT\s+NOT\s+NULL/);
    expect(sql).toMatch(/verdict\s+TEXT\s+NOT\s+NULL/);
    expect(sql).toMatch(/votes\s+JSONB/);
    expect(sql).toMatch(/vocab_version\s+TEXT\s+NOT\s+NULL/);
    expect(sql).toMatch(/schema_version\s+TEXT\s+NOT\s+NULL/);
    expect(sql).toMatch(/correlation_id\s+UUID/);
    expect(sql).toMatch(/audit_log_id\s+UUID/);
    expect(sql).toMatch(/smoke_test_passed_at\s+TIMESTAMPTZ/);
    expect(sql).toMatch(/runtime_observed_at\s+TIMESTAMPTZ/);
  });

  it('CHECK constraint on verdict accepts only 4 enum values', () => {
    expect(sql).toMatch(/verdict\s+IN\s*\(\s*'PASS','UNANIMITY_FAIL','CONTRACT_MALFORMED','CONTRACT_MISSING'\s*\)/);
  });

  it('RLS enabled; INSERT-only policy', () => {
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toMatch(/FOR\s+INSERT/i);
    expect(sql).not.toMatch(/FOR\s+(UPDATE|DELETE)\s+TO/i);
  });

  it('4 indexes present', () => {
    expect(sql).toMatch(/INDEX.*goal_evaluator_verdicts.*sd_key/i);
    expect(sql).toMatch(/INDEX.*goal_evaluator_verdicts.*created_at/i);
    expect(sql).toMatch(/INDEX.*goal_evaluator_verdicts.*correlation_id/i);
    expect(sql).toMatch(/INDEX.*goal_evaluator_verdicts.*prompt_hash/i);
  });
});
