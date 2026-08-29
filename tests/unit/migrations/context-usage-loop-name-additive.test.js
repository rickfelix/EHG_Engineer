/**
 * SD-LEO-INFRA-BURN-TELEMETRY-PER-001-C FR-2/FR-4 (TS-8): static additive-only guard for the
 * new migration — a plain text/AST-free check (no live DB required, unlike the tests/ddl/
 * *.db.test.js precedents) since the point is only "this file cannot destroy existing data."
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATION_PATH = path.resolve(__dirname, '../../../database/migrations/20260829_context_usage_loop_name.sql');
const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

describe('20260829_context_usage_loop_name.sql — additive-only static guard', () => {
  it('contains no destructive DDL (DROP TABLE/COLUMN, TRUNCATE, DELETE)', () => {
    const destructive = /\bDROP\s+(TABLE|COLUMN)\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i;
    expect(sql).not.toMatch(destructive);
  });

  it('the column addition uses IF NOT EXISTS (idempotent, never fails on re-apply)', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS\s+loop_name/i);
  });

  it('views use CREATE OR REPLACE (idempotent, never a destructive re-create)', () => {
    expect(sql).toMatch(/CREATE OR REPLACE VIEW v_context_usage_by_seat/i);
    expect(sql).toMatch(/CREATE OR REPLACE VIEW v_context_usage_by_loop/i);
  });

  it('does not alter or drop any existing column other than adding the new one', () => {
    expect(sql).not.toMatch(/ALTER COLUMN/i);
    expect(sql).not.toMatch(/DROP CONSTRAINT/i);
  });
});
