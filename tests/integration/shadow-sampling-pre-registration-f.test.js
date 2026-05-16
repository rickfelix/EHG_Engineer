import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const MIGRATION = join(REPO_ROOT, 'database', 'migrations', '20260516160000_add_shadow_sampling_protocol.sql');

describe('Sibling F shadow-sampling protocol migration', () => {
  const sql = readFileSync(MIGRATION, 'utf8');

  it('INSERTs app_config row child_f_shadow_sampling_protocol', () => {
    expect(sql).toContain("'child_f_shadow_sampling_protocol'");
  });

  it('stores lineage_attribution_confidence as number (CRO Residual Risk #1)', () => {
    expect(sql).toMatch(/"lineage_attribution_confidence_storage":\s*"number"/);
  });

  it('protocol_version 1.0.0 + requires_pre_registration true', () => {
    expect(sql).toMatch(/"protocol_version":\s*"1\.0\.0"/);
    expect(sql).toMatch(/"requires_pre_registration":\s*true/);
  });

  it('also INSERTs child_f_completed scaffold for parent unblock signal (FR-F-5)', () => {
    expect(sql).toContain("'child_f_completed'");
    expect(sql).toMatch(/"signal_at":\s*null/);
    expect(sql).toMatch(/"status":\s*"pending"/);
  });

  it('ON CONFLICT DO NOTHING (idempotent)', () => {
    const matches = sql.match(/ON CONFLICT.*DO NOTHING/gi);
    expect(matches?.length).toBeGreaterThanOrEqual(2);
  });
});
