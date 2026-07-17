/**
 * SD-LEO-INFRA-EVA-CONSULTANT-GENERATOR-001 (FR-5, TS-8) — the new migration must classify
 * as tier-1/delegatable so it never blocks on the chairman gate that caught the sibling
 * SD-LEO-INFRA-GAUGE-FINDING-KNOWN-STATE-ACK-001 migration (which failed classification at
 * its own BEGIN; wrapper before even reaching its policy statements).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { classifyMigration } from '../../../../scripts/lib/migration-tier-classifier.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../../');
const MIGRATION_PATH = resolve(REPO_ROOT, 'database/migrations/20260717_eva_consultant_recommendations_dedup.sql');

describe('20260717_eva_consultant_recommendations_dedup.sql migration tier (TS-8)', () => {
  it('classifies as tier-1/delegatable (no chairman gate required)', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    const result = classifyMigration(sql);
    expect(result.tier).toBe(1);
    expect(result.reason).toBe('all_statements_provably_additive');
  });

  it('contains no BEGIN/COMMIT transaction wrapper and no policy/RLS statements', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    expect(sql).not.toMatch(/^\s*BEGIN\s*;/im);
    expect(sql).not.toMatch(/CREATE\s+POLICY/i);
    expect(sql).not.toMatch(/ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
  });

  it('all new columns are added via ADD COLUMN IF NOT EXISTS with no REFERENCES clause (stays out of the FK-exclusion rule)', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    const addColumnLines = sql.match(/ADD COLUMN IF NOT EXISTS[^;]+;/gi) || [];
    expect(addColumnLines.length).toBe(3);
    for (const line of addColumnLines) {
      expect(line.toUpperCase()).not.toContain('REFERENCES');
    }
  });
});
