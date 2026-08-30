/**
 * SD-LEO-INFRA-OPEN-COMMITMENTS-RECONCILED-001 / FR-3 — static additive-only guard for the
 * commitments table migration.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATION_PATH = path.resolve(__dirname, '../../../database/migrations/20260830_commitments_table.sql');
const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

describe('20260830_commitments_table.sql — additive-only static guard', () => {
  it('contains no destructive DDL (DROP TABLE/COLUMN, TRUNCATE, DELETE outside the rollback comment)', () => {
    const bodyOnly = sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
    const destructive = /\bDROP\s+(TABLE|COLUMN)\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i;
    expect(bodyOnly).not.toMatch(destructive);
  });

  it('uses CREATE TABLE IF NOT EXISTS (idempotent, never fails on re-apply)', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS commitments/i);
  });

  it('carries an @approved-by header for the migration-apply ceremony', () => {
    expect(sql).toMatch(/^-- @approved-by:\s+\S+@\S+/m);
  });

  it('defines exactly the columns the FR-3 writer/reader contract expects', () => {
    for (const col of ['owner_session', 'counterparty_session', 'subject', 'due_by', 'resolved_at', 'resolution']) {
      expect(sql).toMatch(new RegExp(col, 'i'));
    }
  });
});
