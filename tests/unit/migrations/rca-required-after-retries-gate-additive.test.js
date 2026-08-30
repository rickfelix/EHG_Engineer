/**
 * SD-ALTIFYAI-LEO-FIX-ENFORCE-RATIFIED-RETRY-001 — static additive-only guard for the
 * app_config seeding migration (mirrors the precedent used for other single-INSERT
 * app_config seeds this repo already ships this way).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATION_PATH = path.resolve(__dirname, '../../../database/migrations/20260830_rca_required_after_retries_gate.sql');
const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

describe('20260830_rca_required_after_retries_gate.sql — additive-only static guard', () => {
  it('contains no destructive DDL (DROP TABLE/COLUMN, TRUNCATE, DELETE outside the rollback comment)', () => {
    const bodyOnly = sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
    const destructive = /\bDROP\s+(TABLE|COLUMN)\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i;
    expect(bodyOnly).not.toMatch(destructive);
  });

  it('the insert uses ON CONFLICT DO NOTHING (idempotent, never fails on re-apply)', () => {
    expect(sql).toMatch(/ON CONFLICT\s*\(key\)\s*DO NOTHING/i);
  });

  it('carries an @approved-by header for the migration-apply ceremony', () => {
    expect(sql).toMatch(/^-- @approved-by:\s+\S+@\S+/m);
  });

  it('seeds exactly the key this gate reads (CONFIG_KEY in the gate module)', () => {
    expect(sql).toMatch(/'rca\.required_after_retries\.enforcement_mode'/);
  });
});
