import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const MIGRATION = join(REPO_ROOT, 'database', 'migrations', '20260516150001_add_d_app_feature_flag.sql');

describe('D-app feature flag migration default OFF', () => {
  const sql = readFileSync(MIGRATION, 'utf8');

  it('INSERT INTO app_config with key=contract_chain_d_app_enabled', () => {
    expect(sql).toContain("'contract_chain_d_app_enabled'");
  });

  it('default value contains enabled: false', () => {
    expect(sql).toMatch(/"enabled":\s*false/);
  });

  it('idempotent via ON CONFLICT DO NOTHING', () => {
    expect(sql).toContain('ON CONFLICT (key) DO NOTHING');
  });

  it('value is JSONB-typed', () => {
    expect(sql).toMatch(/::jsonb/i);
  });
});
