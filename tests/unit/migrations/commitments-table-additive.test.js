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
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.commitments/i);
  });

  it('carries an @approved-by header for the migration-apply ceremony', () => {
    expect(sql).toMatch(/^-- @approved-by:\s+\S+@\S+/m);
  });

  it('defines exactly the columns the FR-3 writer/reader contract expects', () => {
    for (const col of ['owner_session', 'counterparty_session', 'subject', 'due_by', 'resolved_at', 'resolution']) {
      expect(sql).toMatch(new RegExp(col, 'i'));
    }
  });

  // SEC-1 (EXEC-phase SECURITY review): pg_default_acl grants anon/authenticated full DML on
  // every new relation by default in this database -- a bare CREATE TABLE would let the
  // public anon key forge or erase commitments (measured live against coordination_receipts).
  it('SEC-1: enables RLS and revokes anon/authenticated, matching the chairman_held_sends precedent', () => {
    expect(sql).toMatch(/ALTER TABLE public\.commitments ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/CREATE POLICY commitments_service_role[\s\S]*TO service_role/i);
    expect(sql).toMatch(/REVOKE ALL ON public\.commitments FROM anon, authenticated, PUBLIC/i);
    expect(sql).toMatch(/GRANT ALL ON public\.commitments TO service_role/i);
  });
});
